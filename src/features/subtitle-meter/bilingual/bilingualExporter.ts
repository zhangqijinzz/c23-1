import type { Format, SubtitleCue } from "../models";
import { formatSubtitles } from "../formatters/subtitleFormatter";
import { buildEntries } from "./cueMatcher";
import { readingUnits } from "./languageProfile";
import type {
  BilingualProject,
  MergeTimingBase,
  PairingEntry,
} from "./models";

/** 同一侧多条条目并入一行时：外语按词间空格拼接，中文按行拼接。 */
function joinSideText(cues: SubtitleCue[], language: "foreign" | "chinese"): string {
  return cues
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join(language === "foreign" ? " " : "\n");
}

function entryTiming(entry: PairingEntry, base: MergeTimingBase) {
  const cues = [...entry.foreignCues, ...entry.chineseCues];
  const select = (pick: (cue: SubtitleCue) => number) =>
    cues.length ? Math.min(...cues.map(pick)) : 0;
  if (base === "foreign" && entry.foreignCues.length)
    return {
      startMs: Math.min(...entry.foreignCues.map((cue) => cue.startMs)),
      endMs: Math.max(...entry.foreignCues.map((cue) => cue.endMs)),
    };
  if (base === "chinese" && entry.chineseCues.length)
    return {
      startMs: Math.min(...entry.chineseCues.map((cue) => cue.startMs)),
      endMs: Math.max(...entry.chineseCues.map((cue) => cue.endMs)),
    };
  return { startMs: select((cue) => cue.startMs), endMs: Math.max(...cues.map((cue) => cue.endMs)) };
}

/**
 * 合并为一份双语交付字幕：上轨/下轨由 rules.topLanguage 决定，
 * 单侧未配对的条目保留为单行，不丢内容。
 */
export function buildMergedCues(
  project: BilingualProject,
  base: MergeTimingBase = "union",
): SubtitleCue[] {
  const { entries } = buildEntries(
    project.foreign,
    project.chinese,
    project.links,
    project.rules,
  );
  const top = project.rules.topLanguage;
  const bottom = top === "foreign" ? "chinese" : "foreign";
  const textFor = (entry: PairingEntry, side: "foreign" | "chinese") =>
    joinSideText(
      side === "foreign" ? entry.foreignCues : entry.chineseCues,
      side,
    );
  return entries
    .map((entry, i) => {
      const timing = entryTiming(entry, base);
      const lines = [textFor(entry, top), textFor(entry, bottom)].filter(
        Boolean,
      );
      return {
        id: entry.link?.id ?? `bi-cue-${i + 1}`,
        index: i + 1,
        startMs: timing.startMs,
        endMs: Math.max(timing.startMs + 1, timing.endMs),
        text: lines.join("\n"),
      };
    })
    .filter((cue) => cue.text.trim());
}

export function formatMerged(project: BilingualProject, format: Format, base: MergeTimingBase = "union"): string {
  return formatSubtitles(buildMergedCues(project, base), format);
}

/** 拆回两份独立字幕，时间轴为各轨当前值（含关联编辑后的结果）。 */
export function formatSplitTrack(
  project: BilingualProject,
  side: "foreign" | "chinese",
): { content: string; format: Format; fileName: string } {
  const track = side === "foreign" ? project.foreign : project.chinese;
  return {
    content: formatSubtitles(track.cues, track.format),
    format: track.format,
    fileName: track.fileName,
  };
}

/** 导出前体检：分别汇总两条轨的阅读量，字符绝不混算。 */
export function trackReadingSummary(project: BilingualProject) {
  const summarize = (
    cues: SubtitleCue[],
    language: "foreign" | "chinese",
  ) => ({
    units: cues.reduce((sum, cue) => sum + readingUnits(cue.text, language), 0),
    language,
  });
  return {
    foreign: summarize(project.foreign.cues, "foreign"),
    chinese: summarize(project.chinese.cues, "chinese"),
  };
}
