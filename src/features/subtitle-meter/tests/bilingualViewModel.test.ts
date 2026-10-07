import { beforeEach, describe, expect, it, vi } from "vitest";
import { BilingualMeterViewModel } from "../bilingual/bilingualMeterViewModel";
import { readTextFile } from "../services/fileService";

const EN =
  "1\n00:00:01,000 --> 00:00:03,000\nHello there\n\n" +
  "2\n00:00:05,000 --> 00:00:07,000\nHow are you\n\n" +
  "3\n00:00:09,000 --> 00:00:11,000\nGoodbye";
const ZH =
  "1\n00:00:01,100 --> 00:00:03,000\n你好\n\n" +
  "2\n00:00:05,200 --> 00:00:07,000\n你好吗\n\n" +
  "3\n00:00:09,150 --> 00:00:11,000\n再见";

vi.mock("../services/fileService", () => ({
  readTextFile: vi.fn(async () => ""),
}));
vi.mock("../repositories/bilingualRepository", () => ({
  bilingualRepository: {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
  },
}));
vi.mock("../services/exportService", () => ({ downloadTextFile: vi.fn() }));

describe("BilingualMeterViewModel", () => {
  let vm: BilingualMeterViewModel;
  beforeEach(() => {
    vm = new BilingualMeterViewModel();
    vi.mocked(readTextFile).mockReset();
  });

  const importBoth = async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce(EN);
    await vm.importTrack(new File([EN], "en.srt"), "foreign");
    vi.mocked(readTextFile).mockResolvedValueOnce(ZH);
    await vm.importTrack(new File([ZH], "zh.srt"), "chinese");
  };

  it("imports two tracks and auto-pairs them with per-language issues", async () => {
    await importBoth();
    expect(vm.state.phase).toBe("ready");
    const project = vm.state.project!;
    expect(project.foreign.cues).toHaveLength(3);
    expect(project.chinese.cues).toHaveLength(3);
    expect(vm.state.pairing?.matched).toBe(3);
    // 中文 2 字正常；外语 "How are you" 3 词在 2 秒内正常，不混算
    expect(
      vm.state.foreignIssues.every((issue) => issue.type !== "too-fast"),
    ).toBe(true);
  });

  it("lists unmatched cues for manual create/merge decisions", async () => {
    vi.mocked(readTextFile)
      .mockResolvedValueOnce(
        "1\n00:00:01,000 --> 00:00:02,000\nOnly English",
      )
      .mockResolvedValueOnce(
        "1\n00:00:08,000 --> 00:00:09,000\n只有中文",
      );
    await importBoth();
    expect(vm.state.pairing?.foreignOnly).toBe(1);
    expect(vm.state.pairing?.chineseOnly).toBe(1);
    const fId = vm.state.project!.foreign.cues[0].id;
    const cId = vm.state.project!.chinese.cues[0].id;
    // 两轨相隔 7 秒，人工配对成立但偏差过大，归入 drift 由人确认
    await vm.createPair([fId], [cId]);
    expect(vm.state.pairing?.drift).toBe(1);
    expect(vm.state.pairing?.foreignOnly).toBe(0);
    expect(vm.state.pairing?.chineseOnly).toBe(0);
  });

  it("keeps the link but updates drift immediately when a cue time is edited", async () => {
    await importBoth();
    const linkId = vm.state.project!.links[0].id;
    const fId = vm.state.project!.foreign.cues[0].id;
    await vm.editCue("foreign", fId, { startMs: 2000, endMs: 4000 });
    const entry = vm.state.pairing!.entries[0];
    expect(entry.link?.id).toBe(linkId);
    expect(entry.status).toBe("drift");
  });

  it("re-pairs under new tolerance while preserving manual links", async () => {
    await importBoth();
    const project = vm.state.project!;
    // 先解除第一条并人工重建（标记 manual）
    const first = project.links[0];
    await vm.unlink(first.id);
    const fId = first.foreignIds[0],
      cId = first.chineseIds[0];
    await vm.createPair([fId], [cId]);
    await vm.setRules({ toleranceMs: 50 });
    const manual = vm.state.project!.links.filter((l) => l.source === "manual");
    expect(manual).toHaveLength(1);
    expect(manual[0].foreignIds).toEqual([fId]);
    expect(manual[0].chineseIds).toEqual([cId]);
  });

  it("snapshots and restores both tracks together", async () => {
    await importBoth();
    await vm.saveVersion();
    expect(vm.state.project!.versions).toHaveLength(1);
    const fId = vm.state.project!.foreign.cues[0].id;
    await vm.editCue("foreign", fId, { text: "Changed" });
    await vm.restoreVersion(vm.state.project!.versions[0].id);
    expect(vm.state.project!.foreign.cues[0].text).toBe("Hello there");
  });

  it("tracks drafts until both languages are supplied", async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce(EN);
    await vm.importTrack(new File([EN], "en.srt"), "foreign");
    expect(vm.state.project).toBeNull();
    expect(vm.state.drafts.foreign?.cues).toHaveLength(3);
  });
});
