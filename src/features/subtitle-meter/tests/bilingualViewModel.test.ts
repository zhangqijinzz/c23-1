import { beforeEach, describe, expect, it, vi } from "vitest";
import { BilingualMeterViewModel } from "../bilingual/bilingualViewModel";
import { readTextFile } from "../services/fileService";

const stamp = (ms: number) => {
  const h = Math.floor(ms / 3600000),
    m = Math.floor(ms / 60000) % 60,
    s = Math.floor(ms / 1000) % 60,
    milli = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
};

const srt = (cues: Array<[number, number, string]>) =>
  cues
    .map(
      ([start, end, text], i) =>
        `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${text}`,
    )
    .join("\n\n");

const FILES: Record<string, string> = {
  "en.srt": srt([
    [1000, 3000, "Hello"],
    [4000, 6000, "World"],
    [8000, 9500, "Lonely"],
  ]),
  "zh.srt": srt([
    [1100, 3100, "你好"],
    [4100, 6050, "世界"],
  ]),
};

vi.mock("../services/fileService", () => ({
  readTextFile: vi.fn(async (file: File) => FILES[file.name] ?? ""),
}));
vi.mock("../bilingual/bilingualRepository", () => ({
  bilingualRepository: {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
    empty: vi.fn(),
  },
}));
vi.mock("../bilingual/bilingualExportService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../bilingual/bilingualExportService")
    >();
  return { ...actual, downloadTextFile: vi.fn() };
});

import { downloadTextFile } from "../bilingual/bilingualExportService";

async function importPair(vm: BilingualMeterViewModel) {
  await vm.importTrack("en", new File([""], "en.srt"));
  await vm.importTrack("zh", new File([""], "zh.srt"));
}

describe("BilingualMeterViewModel pipeline", () => {
  let vm: BilingualMeterViewModel;
  beforeEach(() => {
    vm = new BilingualMeterViewModel();
    vi.mocked(readTextFile).mockImplementation(
      async (file: File) => FILES[file.name] ?? "",
    );
  });

  it("imports both tracks, auto-pairs within tolerance and lists unmatched cues", async () => {
    await importPair(vm);
    const { project, review } = vm.state;
    expect(project.tracks.en.cues).toHaveLength(3);
    expect(project.tracks.zh.cues).toHaveLength(2);
    expect(project.pairs).toHaveLength(3);
    const matched = project.pairs.filter((pair) => pair.enId && pair.zhId);
    expect(matched).toHaveLength(2);
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({ type: "unpaired", side: "en" });
  });

  it("updates the linked counterpart immediately while locked, independently when unlocked", async () => {
    await importPair(vm);
    const pair = vm.state.project.pairs.find(
      (item) => item.enId === "en-cue-1" && item.zhId === "zh-cue-1",
    )!;
    expect(pair.locked).toBe(true);
    await vm.editCue("en", "en-cue-1", { startMs: 1500 });
    let zh = vm.state.project.tracks.zh.cues[0];
    expect(zh.startMs).toBe(1600);

    await vm.setLock(pair.id, false);
    await vm.editCue("en", "en-cue-1", { startMs: 1000 });
    zh = vm.state.project.tracks.zh.cues[0];
    expect(zh.startMs).toBe(1600);

    // 对应关系不变，偏差即时重算反映在状态上
    const stillLinked = vm.state.project.pairs.find(
      (item) => item.id === pair.id,
    );
    expect(stillLinked?.enId).toBe("en-cue-1");
    expect(stillLinked?.zhId).toBe("zh-cue-1");
  });

  it("recalculates pairing when tolerance changes, but keeps manual decisions", async () => {
    await importPair(vm);
    await vm.setSettings({ autoPairToleranceMs: 0 });
    expect(vm.state.project.pairs).toHaveLength(5);
    expect(
      vm.state.project.pairs.filter((item) => item.enId && item.zhId),
    ).toHaveLength(0);

    const enLone = vm.state.project.pairs.find(
        (item) => item.enId === "en-cue-1",
      )!,
      zhLone = vm.state.project.pairs.find((item) => item.zhId === "zh-cue-1")!;
    await vm.linkLonePairs(enLone.id, zhLone.id);
    const manual = vm.state.project.pairs.find(
      (item) => item.id === enLone.id,
    )!;
    expect(manual).toMatchObject({
      enId: "en-cue-1",
      zhId: "zh-cue-1",
      kind: "manual",
    });

    // 容差放宽重新自动配对：人工对保持不变
    await vm.setSettings({ autoPairToleranceMs: 1000 });
    const kept = vm.state.project.pairs.find((item) => item.id === enLone.id);
    expect(kept).toMatchObject({ enId: "en-cue-1", zhId: "zh-cue-1" });
  });

  it("lets a reviewer keep an unmatched cue as a standalone entry", async () => {
    await importPair(vm);
    const lone = vm.state.project.pairs.find(
      (item) => item.enId === "en-cue-3",
    )!;
    await vm.confirmStandalone(lone.id);
    const pair = vm.state.project.pairs.find((item) => item.id === lone.id)!;
    expect(pair.kind).toBe("manual");
    expect(vm.state.review).toHaveLength(0);
  });

  it("merges an unmatched cue into an existing pair on the same side", async () => {
    await importPair(vm);
    const lone = vm.state.project.pairs.find(
        (item) => item.enId === "en-cue-3",
      )!,
      target = vm.state.project.pairs.find(
        (item) => item.enId === "en-cue-1" && item.zhId,
      )!;
    await vm.mergeIntoPair(lone.id, target.id);
    expect(vm.state.project.tracks.en.cues).toHaveLength(2);
    const mergedEn = vm.state.project.tracks.en.cues.find(
      (cue) => cue.id === "en-cue-1",
    )!;
    expect(mergedEn.text).toBe("Hello\nLonely");
    expect(mergedEn.startMs).toBe(1000);
    expect(mergedEn.endMs).toBe(9500);
    expect(vm.state.project.pairs).toHaveLength(2);
  });

  it("unlinks a pair back into two reviewable single-side entries", async () => {
    await importPair(vm);
    const pair = vm.state.project.pairs.find(
      (item) => item.enId === "en-cue-1" && item.zhId === "zh-cue-1",
    )!;
    await vm.unlinkPair(pair.id);
    const halves = vm.state.project.pairs.filter(
      (item) => item.enId === "en-cue-1" || item.zhId === "zh-cue-1",
    );
    expect(halves).toHaveLength(2);
    // 回到自动待处理池：重新出现在复核列表，且可参与重新配对
    expect(halves.every((item) => item.kind === "auto")).toBe(true);
    expect(
      vm.state.review.filter((item) => item.type === "unpaired"),
    ).toHaveLength(3);
  });

  it("saves and restores a bilingual snapshot with both tracks and links", async () => {
    await importPair(vm);
    await vm.saveVersion();
    expect(vm.state.project.versions).toHaveLength(1);
    await vm.editCue("en", "en-cue-1", { text: "Changed" });
    expect(vm.state.project.tracks.en.cues[0].text).toBe("Changed");
    await vm.restoreVersion(vm.state.project.versions[0].id);
    expect(vm.state.project.tracks.en.cues[0].text).toBe("Hello");
    expect(vm.state.project.pairs).toHaveLength(3);
  });

  it("exports a merged file in track order plus independent per-track files", async () => {
    await importPair(vm);
    await vm.exportMerged("srt");
    let call = vi.mocked(downloadTextFile).mock.calls.at(-1)!;
    expect(call[0]).toMatch(/-bilingual\.srt$/);
    expect(call[1]).toContain("Hello\n你好");

    await vm.setSettings({ trackOrder: "zh-first" });
    await vm.exportMerged("vtt");
    call = vi.mocked(downloadTextFile).mock.calls.at(-1)!;
    expect(call[0]).toMatch(/-bilingual\.vtt$/);
    expect(call[1]).toContain("你好\nHello");

    await vm.exportTrack("en", "srt");
    call = vi.mocked(downloadTextFile).mock.calls.at(-1)!;
    expect(call[0]).toMatch(/-en\.srt$/);
    expect(call[1]).not.toContain("你好");

    await vm.exportTrack("zh", "srt");
    call = vi.mocked(downloadTextFile).mock.calls.at(-1)!;
    expect(call[0]).toMatch(/-zh\.srt$/);
    expect(call[1]).not.toContain("Hello");
  });
});
