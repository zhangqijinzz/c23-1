import type { Format } from "../models";
import { detectFormat, parseSubtitles } from "../parsers/subtitleParser";
import { readTextFile } from "../services/fileService";
import { detectBilingualIssues } from "./bilingualIssueDetector";
import {
  BILINGUAL_STORAGE_ID,
  defaultBilingualSettings,
  emptyBilingualProject,
  type BilingualCue,
  type BilingualIssue,
  type BilingualLanguage,
  type BilingualPair,
  type BilingualProject,
  type BilingualSettings,
  type BilingualTrack,
  type ReviewItem,
} from "./bilingualModels";
import {
  buildPairs,
  deriveReview,
  orderedPairs,
  rePairPairs,
  toTrackCues,
} from "./bilingualPairing";
import { bilingualRepository } from "./bilingualRepository";
import { formatBilingualMerged, formatTrack } from "./bilingualFormatter";
import {
  bilingualExportNames,
  downloadTextFile,
} from "./bilingualExportService";

export interface BilingualMeterState {
  phase: "empty" | "importing" | "ready" | "exporting" | "error";
  project: BilingualProject;
  review: ReviewItem[];
  issues: BilingualIssue[];
  selectedPairId: string | null;
  notice: string;
}

const emptyState = (): BilingualMeterState => ({
  phase: "empty",
  project: emptyBilingualProject(),
  review: [],
  issues: [],
  selectedPairId: null,
  notice: "",
});

type CuePatch = Partial<Pick<BilingualCue, "text" | "startMs" | "endMs">>;

export class BilingualMeterViewModel {
  state: BilingualMeterState = emptyState();
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;

  private publish(
    project: BilingualProject,
    patch?: Partial<BilingualMeterState>,
  ) {
    this.state = {
      ...this.state,
      project,
      review: deriveReview(project),
      issues: detectBilingualIssues(project.tracks),
      ...patch,
    };
    this.listeners.forEach((listener) => listener());
  }

  private async commit(
    draft: BilingualProject,
    patch?: Partial<BilingualMeterState>,
  ): Promise<BilingualProject> {
    const project: BilingualProject = { ...draft, updatedAt: Date.now() };
    this.publish(project, { phase: "ready", notice: "", ...patch });
    try {
      await bilingualRepository.save(project);
    } catch {
      if (this.state.project.updatedAt === project.updatedAt) {
        this.publish(project, {
          phase: "error",
          notice: "本地保存失败；当前修改仍保留在页面中，请导出备份",
        });
      }
    }
    return project;
  }

  private nextId(project: BilingualProject) {
    project.seq += 1;
    return `pair-${project.seq}`;
  }

  async restore() {
    const project = await bilingualRepository.load();
    if (project) {
      this.publish(project, {
        phase: "ready",
        selectedPairId: project.pairs[0]?.id ?? null,
        notice: "已恢复上次的双语项目",
      });
    }
  }

  /** 导入其中一条语言轨；两条轨齐备时自动按当前容差配对 */
  async importTrack(language: BilingualLanguage, file: File) {
    this.publish(this.state.project, {
      phase: "importing",
      notice: `正在解析${language === "en" ? "外语" : "中文"}字幕…`,
    });
    try {
      const format: Format = detectFormat(file.name),
        raw = await readTextFile(file),
        parsed = parseSubtitles(raw, format);
      const cues = toTrackCues(language, parsed);
      const project = structuredClone(this.state.project);
      project.tracks[language] = {
        language,
        format,
        name: file.name,
        loaded: true,
        cues,
      };
      project.name =
        language === "en"
          ? file.name
          : project.name || file.name.replace(/\.(srt|vtt)$/i, "") + "-zh";
      this.rebuildAfterImport(project);
      await this.commit(project, {
        selectedPairId: project.pairs[0]?.id ?? null,
        notice: `已解析 ${cues.length} 条${language === "en" ? "外语" : "中文"}字幕`,
      });
    } catch (error) {
      this.publish(this.state.project, {
        phase: "error",
        notice:
          error instanceof Error ? error.message : "导入失败，请检查文件后重试",
      });
    }
  }

  private rebuildAfterImport(project: BilingualProject) {
    const bothLoaded = project.tracks.en.loaded && project.tracks.zh.loaded,
      makeId = () => this.nextId(project);
    if (bothLoaded) {
      project.pairs = buildPairs(
        project.tracks,
        project.settings.autoPairToleranceMs,
        makeId,
      );
    } else {
      const language: BilingualLanguage = project.tracks.en.loaded
        ? "en"
        : "zh";
      project.pairs = project.tracks[language].cues.map((cue) => ({
        id: makeId(),
        enId: language === "en" ? cue.id : null,
        zhId: language === "zh" ? cue.id : null,
        kind: "auto" as const,
        locked: false,
      }));
    }
  }

  /** 重新导入某条轨：保留另一侧，自动配对重新计算 */
  async clearTrack(language: BilingualLanguage) {
    const project = structuredClone(this.state.project);
    project.tracks[language] = {
      ...project.tracks[language],
      format: "srt",
      name: "",
      loaded: false,
      cues: [],
    };
    this.rebuildAfterImport(project);
    await this.commit(project, {
      selectedPairId: project.pairs[0]?.id ?? null,
      notice: `已清空${language === "en" ? "外语" : "中文"}轨，可重新导入`,
    });
  }

  /** 按新容差重新配对；manual 条目（人工已决策）受保护 */
  async rerunAutoPairing(notice = "已按当前容差重新自动配对") {
    const project = structuredClone(this.state.project),
      makeId = () => this.nextId(project);
    project.pairs = rePairPairs(
      project.pairs,
      project.tracks,
      project.settings.autoPairToleranceMs,
      makeId,
    );
    await this.commit(project, { notice });
  }

  async setSettings(patch: Partial<BilingualSettings>) {
    const prev = this.state.project.settings,
      next = { ...prev, ...patch };
    const toleranceChanged =
      next.autoPairToleranceMs !== prev.autoPairToleranceMs;
    const project = structuredClone(this.state.project);
    project.settings = next;
    if (
      toleranceChanged &&
      project.tracks.en.loaded &&
      project.tracks.zh.loaded
    ) {
      project.pairs = rePairPairs(
        project.pairs,
        project.tracks,
        next.autoPairToleranceMs,
        () => this.nextId(project),
      );
    }
    await this.commit(project, {
      notice: toleranceChanged ? "容差已更新并重新配对" : "轨序规则已更新",
    });
  }

  async selectPair(id: string | null) {
    this.publish(this.state.project, { selectedPairId: id });
  }

  /**
   * 编辑某条轨上的 cue。
   * 该 cue 所在配对处于锁定且两侧齐备时，时间改动同步平移另一侧，
   * 对应关系保持不变，偏差即时重算。
   */
  async editCue(language: BilingualLanguage, cueId: string, patch: CuePatch) {
    const project = structuredClone(this.state.project);
    const track = project.tracks[language],
      cue = track.cues.find((item) => item.id === cueId);
    if (!cue) return;
    const pair = project.pairs.find(
      (item) => (language === "en" ? item.enId : item.zhId) === cueId,
    );
    let shiftStart: number | null = null,
      shiftEnd: number | null = null;
    if (patch.startMs !== undefined && patch.startMs !== cue.startMs)
      shiftStart = patch.startMs - cue.startMs;
    if (patch.endMs !== undefined && patch.endMs !== cue.endMs)
      shiftEnd = patch.endMs - cue.endMs;
    Object.assign(cue, patch);
    const otherLanguage: BilingualLanguage = language === "en" ? "zh" : "en",
      otherId = pair ? (language === "en" ? pair.zhId : pair.enId) : null;
    const other = otherId
      ? project.tracks[otherLanguage].cues.find((item) => item.id === otherId)
      : undefined;
    if (pair?.locked && other && (shiftStart !== null || shiftEnd !== null)) {
      if (shiftStart !== null)
        other.startMs = Math.max(0, other.startMs + shiftStart);
      if (shiftEnd !== null) other.endMs = Math.max(1, other.endMs + shiftEnd);
    }
    await this.commit(project, { selectedPairId: pair?.id ?? null });
  }

  /** 解锁的配对只改动被拖的一侧；锁定时走 editCue 的同步逻辑 */
  async setLock(pairId: string, locked: boolean) {
    const project = structuredClone(this.state.project);
    const pair = project.pairs.find((item) => item.id === pairId);
    if (!pair) return;
    pair.locked = locked;
    await this.commit(project, {
      notice: locked
        ? "已锁定：时间改动将联动另一轨"
        : "已解锁：两轨时间独立调整",
    });
  }

  /** 确认自动配对/偏差复核项：保留对应关系，标记为人工确认 */
  async acceptPair(pairId: string) {
    const project = structuredClone(this.state.project);
    const pair = project.pairs.find((item) => item.id === pairId);
    if (!pair) return;
    pair.kind = "manual";
    pair.locked = true;
    await this.commit(project, { notice: "已确认对应关系" });
  }

  /**
   * 新建（保留单侧）：该条目作为独立的语言条目存在，
   * 合并导出时另一行留空；标记 manual，后续重新配对不再处理它。
   */
  async confirmStandalone(pairId: string) {
    const project = structuredClone(this.state.project);
    const pair = project.pairs.find((item) => item.id === pairId);
    if (!pair) return;
    pair.kind = "manual";
    pair.locked = false;
    await this.commit(project, { notice: "已作为独立条目保留" });
  }

  /** 解除对应：双侧齐备的配对拆成两条单侧条目，回到自动待处理池 */
  async unlinkPair(pairId: string) {
    const project = structuredClone(this.state.project);
    const index = project.pairs.findIndex((item) => item.id === pairId);
    if (index < 0) return;
    const pair = project.pairs[index],
      halves: BilingualPair[] = [];
    if (pair.enId)
      halves.push({
        id: this.nextId(project),
        enId: pair.enId,
        zhId: null,
        kind: "auto",
        locked: false,
      });
    if (pair.zhId)
      halves.push({
        id: this.nextId(project),
        enId: null,
        zhId: pair.zhId,
        kind: "auto",
        locked: false,
      });
    project.pairs.splice(index, 1, ...halves);
    await this.commit(project, {
      selectedPairId: halves[0]?.id ?? null,
      notice: "已解除对应，两条条目回到待处理列表",
    });
  }

  /**
   * 并入：把单侧条目的文本与时间范围合并到目标配对同一侧；
   * 若目标该侧为空，则直接占用空槽并把整体转为人工确认。
   */
  async mergeIntoPair(sourcePairId: string, targetPairId: string) {
    if (sourcePairId === targetPairId) return;
    const project = structuredClone(this.state.project);
    const source = project.pairs.find((item) => item.id === sourcePairId),
      target = project.pairs.find((item) => item.id === targetPairId);
    if (!source || !target) return;
    const side: BilingualLanguage | null = source.enId
      ? "en"
      : source.zhId
        ? "zh"
        : null;
    if (!side) return;
    const sourceId = side === "en" ? source.enId! : source.zhId!,
      sourceCue = project.tracks[side].cues.find((cue) => cue.id === sourceId);
    if (!sourceCue) return;
    const targetId = side === "en" ? target.enId : target.zhId,
      targetCue = targetId
        ? project.tracks[side].cues.find((cue) => cue.id === targetId)
        : undefined;
    if (targetCue) {
      targetCue.text = `${targetCue.text}\n${sourceCue.text}`.trim();
      targetCue.startMs = Math.min(targetCue.startMs, sourceCue.startMs);
      targetCue.endMs = Math.max(targetCue.endMs, sourceCue.endMs);
    } else {
      if (side === "en") target.enId = sourceCue.id;
      else target.zhId = sourceCue.id;
      target.kind = "manual";
      target.locked = true;
    }
    project.tracks[side].cues = project.tracks[side].cues.filter(
      (cue) => cue.id !== sourceCue.id,
    );
    project.pairs = project.pairs.filter((item) => item.id !== sourcePairId);
    renumberTrack(project.tracks[side]);
    await this.commit(project, {
      selectedPairId: targetPairId,
      notice: targetCue
        ? "已并入目标条目（同侧文本合并）"
        : "已占用空槽并完成对应",
    });
  }

  /** 人工指定两个单侧条目互为对应（一英一中） */
  async linkLonePairs(enPairId: string, zhPairId: string) {
    if (enPairId === zhPairId) return;
    const project = structuredClone(this.state.project);
    const enPair = project.pairs.find((item) => item.id === enPairId),
      zhPair = project.pairs.find((item) => item.id === zhPairId);
    if (!enPair?.enId || !zhPair?.zhId || enPair.zhId || zhPair.enId) return;
    enPair.zhId = zhPair.zhId;
    enPair.kind = "manual";
    enPair.locked = true;
    project.pairs = project.pairs.filter((item) => item.id !== zhPairId);
    await this.commit(project, {
      selectedPairId: enPairId,
      notice: "已建立人工对应关系",
    });
  }

  /** 在指定轨上新建一条空字幕，并作为人工单侧条目 */
  async addCue(language: BilingualLanguage, startMs = 0) {
    const project = structuredClone(this.state.project);
    project.seq += 1;
    const cue: BilingualCue = {
      id: `${language}-cue-new-${project.seq}`,
      index: project.tracks[language].cues.length + 1,
      startMs,
      endMs: startMs + 1500,
      text: "",
    };
    project.tracks[language].cues.push(cue);
    renumberTrack(project.tracks[language]);
    const pair: BilingualPair = {
      id: `pair-new-${project.seq}`,
      enId: language === "en" ? cue.id : null,
      zhId: language === "zh" ? cue.id : null,
      kind: "manual",
      locked: false,
    };
    project.pairs.push(pair);
    project.pairs = orderedPairs(project.pairs, project.tracks);
    await this.commit(project, {
      selectedPairId: pair.id,
      notice: "已新建字幕条目",
    });
  }

  async saveVersion() {
    // 快照数据与活轨必须是两份互不共享的克隆，
    // 否则 structuredClone 会保留图内引用共享，后续编辑会污染历史快照。
    const snapshot = {
      id: `bv-${Date.now()}`,
      label: `双语快照 ${this.state.project.versions.length + 1}`,
      savedAt: Date.now(),
      name: this.state.project.name,
      tracks: structuredClone(this.state.project.tracks),
      pairs: structuredClone(this.state.project.pairs),
      settings: structuredClone(this.state.project.settings),
    };
    const project = structuredClone(this.state.project);
    project.versions = [...project.versions, snapshot];
    await this.commit(project, {
      notice: "已保存双语项目快照（双轨与对应关系）",
    });
  }

  async restoreVersion(id: string) {
    const snapshot = this.state.project.versions.find((item) => item.id === id);
    if (!snapshot) return;
    const project: BilingualProject = {
      ...structuredClone(this.state.project),
      name: snapshot.name,
      tracks: structuredClone(snapshot.tracks),
      pairs: structuredClone(snapshot.pairs),
      settings: structuredClone(snapshot.settings),
    };
    await this.commit(project, {
      notice: `已恢复${snapshot.label}`,
      selectedPairId: project.pairs[0]?.id ?? null,
    });
  }

  async exportMerged(format: Format) {
    const project = this.state.project;
    if (!project.pairs.length) return;
    this.publish(project, { phase: "exporting" });
    try {
      const content = formatBilingualMerged(
        project.pairs,
        project.tracks,
        project.settings.trackOrder,
        format,
      );
      downloadTextFile(
        `${bilingualExportNames(project).merged}.${format}`,
        content,
        format,
      );
      this.publish(project, { phase: "ready", notice: "双语合并字幕已导出" });
    } catch {
      this.publish(project, { phase: "error", notice: "合并导出失败，请重试" });
    }
  }

  async exportTrack(language: BilingualLanguage, format: Format) {
    const project = this.state.project;
    const track = project.tracks[language];
    if (!track.loaded || !track.cues.length) return;
    this.publish(project, { phase: "exporting" });
    try {
      const content = formatTrack({ ...track, format });
      downloadTextFile(
        `${language === "en" ? bilingualExportNames(project).en : bilingualExportNames(project).zh}.${format}`,
        content,
        format,
      );
      this.publish(project, {
        phase: "ready",
        notice: `${language === "en" ? "外语" : "中文"}轨独立字幕已导出`,
      });
    } catch {
      this.publish(project, { phase: "error", notice: "独立导出失败，请重试" });
    }
  }
}

function renumberTrack(track: BilingualTrack) {
  const ordered = [...track.cues].sort((a, b) => a.startMs - b.startMs);
  track.cues = ordered.map((cue, i) => ({ ...cue, index: i + 1 }));
}

export { BILINGUAL_STORAGE_ID, defaultBilingualSettings };
