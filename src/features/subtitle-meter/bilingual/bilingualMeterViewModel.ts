import { detectIssues } from "../analyzers/issueDetector";
import {
  autoPair,
  buildEntries,
  linkCues,
  mergeCue as mergeCueInLinks,
  rebuildAutoLinks,
  splitCue as splitCueInLinks,
  unlink as unlinkInLinks,
} from "../bilingual/cueMatcher";
import {
  buildMergedCues,
  formatSplitTrack,
} from "../bilingual/bilingualExporter";
import {
  bilingualProjectId,
  DEFAULT_RULES,
  isBilingualProject,
  type BilingualProject,
  type BilingualVersion,
  type LanguageTrack,
  type MergeTimingBase,
  type PairingResult,
  type PairingRules,
  type PairLink,
  type TrackLanguage,
} from "../bilingual/models";
import type { Format, SubtitleCue, SubtitleIssue } from "../models";
import { detectFormat, parseSubtitles } from "../parsers/subtitleParser";
import { bilingualRepository } from "../repositories/bilingualRepository";
import { downloadTextFile } from "../services/exportService";
import { readTextFile } from "../services/fileService";

export interface BilingualSelection {
  /** 配对视图中的行：link.id，或未配对行的 cue:${track}:${cueId}。 */
  entryKey: string | null;
  track: TrackLanguage | null;
  cueId: string | null;
}

export interface BilingualMeterState {
  phase: "empty" | "importing" | "ready" | "editing" | "exporting" | "error";
  project: BilingualProject | null;
  pairing: PairingResult | null;
  foreignIssues: SubtitleIssue[];
  chineseIssues: SubtitleIssue[];
  drafts: Partial<Record<TrackLanguage, LanguageTrack>>;
  selection: BilingualSelection;
  notice: string;
  zoom: number;
}

const emptyBilingualState = (): BilingualMeterState => ({
  phase: "empty",
  project: null,
  pairing: null,
  foreignIssues: [],
  chineseIssues: [],
  drafts: {},
  selection: { entryKey: null, track: null, cueId: null },
  notice: "",
  zoom: 1,
});

export const entryKeyForCue = (track: TrackLanguage, cueId: string) =>
  `cue:${track}:${cueId}`;

export class BilingualMeterViewModel {
  state: BilingualMeterState = emptyBilingualState();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private publish(patch: Partial<BilingualMeterState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private recompute(project: BilingualProject) {
    return {
      pairing: buildEntries(
        project.foreign,
        project.chinese,
        project.links,
        project.rules,
      ),
      foreignIssues: detectIssues(project.foreign.cues, "foreign", "f:"),
      chineseIssues: detectIssues(project.chinese.cues, "chinese", "c:"),
    };
  }

  private async commit(
    project: BilingualProject,
    phase: BilingualMeterState["phase"] = "editing",
  ) {
    project.updatedAt = Date.now();
    this.publish({ project, ...this.recompute(project), phase, notice: "" });
    try {
      await bilingualRepository.save(project);
    } catch {
      if (this.state.project?.updatedAt === project.updatedAt)
        this.publish({
          phase: "error",
          notice: "本地保存失败；修改仍保留在页面中，请导出备份",
        });
    }
  }

  async restore() {
    try {
      const stored = await bilingualRepository.load();
      const project = stored ? hydrateBilingualProject(stored) : null;
      if (project)
        this.publish({
          project,
          ...this.recompute(project),
          phase: "ready",
          notice: "已恢复上次的双语项目",
        });
    } catch {
      this.publish({ notice: "本地双语项目暂时无法读取，可重新导入" });
    }
  }

  /** 导入一条语言轨；两条轨齐备时自动按容差配对并建项。 */
  async importTrack(file: File, language: TrackLanguage) {
    if (this.state.project) {
      this.publish({
        phase: "error",
        notice: "双语项目已存在；如需重导请先清空当前项目",
      });
      return;
    }
    this.publish({ phase: "importing", notice: `正在解析${language === "foreign" ? "外语" : "中文"}字幕…` });
    try {
      const format = detectFormat(file.name),
        text = await readTextFile(file),
        cues = parseSubtitles(text, format);
      const track: LanguageTrack = { language, fileName: file.name, format, cues };
      const drafts = { ...this.state.drafts, [language]: track };
      if (drafts.foreign && drafts.chinese) {
        const project: BilingualProject = {
          id: bilingualProjectId,
          name: drafts.chinese.fileName,
          foreign: drafts.foreign,
          chinese: drafts.chinese,
          links: autoPair(drafts.foreign.cues, drafts.chinese.cues, DEFAULT_RULES),
          rules: { ...DEFAULT_RULES },
          updatedAt: Date.now(),
          versions: [],
        };
        this.publish({ drafts: {}, notice: "" });
        await this.commit(project, "ready");
        this.publish({ notice: this.pairingNotice() });
      } else {
        this.publish({
          drafts,
          phase: "ready",
          notice: `${language === "foreign" ? "外语" : "中文"}轨已载入 ${cues.length} 条，等待另一份字幕`,
        });
      }
    } catch (error) {
      this.publish({
        phase: "error",
        notice: error instanceof Error ? error.message : "导入失败，请检查文件后重试",
      });
    }
  }

  private pairingNotice(): string {
    const p = this.state.pairing;
    if (!p) return "";
    const unresolved = p.drift + p.foreignOnly + p.chineseOnly;
    return unresolved
      ? `自动配对完成：${p.matched} 条已配，${p.drift} 条偏差过大，${p.foreignOnly + p.chineseOnly} 条待人工处理`
      : `自动配对完成：${p.matched} 条全部配上`;
  }

  async clearProject() {
    this.state = emptyBilingualState();
    this.listeners.forEach((listener) => listener());
    try {
      await bilingualRepository.clear();
    } catch {
      this.publish({ notice: "本地记录未能删除，可重新导入后覆盖" });
    }
  }

  selectCue(track: TrackLanguage, cueId: string) {
    const link = this.state.project?.links.find(
      (item) => item.foreignIds.includes(cueId) || item.chineseIds.includes(cueId),
    );
    this.publish({
      selection: {
        entryKey: link?.id ?? entryKeyForCue(track, cueId),
        track,
        cueId,
      },
    });
  }

  setZoom(zoom: number) {
    this.publish({ zoom });
  }

  /** 编辑某条轨上的条目；配对关系保持，偏差在下一帧的配对视图中即时重算。 */
  async editCue(
    track: TrackLanguage,
    cueId: string,
    patch: Partial<Pick<SubtitleCue, "text" | "startMs" | "endMs">>,
  ) {
    const project = this.state.project;
    if (!project) return;
    const target = track === "foreign" ? "foreign" : "chinese";
    const cues = project[target].cues.map((cue) =>
      cue.id === cueId ? { ...cue, ...patch } : cue,
    );
    await this.commit({ ...project, [target]: { ...project[target], cues } });
  }

  /** 人工新建关系（两侧各选若干未配对条目）。 */
  async createPair(foreignCueIds: string[], chineseCueIds: string[]) {
    const project = this.state.project;
    if (!project) return;
    const links = linkCues(
      project.links,
      foreignCueIds,
      chineseCueIds,
      project.foreign,
      project.chinese,
    );
    await this.commit({ ...project, links });
    this.publish({ notice: "已新建双语配对" });
  }

  /** 把未配对或其它关系上的条目并入指定关系。 */
  async mergeCue(targetLinkId: string, cueId: string, track: TrackLanguage) {
    const project = this.state.project;
    if (!project) return;
    await this.commit({
      ...project,
      links: mergeCueInLinks(project.links, targetLinkId, cueId, track),
    });
    this.publish({ notice: "已并入该配对" });
  }

  /** 从多对一关系中拆出单条条目（回到未配对）。 */
  async splitCue(linkId: string, cueId: string) {
    const project = this.state.project;
    if (!project) return;
    await this.commit({
      ...project,
      links: splitCueInLinks(project.links, linkId, cueId),
    });
  }

  /** 解除整条配对关系。 */
  async unlink(linkId: string) {
    const project = this.state.project;
    if (!project) return;
    await this.commit({ ...project, links: unlinkInLinks(project.links, linkId) });
  }

  /** 调整容差或轨序：容差变化后重算自动配对，人工关系保留；轨序仅影响导出。 */
  async setRules(patch: Partial<PairingRules>) {
    const project = this.state.project;
    if (!project) return;
    const rules = { ...project.rules, ...patch };
    if (
      patch.toleranceMs !== undefined &&
      patch.toleranceMs !== project.rules.toleranceMs
    ) {
      await this.commit({
        ...project,
        rules,
        links: rebuildAutoLinks(
          project.foreign.cues,
          project.chinese.cues,
          project.links,
          rules,
        ),
      });
      this.publish({ notice: "已按新容差重新自动配对，人工配对予以保留" });
      return;
    }
    await this.commit({ ...project, rules });
  }

  async saveVersion() {
    const project = this.state.project;
    if (!project) return;
    const version: BilingualVersion = {
      id: `bv-${Date.now()}`,
      label: `双语快照 ${project.versions.length + 1}`,
      savedAt: Date.now(),
      foreign: structuredClone(project.foreign),
      chinese: structuredClone(project.chinese),
      links: structuredClone(project.links),
    };
    await this.commit({ ...project, versions: [...project.versions, version] });
    this.publish({ notice: "已保存双语快照（双轨时间轴与配对关系）" });
  }

  async restoreVersion(id: string) {
    const project = this.state.project;
    const version = project?.versions.find((item) => item.id === id);
    if (!project || !version) return;
    await this.commit({
      ...project,
      foreign: structuredClone(version.foreign),
      chinese: structuredClone(version.chinese),
      links: structuredClone(version.links),
    });
    this.publish({ notice: `已恢复${version.label}` });
  }

  async exportMerged(format: Format, base: MergeTimingBase = "union") {
    const project = this.state.project;
    if (!project) return;
    this.publish({ phase: "exporting" });
    try {
      const cues = buildMergedCues(project, base);
      const baseName = project.name.replace(/\.(srt|vtt)$/i, "");
      downloadTextFile(
        `${baseName}-bilingual.${format}`,
        cues,
        format,
      );
      this.publish({
        phase: "ready",
        notice: `已导出双语交付文件（${project.rules.topLanguage === "foreign" ? "外上中下" : "中上外下"}）`,
      });
    } catch {
      this.publish({ phase: "error", notice: "合并导出失败，编辑内容已保留" });
    }
  }

  async exportSplit() {
    const project = this.state.project;
    if (!project) return;
    this.publish({ phase: "exporting" });
    try {
      (["foreign", "chinese"] as const).forEach((side) => {
        const file = formatSplitTrack(project, side);
        const track = side === "foreign" ? project.foreign : project.chinese;
        downloadTextFile(
          `${file.fileName.replace(/\.(srt|vtt)$/i, "")}-split.${file.format}`,
          track.cues,
          file.format,
        );
      });
      this.publish({ phase: "ready", notice: "已拆回外语、中文两份独立字幕" });
    } catch {
      this.publish({ phase: "error", notice: "拆分导出失败，编辑内容已保留" });
    }
  }
}

export function hydrateBilingualProject(value: unknown): BilingualProject | null {
  if (!isBilingualProject(value)) return null;
  return { ...value, rules: { ...DEFAULT_RULES, ...value.rules } };
}

export type { PairLink };
export const createBilingualViewModel = () => new BilingualMeterViewModel();
