import { describe, expect, it } from "vitest";
import {
  autoPair,
  buildEntries,
  linkCues,
  mergeCue,
  rebuildAutoLinks,
  splitCue,
  unlink,
} from "../bilingual/cueMatcher";
import { DEFAULT_RULES } from "../bilingual/models";
import type { LanguageTrack, PairLink, PairingRules } from "../bilingual/models";
import type { SubtitleCue } from "../models";

const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text = "x",
): SubtitleCue => ({ id, index: Number(id.slice(1)), startMs, endMs, text });

const track = (language: "foreign" | "chinese", cues: SubtitleCue[]): LanguageTrack => ({
  language,
  fileName: `${language}.srt`,
  format: "srt",
  cues,
});

const rules: PairingRules = { ...DEFAULT_RULES, toleranceMs: 500, driftWarnMs: 250 };

describe("auto pairing", () => {
  it("pairs cues within tolerance in time order and leaves the rest single-sided", () => {
    const f = [cue("f1", 1000, 2000), cue("f2", 5000, 6000), cue("f3", 9000, 9800)];
    const c = [cue("c1", 1200, 2100), cue("c2", 3000, 3800), cue("c3", 9100, 9900)];
    const links = autoPair(f, c, rules);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ foreignIds: ["f1"], chineseIds: ["c1"] });
    expect(links[1]).toMatchObject({ foreignIds: ["f3"], chineseIds: ["c3"] });

    const result = buildEntries(track("foreign", f), track("chinese", c), links, rules);
    expect(result.matched).toBe(2);
    expect(result.foreignOnly).toBe(1);
    expect(result.chineseOnly).toBe(1);
  });

  it("flags pairs beyond the drift warning threshold separately", () => {
    const f = [cue("f1", 1000, 2000)];
    const c = [cue("c1", 1400, 2200)]; // 400ms drift: within tolerance, over warn
    const links = autoPair(f, c, rules);
    const result = buildEntries(track("foreign", f), track("chinese", c), links, rules);
    expect(result.drift).toBe(1);
    expect(result.matched).toBe(0);
  });

  it("does not one-to-many pair automatically", () => {
    const f = [cue("f1", 1000, 1200), cue("f2", 1250, 1500)];
    const c = [cue("c1", 1100, 1600)];
    const links = autoPair(f, c, rules);
    // f1-c1 配上后，f2 无法再配给 c1
    expect(links).toHaveLength(1);
    const result = buildEntries(track("foreign", f), track("chinese", c), links, rules);
    expect(result.foreignOnly).toBe(1);
  });
});

describe("manual decisions", () => {
  const f = [cue("f1", 1000, 2000), cue("f2", 8000, 8800)];
  const c = [cue("c1", 3000, 3800)];

  it("creates a manual pair from unmatched cues on both sides", () => {
    const links = linkCues([], ["f2"], ["c1"], track("foreign", f), track("chinese", c));
    expect(links[0]).toMatchObject({
      source: "manual",
      foreignIds: ["f2"],
      chineseIds: ["c1"],
    });
  });

  it("merges a same-side cue into an existing link and supports splitting back", () => {
    let links = autoPair(
      [cue("f1", 1000, 2000)],
      [cue("c1", 1100, 2100)],
      rules,
    );
    const targetId = links[0].id;
    links = mergeCue(links, targetId, "f2", "foreign");
    expect(links[0].foreignIds).toEqual(["f1", "f2"]);
    links = splitCue(links, targetId, "f2");
    expect(links[0].foreignIds).toEqual(["f1"]);
  });

  it("moving a cue into another link empties and removes the source link", () => {
    const links: PairLink[] = [
      { id: "p1", foreignIds: ["f1"], chineseIds: ["c1"], source: "auto", driftMs: 0 },
      { id: "p2", foreignIds: ["f2"], chineseIds: [], source: "manual", driftMs: 0 },
    ];
    const moved = mergeCue(links, "p1", "f2", "foreign");
    expect(moved).toHaveLength(1);
    expect(moved[0].foreignIds).toEqual(["f1", "f2"]);
    expect(unlink(moved, "p1")).toHaveLength(0);
  });
});

describe("rule changes", () => {
  it("rebuilds auto pairs under new tolerance while preserving manual links", () => {
    const f = [cue("f1", 1000, 2000), cue("f2", 5000, 6000)];
    const c = [cue("c1", 1700, 2200), cue("c2", 5100, 6100)];
    // 700ms drift fails tolerance 500 → only f2/c2 pair
    let links = autoPair(f, c, rules);
    expect(links).toHaveLength(1);
    // human manually pairs the drifted first cues
    links = linkCues(links, ["f1"], ["c1"], track("foreign", f), track("chinese", c));
    // widening tolerance must not duplicate manual pairs
    const rebuilt = rebuildAutoLinks(f, c, links, { toleranceMs: 900 });
    const manualCount = rebuilt.filter((link) => link.source === "manual").length;
    expect(manualCount).toBe(1);
    const f1Owners = rebuilt.filter((link) => link.foreignIds.includes("f1"));
    expect(f1Owners).toHaveLength(1);
  });
});
