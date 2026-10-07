import type { Format } from "../models";

export type BilingualLanguage = "en" | "zh";
export type TrackOrder = "en-first" | "zh-first";
export type PairKind = "auto" | "manual";

export interface BilingualSettings {
  /** 自动配对允许的起始时间偏差（毫秒） */
  autoPairToleranceMs: number;
  /** 超过该偏差的自动配对需要人工复核（毫秒） */
  reviewThresholdMs: number;
  /** 轨序，同时决定合并导出时的行序：en-first 即外语在上、中文在下 */
  trackOrder: TrackOrder;
}

export interface BilingualCue {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface BilingualTrack {
  language: BilingualLanguage;
  format: Format;
  name: string;
  loaded: boolean;
  cues: BilingualCue[];
}

export interface BilingualPair {
  id: string;
  enId: string | null;
  zhId: string | null;
  /** auto：自动配对或未决项，可被重新配对；manual：人工确认，受保护 */
  kind: PairKind;
  /** 锁定时调整一侧时间会同步平移另一侧 */
  locked: boolean;
}

export interface BilingualVersion {
  id: string;
  label: string;
  savedAt: number;
  name: string;
  tracks: Record<BilingualLanguage, BilingualTrack>;
  pairs: BilingualPair[];
  settings: BilingualSettings;
}

export interface BilingualProject {
  id: string;
  name: string;
  tracks: Record<BilingualLanguage, BilingualTrack>;
  pairs: BilingualPair[];
  settings: BilingualSettings;
  /** 自增序号，用于生成新 cue / pair 的唯一 id */
  seq: number;
  updatedAt: number;
  versions: BilingualVersion[];
}

export type ReviewType = "unpaired" | "review-offset";

export interface ReviewItem {
  id: string;
  pairId: string;
  type: ReviewType;
  /** unpaired 时指示仅存在的一侧 */
  side: BilingualLanguage | null;
  offsetMs: number | null;
  message: string;
  orderMs: number;
}

export interface BilingualIssue {
  id: string;
  language: BilingualLanguage;
  cueId: string;
  type:
    | "overlap"
    | "too-short"
    | "too-fast"
    | "too-long"
    | "empty"
    | "invalid-time";
  severity: "info" | "warning" | "error";
  message: string;
}

export interface CueMetric {
  language: BilingualLanguage;
  cueId: string;
  /** 中文为汉字数，英文为单词数，两种语言分开统计 */
  units: number;
  durationSec: number;
  rate: number;
  rateLabel: string;
  lines: number;
}

export const BILINGUAL_STORAGE_ID = "subtitle-meter.bilingual.v1";

export const LANGUAGE_META: Record<
  BilingualLanguage,
  { label: string; short: string; rateUnit: string }
> = {
  en: { label: "英语（外语轨）", short: "EN", rateUnit: "词/秒" },
  zh: { label: "中文轨", short: "中", rateUnit: "字/秒" },
};

export const RATE_LIMIT: Record<BilingualLanguage, number> = {
  en: 3,
  zh: 18,
};

export const defaultBilingualSettings = (): BilingualSettings => ({
  autoPairToleranceMs: 1000,
  reviewThresholdMs: 1500,
  trackOrder: "en-first",
});

export const emptyTrack = (language: BilingualLanguage): BilingualTrack => ({
  language,
  format: "srt",
  name: "",
  loaded: false,
  cues: [],
});

export const emptyBilingualProject = (): BilingualProject => ({
  id: BILINGUAL_STORAGE_ID,
  name: "",
  tracks: { en: emptyTrack("en"), zh: emptyTrack("zh") },
  pairs: [],
  settings: defaultBilingualSettings(),
  seq: 0,
  updatedAt: 0,
  versions: [],
});
