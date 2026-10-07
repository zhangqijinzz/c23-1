import { describe, expect, it } from "vitest";
import {
  countUnits,
  cueMetric,
  maxLineWidth,
} from "../bilingual/bilingualMetrics";

describe("bilingual metrics count units per language without mixing", () => {
  it("counts Chinese by Han characters only", () => {
    // 标点、空白、拉丁字母、数字都不计入中文字数
    expect(countUnits("字幕的节奏，决定了呼吸。", "zh")).toBe(10);
    expect(countUnits("中英 mix", "zh")).toBe(2);
  });

  it("counts English by words, including hyphenated and contractions", () => {
    expect(countUnits("Let every line stay just long enough", "en")).toBe(7);
    expect(countUnits("don't well-being 123abc", "en")).toBe(3);
  });

  it("keeps the two languages apart for identical mixed text", () => {
    const text = "hello 世界";
    expect(countUnits(text, "zh")).toBe(2);
    expect(countUnits(text, "en")).toBe(1);
  });

  it("computes rates with language-specific units", () => {
    const zh = cueMetric(
      {
        id: "z",
        index: 1,
        startMs: 0,
        endMs: 1000,
        text: "一二三四五六七八九十",
      },
      "zh",
    );
    const en = cueMetric(
      {
        id: "e",
        index: 1,
        startMs: 0,
        endMs: 1000,
        text: "一二三四五六七八九十",
      },
      "en",
    );
    expect(zh.units).toBe(10);
    expect(en.units).toBe(0);
    expect(zh.rate).toBe(10);
    expect(en.rate).toBe(0);
  });

  it("measures line width with per-language rules", () => {
    expect(maxLineWidth("一行很长很长很长的中文字", "zh")).toBe(12);
    expect(maxLineWidth("An English line with punctuation.", "en")).toBe(33);
  });
});
