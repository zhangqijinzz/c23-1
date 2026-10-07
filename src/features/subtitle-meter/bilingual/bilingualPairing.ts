import type { SubtitleCue } from "../models";
import type {
  BilingualCue,
  BilingualLanguage,
  BilingualPair,
  BilingualProject,
  BilingualTrack,
  ReviewItem,
} from "./bilingualModels";

type TrackMap = Record<BilingualLanguage, BilingualTrack>;

export interface CueMaps {
  en: Map<string, BilingualCue>;
  zh: Map<string, BilingualCue>;
}

export function getCueMaps(tracks: TrackMap): CueMaps {
  const index = (cues: BilingualCue[]) =>
    new Map(cues.map((cue) => [cue.id, cue]));
  return { en: index(tracks.en.cues), zh: index(tracks.zh.cues) };
}

export function cueOfPair(
  pair: BilingualPair,
  language: BilingualLanguage,
  maps: CueMaps,
): BilingualCue | undefined {
  const id = language === "en" ? pair.enId : pair.zhId;
  return id ? maps[language].get(id) : undefined;
}

export function pairStart(pair: BilingualPair, maps: CueMaps): number {
  const en = pair.enId ? maps.en.get(pair.enId) : undefined,
    zh = pair.zhId ? maps.zh.get(pair.zhId) : undefined;
  return Math.min(en?.startMs ?? Infinity, zh?.startMs ?? Infinity);
}

/** 时间轴顺序：按任意一侧最早的起始时间排列 */
export function orderedPairs(
  pairs: BilingualPair[],
  tracks: TrackMap,
): BilingualPair[] {
  const maps = getCueMaps(tracks);
  return [...pairs].sort((a, b) => pairStart(a, maps) - pairStart(b, maps));
}

/** 导入时重新编号 cue id，避免两条轨 id 冲突 */
export function toTrackCues(
  language: BilingualLanguage,
  cues: SubtitleCue[],
): BilingualCue[] {
  return cues.map((cue, i) => ({
    id: `${language}-cue-${i + 1}`,
    index: i + 1,
    startMs: cue.startMs,
    endMs: cue.endMs,
    text: cue.text,
  }));
}

export function matchAvailable(
  tracks: TrackMap,
  toleranceMs: number,
  nextId: () => string,
  unavailable: ReadonlySet<string>,
): BilingualPair[] {
  const en = tracks.en.cues
      .filter((cue) => !unavailable.has(cue.id))
      .sort((a, b) => a.startMs - b.startMs),
    zh = tracks.zh.cues
      .filter((cue) => !unavailable.has(cue.id))
      .sort((a, b) => a.startMs - b.startMs);
  // 全局最近贪心：列出容差内全部候选边，按起始偏差升序，
  // 偏差最小的对应关系优先占用，保证 1:1 且不会被顺序更靠前的条目“抢走”最佳搭档。
  const edges = en
    .flatMap((enCue) =>
      zh.map((zhCue) => ({
        enCue,
        zhCue,
        delta: Math.abs(zhCue.startMs - enCue.startMs),
      })),
    )
    .filter((edge) => edge.delta <= toleranceMs)
    .sort((a, b) => a.delta - b.delta);
  const usedEn = new Set<string>(),
    usedZh = new Set<string>(),
    pairs: BilingualPair[] = [];
  for (const edge of edges) {
    if (usedEn.has(edge.enCue.id) || usedZh.has(edge.zhCue.id)) continue;
    usedEn.add(edge.enCue.id);
    usedZh.add(edge.zhCue.id);
    pairs.push({
      id: nextId(),
      enId: edge.enCue.id,
      zhId: edge.zhCue.id,
      kind: "auto",
      locked: true,
    });
  }
  for (const enCue of en) {
    if (!usedEn.has(enCue.id))
      pairs.push({
        id: nextId(),
        enId: enCue.id,
        zhId: null,
        kind: "auto",
        locked: false,
      });
  }
  for (const zhCue of zh) {
    if (!usedZh.has(zhCue.id))
      pairs.push({
        id: nextId(),
        enId: null,
        zhId: zhCue.id,
        kind: "auto",
        locked: false,
      });
  }
  return pairs;
}

/** 两轨都齐备后的首次配对：全局最近起始时间贪心，容差内 1:1 匹配 */
export function buildPairs(
  tracks: TrackMap,
  toleranceMs: number,
  nextId: () => string,
): BilingualPair[] {
  return orderedPairs(
    matchAvailable(tracks, toleranceMs, nextId, new Set()),
    tracks,
  );
}

/**
 * 调整容差后的重新配对：人工确认（manual）的配对与单语条目受保护，
 * 仅对剩余的 auto 条目重新执行匹配。
 */
export function rePairPairs(
  pairs: BilingualPair[],
  tracks: TrackMap,
  toleranceMs: number,
  nextId: () => string,
): BilingualPair[] {
  const protectedPairs = pairs.filter((pair) => pair.kind === "manual"),
    claimed = new Set<string>();
  for (const pair of protectedPairs) {
    if (pair.enId) claimed.add(pair.enId);
    if (pair.zhId) claimed.add(pair.zhId);
  }
  const rebuilt = matchAvailable(tracks, toleranceMs, nextId, claimed);
  return orderedPairs([...protectedPairs, ...rebuilt], tracks);
}

/** 只含单侧且没有被引用的 cue 候选（用于并入时检查目标配对槽位） */
export function findMergeTargets(
  source: BilingualPair,
  pairs: BilingualPair[],
  tracks: TrackMap,
): BilingualPair[] {
  const maps = getCueMaps(tracks),
    sourceStart = pairStart(source, maps);
  const language: BilingualLanguage | null = source.enId
    ? "en"
    : source.zhId
      ? "zh"
      : null;
  if (!language) return [];
  return pairs
    .filter((pair) => pair.id !== source.id)
    .sort(
      (a, b) =>
        Math.abs(pairStart(a, maps) - sourceStart) -
        Math.abs(pairStart(b, maps) - sourceStart),
    )
    .slice(0, 5);
}

/**
 * 派生需要人工处理的复核项：
 * - auto 且仅一侧存在 → unpaired（配不上）
 * - auto 且双侧起始偏差超过复核阈值 → review-offset（偏差过大）
 * manual 条目已经过人工决定，不再进入复核列表。
 */
export function deriveReview(project: BilingualProject): ReviewItem[] {
  if (!project.tracks.en.loaded || !project.tracks.zh.loaded) return [];
  const maps = getCueMaps(project.tracks),
    items: ReviewItem[] = [];
  for (const pair of project.pairs) {
    const en = pair.enId ? maps.en.get(pair.enId) : undefined,
      zh = pair.zhId ? maps.zh.get(pair.zhId) : undefined;
    if (pair.kind !== "auto") continue;
    if (en && zh) {
      const offsetMs = zh.startMs - en.startMs,
        absOffset = Math.abs(offsetMs);
      if (absOffset > project.settings.reviewThresholdMs) {
        items.push({
          id: `${pair.id}-offset`,
          pairId: pair.id,
          type: "review-offset",
          side: null,
          offsetMs,
          message: `两条起始时间相差 ${(absOffset / 1000).toFixed(2)} 秒，请确认是否为同一句`,
          orderMs: Math.min(en.startMs, zh.startMs),
        });
      }
    } else {
      const side: BilingualLanguage = en ? "en" : "zh",
        cue = en ?? zh!;
      items.push({
        id: `${pair.id}-unpaired`,
        pairId: pair.id,
        type: "unpaired",
        side,
        offsetMs: null,
        message: `${side === "en" ? "英语" : "中文"}第 ${cue.index} 条未在容差内找到对应条目`,
        orderMs: cue.startMs,
      });
    }
  }
  return items.sort((a, b) => a.orderMs - b.orderMs);
}
