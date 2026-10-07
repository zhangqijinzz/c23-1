import { describe, expect, it } from "vitest";
import {
  formatBilingualMerged,
  formatTrack,
} from "../bilingual/bilingualFormatter";
import {
  defaultBilingualSettings,
  emptyBilingualProject,
  type BilingualTrack,
} from "../bilingual/bilingualModels";
import { buildPairs } from "../bilingual/bilingualPairing";

const en: BilingualTrack = {
  language: "en",
  format: "srt",
  name: "en.srt",
  loaded: true,
  cues: [
    {
      id: "en-cue-1",
      index: 1,
      startMs: 1000,
      endMs: 3500,
      text: "Hello there",
    },
    { id: "en-cue-2", index: 2, startMs: 4000, endMs: 6000, text: "Goodbye" },
  ],
};
const zh: BilingualTrack = {
  language: "zh",
  format: "srt",
  name: "zh.srt",
  loaded: true,
  cues: [
    { id: "zh-cue-1", index: 1, startMs: 1100, endMs: 3600, text: "你好" },
  ],
};

let counter = 0;
const pairs = buildPairs({ en, zh }, 1000, () => `p-${++counter}`);

describe("bilingual formatter", () => {
  it("merges with the foreign language on the upper line by default", () => {
    const merged = formatBilingualMerged(pairs, { en, zh }, "en-first", "srt");
    const blocks = merged.trimEnd().split("\n\n");
    expect(blocks[0]).toContain("Hello there\n你好");
    // 时间码取两侧并集
    expect(blocks[0]).toContain("00:00:01,000 --> 00:00:03,600");
    // 中文缺失的单侧配对仍输出两行版式：正文后保留一个空行（合并文件的原始内容）
    expect(merged).toContain("00:00:04,000 --> 00:00:06,000\nGoodbye\n");
  });

  it("flips line order with the track order rule", () => {
    const merged = formatBilingualMerged(pairs, { en, zh }, "zh-first", "srt");
    expect(merged).toContain("你好\nHello there");
  });

  it("emits a WebVTT header when exporting vtt", () => {
    const merged = formatBilingualMerged(pairs, { en, zh }, "en-first", "vtt");
    expect(merged.startsWith("WEBVTT\n\n")).toBe(true);
    expect(merged).toContain("00:00:01.000 --> 00:00:03.600");
  });

  it("splits back into independent tracks using each track's own times", () => {
    const enOut = formatTrack(en);
    const zhOut = formatTrack(zh);
    expect(enOut).toContain("00:00:01,000 --> 00:00:03,500\nHello there");
    expect(enOut).not.toContain("你好");
    expect(zhOut).toContain("00:00:01,100 --> 00:00:03,600\n你好");
    expect(zhOut).not.toContain("Hello");
  });

  it("keeps default settings at foreign-first", () => {
    expect(defaultBilingualSettings().trackOrder).toBe("en-first");
    expect(emptyBilingualProject().settings.autoPairToleranceMs).toBe(1000);
  });
});
