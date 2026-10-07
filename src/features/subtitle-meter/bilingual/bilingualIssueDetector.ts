import type {
  BilingualCue,
  BilingualIssue,
  BilingualLanguage,
  BilingualTrack,
} from "./bilingualModels";
import { cueMetric, isOverRate, maxLineWidth } from "./bilingualMetrics";

const LANGUAGE_TAG: Record<BilingualLanguage, string> = {
  en: "外语轨",
  zh: "中文轨",
};

const MAX_LINE_WIDTH: Record<BilingualLanguage, number> = { en: 42, zh: 21 };

/**
 * 问题检测在每条语言轨内部独立执行：
 * 阅读速度、行长阈值随语言取用，中文与英文的字符不合并统计。
 */
export function detectTrackIssues(
  cues: BilingualCue[],
  language: BilingualLanguage,
): BilingualIssue[] {
  const tag = LANGUAGE_TAG[language],
    issues: BilingualIssue[] = [];
  const add = (
    cue: BilingualCue,
    type: BilingualIssue["type"],
    severity: BilingualIssue["severity"],
    message: string,
  ) =>
    issues.push({
      id: `${language}:${cue.id}:${type}:${issues.length}`,
      language,
      cueId: cue.id,
      type,
      severity,
      message: `[${tag}] ${message}`,
    });
  const ordered = [...cues].sort((a, b) => a.startMs - b.startMs);
  ordered.forEach((cue, i) => {
    const duration = cue.endMs - cue.startMs;
    if (!cue.text.trim()) add(cue, "empty", "error", "字幕文本为空");
    if (duration <= 0) {
      add(cue, "invalid-time", "error", "结束时间必须晚于开始时间");
    } else {
      if (duration < 800)
        add(
          cue,
          "too-short",
          "warning",
          `显示仅 ${(duration / 1000).toFixed(1)} 秒`,
        );
      const metric = cueMetric(cue, language);
      if (isOverRate(metric))
        add(cue, "too-fast", "warning", `阅读速度 ${metric.rateLabel}`);
    }
    if (maxLineWidth(cue.text, language) > MAX_LINE_WIDTH[language])
      add(
        cue,
        "too-long",
        "warning",
        language === "zh"
          ? "单行超过 21 字，建议精简"
          : "单行超过 42 字符，建议精简",
      );
    if (cue.text.split("\n").length > 2)
      add(cue, "too-long", "info", "超过两行，画面占用较高");
    const next = ordered[i + 1];
    if (next && next.startMs < cue.endMs)
      add(
        next,
        "overlap",
        "error",
        `与本轨第 ${cue.index} 条字幕重叠 ${((cue.endMs - next.startMs) / 1000).toFixed(1)} 秒`,
      );
  });
  return issues;
}

export function detectBilingualIssues(
  tracks: Record<BilingualLanguage, BilingualTrack>,
): BilingualIssue[] {
  return [
    ...detectTrackIssues(tracks.en.cues, "en"),
    ...detectTrackIssues(tracks.zh.cues, "zh"),
  ];
}
