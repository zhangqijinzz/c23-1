import type { BilingualMeterViewModel } from "../bilingualMeterViewModel";
import type { PairingResult, TrackLanguage } from "../models";
import type { SubtitleCue } from "../../models";
import { READING_LIMIT, readingSpeed } from "../languageProfile";

function CueEditor({
  cue,
  language,
  selected,
  vm,
}: {
  cue: SubtitleCue | undefined;
  language: TrackLanguage;
  selected: boolean;
  vm: BilingualMeterViewModel;
}) {
  if (!cue)
    return (
      <div className="bi-edit-slot empty">
        <span>{language === "foreign" ? "外语侧" : "中文侧"}无配对条目</span>
      </div>
    );
  const speed = readingSpeed(cue, language);
  const limit = READING_LIMIT[language];
  const fast = speed > limit.value;
  return (
    <div className={`bi-edit-slot ${selected ? "selected" : ""}`}>
      <div className="edit-title">
        <span>
          {language === "foreign" ? "外语" : "中文"} · #{cue.index}
        </span>
        <span className={fast ? "warning-color" : ""}>
          {speed.toFixed(1)} {limit.unit}
        </span>
      </div>
      <textarea
        aria-label={`${language === "foreign" ? "外语" : "中文"}字幕文本`}
        value={cue.text}
        rows={Math.min(4, Math.max(2, cue.text.split("\n").length))}
        onChange={(e) =>
          void vm.editCue(language, cue.id, { text: e.target.value })
        }
      />
      <div className="time-edit">
        <label>
          开始
          <input
            aria-label={`${language}开始时间毫秒`}
            type="number"
            min="0"
            step="100"
            value={cue.startMs}
            onChange={(e) =>
              void vm.editCue(language, cue.id, {
                startMs: Number(e.target.value),
              })
            }
          />
        </label>
        <span>→</span>
        <label>
          结束
          <input
            aria-label={`${language}结束时间毫秒`}
            type="number"
            min="0"
            step="100"
            value={cue.endMs}
            onChange={(e) =>
              void vm.editCue(language, cue.id, { endMs: Number(e.target.value) })
            }
          />
        </label>
      </div>
    </div>
  );
}

export function BilingualEditPanel({
  pairing,
  vm,
  selection,
}: {
  pairing: PairingResult;
  vm: BilingualMeterViewModel;
  selection: { track: TrackLanguage | null; cueId: string | null };
}) {
  const entry =
    pairing.entries.find(
      (item) =>
        item.foreignCues.some((cue) => cue.id === selection.cueId) ||
        item.chineseCues.some((cue) => cue.id === selection.cueId),
    ) ?? pairing.entries[0];
  const foreignCues = entry?.foreignCues ?? [];
  const chineseCues = entry?.chineseCues ?? [];
  return (
    <section className="module bi-edit-panel">
      <div className="module-head">
        <div>
          <span className="module-kicker">PAIR DETAIL</span>
          <h2>双语条目编辑</h2>
        </div>
        {entry?.driftMs !== undefined && entry?.driftMs !== null && (
          <span
            className={`bi-drift-pill ${entry.status === "drift" ? "warning-color" : ""}`}
          >
            起始偏差 {(entry.driftMs / 1000).toFixed(2)}s
          </span>
        )}
      </div>
      <div className="bi-edit-grid">
        <div className="bi-edit-column">
          {foreignCues.length ? (
            foreignCues.map((cue) => (
              <CueEditor
                key={cue.id}
                cue={cue}
                language="foreign"
                selected={selection.track === "foreign"}
                vm={vm}
              />
            ))
          ) : (
            <CueEditor cue={undefined} language="foreign" selected={false} vm={vm} />
          )}
        </div>
        <div className="bi-edit-column">
          {chineseCues.length ? (
            chineseCues.map((cue) => (
              <CueEditor
                key={cue.id}
                cue={cue}
                language="chinese"
                selected={selection.track === "chinese"}
                vm={vm}
              />
            ))
          ) : (
            <CueEditor cue={undefined} language="chinese" selected={false} vm={vm} />
          )}
        </div>
      </div>
    </section>
  );
}
