import type { Format, SubtitleCue } from "../models";
import { formatSubtitles } from "../formatters/subtitleFormatter";
function download(
  name: string,
  cues: SubtitleCue[],
  format: Format,
  suffix: string,
): void {
  const blob = new Blob([formatSubtitles(cues, format)], {
    type:
      format === "vtt" ? "text/vtt;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/\.(srt|vtt)$/i, "")}${suffix}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
export function downloadSubtitles(
  name: string,
  cues: SubtitleCue[],
  format: Format,
): void {
  download(name, cues, format, "-checked");
}
export function downloadTextFile(
  name: string,
  cues: SubtitleCue[],
  format: Format,
): void {
  download(name, cues, format, "");
}
