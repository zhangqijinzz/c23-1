import {
  RATE_LIMIT,
  type BilingualCue,
  type BilingualLanguage,
  type CueMetric,
} from "./bilingualModels";

/**
 * 阅读量按语言分别计算：
 * - 中文轨：只数汉字（Script=Han），标点、空白、拉丁字母不计入
 * - 英语轨：按单词计数（连字符与撇号视为词内字符）
 * 两种语言的字符永远不混在一起统计。
 */
export function countUnits(text: string, language: BilingualLanguage): number {
  if (language === "zh") {
    const matches = text.match(/\p{Script=Han}/gu);
    return matches ? matches.length : 0;
  }
  const matches = text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g);
  return matches ? matches.length : 0;
}

/** 该语言单行最大可视长度：中文看汉字数，英文看字符数，阈值互不借用 */
export function maxLineWidth(
  text: string,
  language: BilingualLanguage,
): number {
  return text.split("\n").reduce((max, line) => {
    const width =
      language === "zh"
        ? countUnits(line, "zh")
        : [...line.replace(/\s+$/, "").replace(/^\s+/, "")].length;
    return Math.max(max, width);
  }, 0);
}

export function cueMetric(
  cue: BilingualCue,
  language: BilingualLanguage,
): CueMetric {
  const durationSec = Math.max(0.1, (cue.endMs - cue.startMs) / 1000),
    units = countUnits(cue.text, language),
    rate = units / durationSec;
  return {
    language,
    cueId: cue.id,
    units,
    durationSec,
    rate,
    rateLabel: `${rate.toFixed(1)} ${language === "zh" ? "字/秒" : "词/秒"}`,
    lines: cue.text ? cue.text.split("\n").length : 0,
  };
}

export function isOverRate(metric: CueMetric): boolean {
  return metric.rate > RATE_LIMIT[metric.language];
}

export function rateLimitLabel(language: BilingualLanguage): string {
  return language === "zh"
    ? `建议 ≤ ${RATE_LIMIT.zh} 字/秒`
    : `建议 ≤ ${RATE_LIMIT.en} 词/秒`;
}
