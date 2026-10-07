import { describe, expect, it } from "vitest";
import {
  buildPairs,
  deriveReview,
  rePairPairs,
  toTrackCues,
} from "../bilingual/bilingualPairing";
import {
  defaultBilingualSettings,
  emptyBilingualProject,
  type BilingualCue,
  type BilingualProject,
  type BilingualTrack,
} from "../bilingual/bilingualModels";
import type { SubtitleCue } from "../models";

const cue = (
  n: number,
  startMs: number,
  endMs = startMs + 1000,
): SubtitleCue => ({ id: `x-${n}`, index: n, startMs, endMs, text: `c${n}` });

const enTrack = (cues: SubtitleCue[]): BilingualTrack => ({
  language: "en",
  format: "srt",
  name: "en.srt",
  loaded: true,
  cues: toTrackCues("en", cues),
});
const zhTrack = (cues: SubtitleCue[]): BilingualTrack => ({
  language: "zh",
  format: "srt",
  name: "zh.srt",
  loaded: true,
  cues: toTrackCues("zh", cues),
});

const makeProject = (
  en: SubtitleCue[],
  zh: SubtitleCue[],
  settings: Partial<ReturnType<typeof defaultBilingualSettings>> = {},
): BilingualProject => ({
  ...emptyBilingualProject(),
  tracks: { en: enTrack(en), zh: zhTrack(zh) },
  settings: { ...defaultBilingualSettings(), ...settings },
});

let counter = 0;
const nextId = () => `pair-test-${++counter}`;

describe("bilingual auto pairing", () => {
  it("pairs cues whose start times fall inside tolerance, 1:1", () => {
    // en1 1000 ↔ zh1 1400（400ms 内）；en2 5000 ↔ zh2 5050；en3 9000 无中文对应
    const project = makeProject(
      [cue(1, 1000), cue(2, 5000), cue(3, 9000)],
      [cue(1, 1400), cue(2, 5050)],
      { autoPairToleranceMs: 1000 },
    );
    const pairs = buildPairs(project.tracks, 1000, nextId);
    expect(pairs).toHaveLength(3);
    const matched = pairs.filter((pair) => pair.enId && pair.zhId);
    expect(matched).toHaveLength(2);
    expect(matched[0]).toMatchObject({
      enId: "en-cue-1",
      zhId: "zh-cue-1",
    });
    expect(matched[1]).toMatchObject({
      enId: "en-cue-2",
      zhId: "zh-cue-2",
    });
    expect(pairs.find((pair) => pair.enId === "en-cue-3")?.zhId).toBeNull();
  });

  it("picks the globally closest edges instead of order-greedy matches", () => {
    // 顺序贪心：en1 先占 zh1(200)，en2 只能配 zh2(600)，en3 落空
    // 全局最近：最小偏差 en2↔zh1(100) 先占，随后 en1↔zh2(300)、en3↔zh3(400)
    const project = makeProject(
      [cue(1, 1000), cue(2, 1100), cue(3, 1600)],
      [cue(1, 1200), cue(2, 1300), cue(3, 2000)],
      { autoPairToleranceMs: 1000 },
    );
    const pairs = buildPairs(project.tracks, 1000, nextId);
    const map = new Map(pairs.map((pair) => [pair.enId, pair.zhId]));
    expect(map.get("en-cue-1")).toBe("zh-cue-2");
    expect(map.get("en-cue-2")).toBe("zh-cue-1");
    expect(map.get("en-cue-3")).toBe("zh-cue-3");
    expect(pairs.filter((pair) => pair.enId && pair.zhId)).toHaveLength(3);
  });

  it("keeps cues apart when they exceed the tolerance", () => {
    const project = makeProject([cue(1, 1000)], [cue(1, 4000)], {
      autoPairToleranceMs: 1000,
    });
    const pairs = buildPairs(project.tracks, 1000, nextId);
    expect(pairs.filter((pair) => pair.enId && pair.zhId)).toHaveLength(0);
    expect(pairs).toHaveLength(2);
  });

  it("derives review items for unpaired and over-threshold offsets", () => {
    // 配对1：偏差 3000ms 超过复核阈值；配对2：正常；多余 en：未配对
    const project = makeProject(
      [cue(1, 1000), cue(2, 8000), cue(3, 12000)],
      [cue(1, 4000), cue(2, 8100)],
      { autoPairToleranceMs: 5000, reviewThresholdMs: 1500 },
    );
    project.pairs = buildPairs(project.tracks, 5000, nextId);
    const review = deriveReview(project);
    const types = review.map((item) => item.type).sort();
    expect(types).toEqual(["review-offset", "unpaired"]);
    const offsetItem = review.find((item) => item.type === "review-offset");
    expect(offsetItem?.offsetMs).toBe(3000);
    const unpaired = review.find((item) => item.type === "unpaired");
    expect(unpaired?.side).toBe("en");
  });

  it("re-pairs only auto pairs and preserves manual decisions", () => {
    const project = makeProject(
      [cue(1, 1000), cue(2, 5000)],
      [cue(1, 1200), cue(2, 5200)],
      { autoPairToleranceMs: 1000 },
    );
    project.pairs = buildPairs(project.tracks, 1000, nextId);
    // 人工把第一对标记为 manual（即使其 cue 重新可用也不应被拆散）
    const first = project.pairs.find((pair) => pair.enId === "en-cue-1")!;
    first.kind = "manual";
    // 容差放宽到 0，所有 auto 配对失效，manual 必须保留
    const repaired = rePairPairs(project.pairs, project.tracks, 0, nextId);
    const manual = repaired.find((pair) => pair.id === first.id);
    expect(manual).toMatchObject({ enId: "en-cue-1", zhId: "zh-cue-1" });
    expect(manual?.kind).toBe("manual");
  });

  it("reindexes imported cue ids per track to avoid collisions", () => {
    const cues: BilingualCue[] = toTrackCues("en", [cue(1, 0)]);
    expect(cues[0].id).toBe("en-cue-1");
    expect(toTrackCues("zh", [cue(1, 0)])[0].id).toBe("zh-cue-1");
  });
});
