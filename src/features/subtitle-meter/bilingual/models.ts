import type { Format, SubtitleCue } from "../models";

/** 一条语言轨：外语或中文。 */
export interface LanguageTrack {
  language: TrackLanguage;
  /** 原始文件名，用于拆分导出时的命名。 */
  fileName: string;
  format: Format;
  cues: SubtitleCue[];
}

export type TrackLanguage = "foreign" | "chinese";

/**
 * 配对关系。一条关系把两条轨上的若干条目绑在一起：
 * 常规情况下每侧各 1 条；人工「并入」后某一侧可能挂多条。
 */
export interface PairLink {
  id: string;
  foreignIds: string[];
  chineseIds: string[];
  /** auto = 容差内自动配对；manual = 人工新建/并入的结果。 */
  source: "auto" | "manual";
  /** 配对瞬间的起始时间偏差，供「偏差过大」复核；单位毫秒。 */
  driftMs: number;
}

/** 配对容差与轨序等可调规则。 */
export interface PairingRules {
  /** 起始时间偏差不超过该值才自动配对；单位毫秒。 */
  toleranceMs: number;
  /** 超过该偏差即使配上也标记为「偏差过大」；单位毫秒。 */
  driftWarnMs: number;
  /** 合并导出时哪条语言在上方。 */
  topLanguage: TrackLanguage;
}

export interface BilingualVersion {
  id: string;
  label: string;
  savedAt: number;
  foreign: LanguageTrack;
  chinese: LanguageTrack;
  links: PairLink[];
}

export interface BilingualProject {
  id: string;
  name: string;
  foreign: LanguageTrack;
  chinese: LanguageTrack;
  links: PairLink[];
  rules: PairingRules;
  updatedAt: number;
  versions: BilingualVersion[];
}

export type PairingStatus = "matched" | "drift" | "foreign-only" | "chinese-only";

export interface PairingEntry {
  link: PairLink | null;
  foreignCues: SubtitleCue[];
  chineseCues: SubtitleCue[];
  status: PairingStatus;
  /** 两侧起始时间的绝对偏差；单侧缺失时为 null。 */
  driftMs: number | null;
}

export interface PairingResult {
  /** 按时间合并排序后的配对视图，驱动时间轴与复核列表。 */
  entries: PairingEntry[];
  matched: number;
  drift: number;
  foreignOnly: number;
  chineseOnly: number;
}

export const DEFAULT_RULES: PairingRules = {
  toleranceMs: 500,
  driftWarnMs: 250,
  topLanguage: "foreign",
};

export const bilingualProjectId = "subtitle-meter.bilingual.v1";

/** 合并导出时每条双语字幕的时间基准。 */
export type MergeTimingBase = "foreign" | "chinese" | "union";

export function isBilingualProject(
  value: unknown,
): value is BilingualProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<BilingualProject>;
  return (
    !!project.foreign &&
    !!project.chinese &&
    Array.isArray(project.foreign.cues) &&
    Array.isArray(project.chinese.cues) &&
    Array.isArray(project.links) &&
    Array.isArray(project.versions)
  );
}
