import type { SubtitleCue } from "../models";
import type {
  LanguageTrack,
  PairingEntry,
  PairingResult,
  PairingRules,
  PairLink,
  TrackLanguage,
} from "./models";

let idCounter = 0;
export function nextPairId(existing: PairLink[]): string {
  const used = new Set(existing.map((link) => link.id));
  let candidate: string;
  do {
    idCounter += 1;
    candidate = `pair-${Date.now().toString(36)}-${idCounter}`;
  } while (used.has(candidate));
  return candidate;
}

/** 双指针按起始时间配对：容差内一一对应，配不上的跳过留给人工。 */
export function autoPair(
  foreign: SubtitleCue[],
  chinese: SubtitleCue[],
  rules: Pick<PairingRules, "toleranceMs">,
  existing: PairLink[] = [],
): PairLink[] {
  const f = [...foreign].sort((a, b) => a.startMs - b.startMs);
  const c = [...chinese].sort((a, b) => a.startMs - b.startMs);
  const links: PairLink[] = [];
  let i = 0,
    j = 0;
  while (i < f.length && j < c.length) {
    const driftMs = f[i].startMs - c[j].startMs;
    if (Math.abs(driftMs) <= rules.toleranceMs) {
      links.push({
        id: nextPairId([...existing, ...links]),
        foreignIds: [f[i].id],
        chineseIds: [c[j].id],
        source: "auto",
        driftMs,
      });
      i += 1;
      j += 1;
    } else if (f[i].startMs < c[j].startMs) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return links;
}

/**
 * 容差/规则调整后重建：人工关系全部保留，被人工占用的条目不再参与自动配对，
 * 其余条目按新容差重新自动配对。
 */
export function rebuildAutoLinks(
  foreign: SubtitleCue[],
  chinese: SubtitleCue[],
  links: PairLink[],
  rules: Pick<PairingRules, "toleranceMs">,
): PairLink[] {
  const manual = links.filter((link) => link.source === "manual");
  const claimed = new Set(manual.flatMap((link) => [...link.foreignIds, ...link.chineseIds]));
  const auto = autoPair(
    foreign.filter((cue) => !claimed.has(cue.id)),
    chinese.filter((cue) => !claimed.has(cue.id)),
    rules,
    manual,
  );
  return [...manual, ...auto];
}

function indexCues(track: LanguageTrack): Map<string, SubtitleCue> {
  return new Map(track.cues.map((cue) => [cue.id, cue]));
}

const linkDrift = (
  foreignCues: SubtitleCue[],
  chineseCues: SubtitleCue[],
): number | null => {
  if (!foreignCues.length || !chineseCues.length) return null;
  const fStart = Math.min(...foreignCues.map((cue) => cue.startMs));
  const cStart = Math.min(...chineseCues.map((cue) => cue.startMs));
  return Math.abs(fStart - cStart);
};

/** 把关系展开为按时间排序的配对视图；未配对条目各自成行。 */
export function buildEntries(
  foreign: LanguageTrack,
  chinese: LanguageTrack,
  links: PairLink[],
  rules: Pick<PairingRules, "driftWarnMs">,
): PairingResult {
  const fMap = indexCues(foreign),
    cMap = indexCues(chinese);
  const linkedForeign = new Set<string>(),
    linkedChinese = new Set<string>();
  const entries: PairingEntry[] = links.map((link) => {
    const foreignCues = link.foreignIds
        .map((id) => fMap.get(id))
        .filter((cue): cue is SubtitleCue => !!cue),
      chineseCues = link.chineseIds
        .map((id) => cMap.get(id))
        .filter((cue): cue is SubtitleCue => !!cue);
    foreignCues.forEach((cue) => linkedForeign.add(cue.id));
    chineseCues.forEach((cue) => linkedChinese.add(cue.id));
    const driftMs = linkDrift(foreignCues, chineseCues);
    return {
      link,
      foreignCues,
      chineseCues,
      driftMs,
      status:
        !foreignCues.length || !chineseCues.length
          ? !foreignCues.length
            ? "chinese-only"
            : "foreign-only"
          : driftMs !== null && driftMs > rules.driftWarnMs
            ? "drift"
            : "matched",
    };
  });
  foreign.cues
    .filter((cue) => !linkedForeign.has(cue.id))
    .forEach((cue) =>
      entries.push({
        link: null,
        foreignCues: [cue],
        chineseCues: [],
        driftMs: null,
        status: "foreign-only",
      }),
    );
  chinese.cues
    .filter((cue) => !linkedChinese.has(cue.id))
    .forEach((cue) =>
      entries.push({
        link: null,
        foreignCues: [],
        chineseCues: [cue],
        driftMs: null,
        status: "chinese-only",
      }),
    );
  entries.sort((a, b) => entryStartTime(a) - entryStartTime(b));
  const count = (status: PairingEntry["status"]) =>
    entries.filter((entry) => entry.status === status).length;
  return {
    entries,
    matched: count("matched"),
    drift: count("drift"),
    foreignOnly: count("foreign-only"),
    chineseOnly: count("chinese-only"),
  };
}

function entryStartTime(entry: PairingEntry): number {
  const cues = [...entry.foreignCues, ...entry.chineseCues];
  return cues.length ? Math.min(...cues.map((cue) => cue.startMs)) : 0;
}

/** 人工新建：把两侧条目绑成一条人工关系。 */
export function linkCues(
  links: PairLink[],
  foreignIds: string[],
  chineseIds: string[],
  foreignTrack: LanguageTrack,
  chineseTrack: LanguageTrack,
): PairLink[] {
  if (!foreignIds.length || !chineseIds.length) return links;
  const remaining = detachCues(links, [...foreignIds, ...chineseIds]);
  const fStart = Math.min(
    ...foreignIds
      .map((id) => foreignTrack.cues.find((cue) => cue.id === id)?.startMs)
      .filter((v): v is number => v !== undefined),
  );
  const cStart = Math.min(
    ...chineseIds
      .map((id) => chineseTrack.cues.find((cue) => cue.id === id)?.startMs)
      .filter((v): v is number => v !== undefined),
  );
  return [
    ...remaining,
    {
      id: nextPairId(remaining),
      foreignIds,
      chineseIds,
      source: "manual",
      driftMs: fStart - cStart,
    },
  ];
}

/**
 * 并入：把一条条目挂到目标关系上；若它原本属于另一条关系，
 * 先从原关系摘下，原关系因此变空则删除。
 */
export function mergeCue(
  links: PairLink[],
  targetId: string,
  cueId: string,
  side: TrackLanguage,
): PairLink[] {
  const target = links.find((link) => link.id === targetId);
  // 已在目标关系上时无需处理；cueId 在其它关系上时先摘下再挂入。
  if (!target) return links;
  const ids = side === "foreign" ? target.foreignIds : target.chineseIds;
  if (ids.includes(cueId)) return links;
  const without = detachCues(links, [cueId]);
  return without.map((link) => {
    if (link.id !== targetId) return link;
    const merged = [...ids, cueId];
    return side === "foreign"
      ? { ...link, foreignIds: merged, source: "manual" }
      : { ...link, chineseIds: merged, source: "manual" };
  });
}

/** 解除整条关系，两侧条目全部回到未配对。 */
export function unlink(links: PairLink[], linkId: string): PairLink[] {
  return links.filter((link) => link.id !== linkId);
}

/** 从多对关系中拆出单条条目；关系被掏空时一并删除。 */
export function splitCue(
  links: PairLink[],
  linkId: string,
  cueId: string,
): PairLink[] {
  return links
    .map((link) => {
      if (link.id !== linkId) return link;
      return {
        ...link,
        foreignIds: link.foreignIds.filter((id) => id !== cueId),
        chineseIds: link.chineseIds.filter((id) => id !== cueId),
        source: "manual" as const,
      };
    })
    .filter((link) => link.foreignIds.length || link.chineseIds.length);
}

function detachCues(links: PairLink[], cueIds: string[]): PairLink[] {
  const wanted = new Set(cueIds);
  return links
    .map((link) => ({
      ...link,
      foreignIds: link.foreignIds.filter((id) => !wanted.has(id)),
      chineseIds: link.chineseIds.filter((id) => !wanted.has(id)),
    }))
    .filter((link) => link.foreignIds.length || link.chineseIds.length);
}
