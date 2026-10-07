import type { SubtitleCue } from "../models";
import type { TrackLanguage } from "./models";

/**
 * 阅读计量按语言分开：
 * - 中文轨按非空白字符计「字」；
 * - 外语轨按词计「词」（拉丁/数字序列，兼容词内撇号连字符）。
 * 两条轨的字符绝不混算。
 */
export function readingUnits(text: string, language: TrackLanguage): number {
  if (language === "chinese")
    return [...text.replace(/\s/g, "")].length;
  return (
    text.match(/[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  );
}

/** 行长占用：两种语言都按去空白字符计，各自独立调用。 */
export function visibleChars(text: string): number {
  return [...text.replace(/\s/g, "")].length;
}

export const READING_LIMIT: Record<
  TrackLanguage,
  { value: number; unit: string }
> = {
  chinese: { value: 18, unit: "字/秒" },
  foreign: { value: 3.5, unit: "词/秒" },
};

export function readingSpeed(
  cue: Pick<SubtitleCue, "text" | "startMs" | "endMs">,
  language: TrackLanguage,
): number {
  const seconds = Math.max(0.1, (cue.endMs - cue.startMs) / 1000);
  return readingUnits(cue.text, language) / seconds;
}

export function isTooFast(speed: number, language: TrackLanguage): boolean {
  return speed > READING_LIMIT[language].value;
}
