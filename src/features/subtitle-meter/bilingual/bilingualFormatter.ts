import type { Format } from "../models";
import { formatTimestamp } from "../parsers/timecode";
import type {
  BilingualLanguage,
  BilingualPair,
  BilingualTrack,
  TrackOrder,
} from "./bilingualModels";
import { getCueMaps, orderedPairs } from "./bilingualPairing";

function formatBlock(
  index: number,
  startMs: number,
  endMs: number,
  text: string,
  format: Format,
  idHint: string,
): string {
  return `${format === "srt" ? index : idHint}\n${formatTimestamp(startMs, format)} --> ${formatTimestamp(endMs, format)}\n${text}`;
}

/**
 * 合并为双语交付字幕：
 * 同一条配对的两行文本按轨序排列（en-first 即外语在上、中文在下）；
 * 时间码取两侧并集（最早开始、最晚结束），缺失的一侧留空行以保留两行版式。
 */
export function formatBilingualMerged(
  pairs: BilingualPair[],
  tracks: Record<BilingualLanguage, BilingualTrack>,
  order: TrackOrder,
  format: Format,
): string {
  const maps = getCueMaps(tracks);
  const upper: BilingualLanguage = order === "en-first" ? "en" : "zh",
    lower: BilingualLanguage = order === "en-first" ? "zh" : "en";
  const body = orderedPairs(pairs, tracks)
    .map((pair, i) => {
      const upperCue = cueBySide(pair, upper, maps),
        lowerCue = cueBySide(pair, lower, maps);
      const times = [upperCue, lowerCue].filter(Boolean);
      const startMs = Math.min(...times.map((cue) => cue!.startMs)),
        endMs = Math.max(...times.map((cue) => cue!.endMs));
      const text = `${upperCue?.text ?? ""}\n${lowerCue?.text ?? ""}`;
      return formatBlock(i + 1, startMs, endMs, text, format, pair.id);
    })
    .join("\n\n");
  return format === "vtt" ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}

function cueBySide(
  pair: BilingualPair,
  language: BilingualLanguage,
  maps: ReturnType<typeof getCueMaps>,
) {
  const id = language === "en" ? pair.enId : pair.zhId;
  return id ? maps[language].get(id) : undefined;
}

/** 拆回单语字幕：各自使用本轨的时间码、文本与原格式 */
export function formatTrack(track: BilingualTrack): string {
  const format = track.format;
  const body = [...track.cues]
    .sort((a, b) => a.startMs - b.startMs)
    .map((cue, i) =>
      formatBlock(i + 1, cue.startMs, cue.endMs, cue.text, format, cue.id),
    )
    .join("\n\n");
  return format === "vtt" ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}
