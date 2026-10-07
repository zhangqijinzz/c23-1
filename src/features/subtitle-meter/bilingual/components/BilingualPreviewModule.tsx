import type { BilingualProject, PairingResult } from "../models";
import { readingUnits } from "../languageProfile";

export function BilingualPreviewModule({
  project,
  pairing,
}: {
  project: BilingualProject;
  pairing: PairingResult;
}) {
  const entry = pairing.entries[0];
  const top = project.rules.topLanguage;
  const linesFor = (side: "foreign" | "chinese") =>
    (side === "foreign" ? entry?.foreignCues ?? [] : entry?.chineseCues ?? [])
      .flatMap((cue) => cue.text.split("\n"))
      .filter(Boolean);
  const topLines = linesFor(top);
  const bottomLines = linesFor(top === "foreign" ? "chinese" : "foreign");
  return (
    <section className="module preview-module">
      <div className="module-head">
        <div>
          <span className="module-kicker">BILINGUAL SAFE AREA</span>
          <h2>双语画面预览</h2>
        </div>
        <span className="safe-label">
          {top === "foreign" ? "外上 / 中下" : "中上 / 外下"}
        </span>
      </div>
      <div className="preview-screen">
        <div className="safe-frame">
          <span className="frame-label">90% SAFE</span>
          <div className="preview-caption bi-preview-caption">
            <span className="bi-preview-top">
              {topLines.length ? topLines.join(" ") : " "}
            </span>
            <span className="bi-preview-bottom">
              {bottomLines.length ? bottomLines.join(" ") : " "}
            </span>
          </div>
        </div>
      </div>
      <div className="preview-meta">
        <span>外语 {readingUnits(project.foreign.cues.map((c) => c.text).join(" "), "foreign")} 词（全片）</span>
        <span>中文 {readingUnits(project.chinese.cues.map((c) => c.text).join(""), "chinese")} 字（全片）</span>
        <span>分开计量</span>
      </div>
    </section>
  );
}
