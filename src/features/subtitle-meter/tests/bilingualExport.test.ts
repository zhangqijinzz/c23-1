import { describe, expect, it } from "vitest";
import {
  buildMergedCues,
  formatSplitTrack,
  trackReadingSummary,
} from "../bilingual/bilingualExporter";
import { readingUnits } from "../bilingual/languageProfile";
import {
  autoPair,
  buildEntries,
} from "../bilingual/cueMatcher";
import {
  DEFAULT_RULES,
  type BilingualProject,
  type LanguageTrack,
} from "../bilingual/models";
import type { SubtitleCue } from "../models";

const cue = (id: string, s: number, e: number, text: string): SubtitleCue => ({
  id,
  index: Number(id.slice(1)),
  startMs: s,
  endMs: e,
  text,
});

describe("language-separated reading metrics", () => {
  it("counts Chinese by characters and foreign by words, never mixing", () => {
    expect(readingUnits("你好 世界", "chinese")).toBe(4);
    expect(readingUnits("Hello, world!", "foreign")).toBe(2);
    expect(readingUnits("it's a well-timed cue", "foreign")).toBe(4);
  });

  it("summarizes each track independently for a bilingual project", () => {
    const project: BilingualProject = {
      id: "p",
      name: "clip",
      foreign: {
        language: "foreign",
        fileName: "en.srt",
        format: "srt",
        cues: [cue("f1", 0, 1000, "one two three")],
      },
      chinese: {
        language: "chinese",
        fileName: "zh.srt",
        format: "srt",
        cues: [cue("c1", 0, 1000, "一二三四五六")],
      },
      links: [],
      rules: { ...DEFAULT_RULES },
      updatedAt: 0,
      versions: [],
    };
    const summary = trackReadingSummary(project);
    expect(summary.foreign.units).toBe(3);
    expect(summary.chinese.units).toBe(6);
  });
});

describe("bilingual export", () => {
  const foreign: LanguageTrack = {
    language: "foreign",
    fileName: "en.srt",
    format: "srt",
    cues: [
      cue("f1", 0, 2000, "Hello"),
      cue("f2", 4000, 6000, "Thanks"),
    ],
  };
  const chinese: LanguageTrack = {
    language: "chinese",
    fileName: "zh.srt",
    format: "srt",
    cues: [cue("c1", 100, 2100, "你好")],
  };
  const links = autoPair(foreign.cues, chinese.cues, DEFAULT_RULES);
  const project = (topLanguage: "foreign" | "chinese"): BilingualProject => ({
    id: "p",
    name: "clip.srt",
    foreign,
    chinese,
    links,
    rules: { ...DEFAULT_RULES, topLanguage },
    updatedAt: 0,
    versions: [],
  });

  it("merges foreign above chinese by configurable order and keeps unmatched cues", () => {
    const merged = buildMergedCues(project("foreign"));
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toBe("Hello\n你好");
    // 仅外语的第二条仍保留为单行
    expect(merged[1].text).toBe("Thanks");

    const swapped = buildMergedCues(project("chinese"));
    expect(swapped[0].text).toBe("你好\nHello");
  });

  it("splits back into two independent tracks preserving current timing", () => {
    const p = project("foreign");
    const en = formatSplitTrack(p, "foreign");
    const zh = formatSplitTrack(p, "chinese");
    expect(en.content).toContain("Hello");
    expect(en.content).not.toContain("你好");
    expect(zh.content).toContain("你好");
    expect(zh.content).not.toContain("Hello");
  });

  it("recalculates drift live after an edit, without breaking the link", () => {
    const p = project("foreign");
    const before = buildEntries(p.foreign, p.chinese, p.links, p.rules);
    expect(before.entries[0].status).toBe("matched");
    // 模拟拖动外语条目：关系还在，偏差即时变大并进入 drift
    p.foreign.cues[0] = { ...p.foreign.cues[0], startMs: 900, endMs: 2900 };
    const after = buildEntries(p.foreign, p.chinese, p.links, p.rules);
    expect(after.entries[0].link?.id).toBe(p.links[0].id);
    expect(after.entries[0].status).toBe("drift");
  });
});
