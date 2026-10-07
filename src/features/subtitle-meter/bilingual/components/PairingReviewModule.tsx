import { useState } from "react";
import type { BilingualMeterViewModel } from "../bilingualMeterViewModel";
import { entryKeyForCue } from "../bilingualMeterViewModel";
import { READING_LIMIT, readingSpeed } from "../languageProfile";
import type {
  PairingEntry,
  PairingResult,
  PairingRules,
  TrackLanguage,
} from "../models";
import type { SubtitleCue, SubtitleIssue } from "../../models";

const STATUS_LABEL: Record<PairingEntry["status"], string> = {
  matched: "已配对",
  drift: "偏差过大",
  "foreign-only": "仅外语",
  "chinese-only": "仅中文",
};

function cueLabel(cue: SubtitleCue | undefined, language: TrackLanguage) {
  if (!cue) return "—";
  const speed = readingSpeed(cue, language);
  const limit = READING_LIMIT[language];
  const fast = speed > limit.value;
  return `${cue.text.replace(/\n/g, " ⏎ ") || "（空）"}  ·  ${speed.toFixed(1)} ${limit.unit}${fast ? " ⚠" : ""}`;
}

function EntryCue({
  cue,
  language,
  selected,
  issues,
  onClick,
}: {
  cue: SubtitleCue | undefined;
  language: TrackLanguage;
  selected: boolean;
  issues: SubtitleIssue[];
  onClick: () => void;
}) {
  if (!cue) return <div className="bi-cue-slot">—</div>;
  return (
    <button
      className={`bi-cue-slot filled ${selected ? "selected" : ""} ${issues.length ? "has-issue" : ""}`}
      title={issues.map((issue) => issue.message).join("；")}
      onClick={onClick}
    >
      <span className="bi-cue-index">#{cue.index}</span>
      <span className="bi-cue-text">{cueLabel(cue, language)}</span>
      {issues.length > 0 && <span className="bi-cue-flag">!</span>}
    </button>
  );
}

export function PairingReviewModule({
  vm,
  pairing,
  rules,
  selection,
  foreignIssues,
  chineseIssues,
}: {
  vm: BilingualMeterViewModel;
  pairing: PairingResult;
  rules: PairingRules;
  selection: { entryKey: string | null; cueId: string | null };
  foreignIssues: SubtitleIssue[];
  chineseIssues: SubtitleIssue[];
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggleCheck = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
  };
  const issuesFor = (cue: SubtitleCue | undefined, language: TrackLanguage) => {
    if (!cue) return [];
    const list = language === "foreign" ? foreignIssues : chineseIssues;
    return list.filter((issue) => issue.cueId === cue.id);
  };
  const selectedKeys = [...checked];
  const selectedForeign = selectedKeys
    .filter((key) => key.startsWith("cue:foreign:"))
    .map((key) => key.slice("cue:foreign:".length));
  const selectedChinese = selectedKeys
    .filter((key) => key.startsWith("cue:chinese:"))
    .map((key) => key.slice("cue:chinese:".length));
  const canCreate = selectedForeign.length > 0 && selectedChinese.length > 0;

  // side = 本侧；在已配对关系上，可把同语言的单侧未配条目并入进来（该侧变多条）。
  const mergeButtons = (entry: PairingEntry, side: TrackLanguage) => {
    if (!entry.link) return null;
    const candidates = pairing.entries
      .filter(
        (item) => item.status === (side === "foreign" ? "foreign-only" : "chinese-only"),
      )
      .flatMap((item) =>
        (side === "foreign" ? item.foreignCues : item.chineseCues).map((cue) => ({
          cue,
        })),
      );
    if (!candidates.length) return null;
    return (
      <select
        aria-label={`并入${side === "foreign" ? "外语" : "中文"}条目`}
        defaultValue=""
        onChange={(e) => {
          const cueId = e.target.value;
          if (cueId) void vm.mergeCue(entry.link!.id, cueId, side);
        }}
      >
        <option value="" disabled>
          并入{side === "foreign" ? "外语" : "中文"}…
        </option>
        {candidates.map(({ cue }) => (
          <option key={cue.id} value={cue.id}>
            #{cue.index} {cue.text.replace(/\n/g, " ").slice(0, 12)}
          </option>
        ))}
      </select>
    );
  };

  return (
    <section className="module bi-review-module">
      <div className="module-head">
        <div>
          <span className="module-kicker">02 / PAIRING REVIEW</span>
          <h2>配对复核</h2>
        </div>
        <div className="bi-stats">
          <span className="bi-stat matched">{pairing.matched} 已配</span>
          <span className="bi-stat drift">{pairing.drift} 偏差</span>
          <span className="bi-stat f-only">{pairing.foreignOnly} 仅外</span>
          <span className="bi-stat c-only">{pairing.chineseOnly} 仅中</span>
        </div>
      </div>

      <div className="bi-rules">
        <label>
          自动配对容差
          <input
            aria-label="配对容差毫秒"
            type="number"
            min="0"
            step="50"
            value={rules.toleranceMs}
            onChange={(e) =>
              void vm.setRules({ toleranceMs: Math.max(0, Number(e.target.value)) })
            }
          />
          ms
        </label>
        <label>
          偏差预警阈值
          <input
            aria-label="偏差预警毫秒"
            type="number"
            min="0"
            step="50"
            value={rules.driftWarnMs}
            onChange={(e) =>
              void vm.setRules({ driftWarnMs: Math.max(0, Number(e.target.value)) })
            }
          />
          ms
        </label>
        <label>
          导出轨序
          <select
            aria-label="导出轨序"
            value={rules.topLanguage}
            onChange={(e) =>
              void vm.setRules({ topLanguage: e.target.value as TrackLanguage })
            }
          >
            <option value="foreign">外语在上，中文在下</option>
            <option value="chinese">中文在上，外语在下</option>
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={!canCreate}
          title={canCreate ? "把勾选的两侧条目新建为配对" : "需各勾选至少一条外语与中文"}
          onClick={() => {
            void vm.createPair(selectedForeign, selectedChinese);
            setChecked(new Set());
          }}
        >
          ＋ 新建配对（{selectedForeign.length}/{selectedChinese.length}）
        </button>
      </div>

      <div className="bi-pair-list">
        {pairing.entries.map((entry) => {
          const rowKey = entry.link?.id ??
            (entry.foreignCues[0]
              ? entryKeyForCue("foreign", entry.foreignCues[0].id)
              : entryKeyForCue("chinese", entry.chineseCues[0].id));
          const isSelected = selection.entryKey === rowKey;
          return (
            <div
              key={rowKey}
              className={`bi-pair-row ${entry.status} ${isSelected ? "selected" : ""}`}
            >
              <div className="bi-pair-side">
                {entry.foreignCues.length ? (
                  entry.foreignCues.map((cue) => (
                    <div className="bi-cue-line" key={cue.id}>
                      {entry.link ? (
                        <span className="bi-cue-grip" aria-hidden="true">↔</span>
                      ) : (
                        <input
                          aria-label="勾选外语条目"
                          type="checkbox"
                          checked={checked.has(entryKeyForCue("foreign", cue.id))}
                          onChange={() => toggleCheck(entryKeyForCue("foreign", cue.id))}
                        />
                      )}
                      <EntryCue
                        cue={cue}
                        language="foreign"
                        selected={selection.cueId === cue.id}
                        issues={issuesFor(cue, "foreign")}
                        onClick={() => vm.selectCue("foreign", cue.id)}
                      />
                      {entry.link && entry.foreignCues.length > 1 && (
                        <button
                          className="bi-mini-button"
                          onClick={() => void vm.splitCue(entry.link!.id, cue.id)}
                        >
                          拆出
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <EntryCue cue={undefined} language="foreign" selected={false} issues={[]} onClick={() => undefined} />
                )}
                {mergeButtons(entry, "foreign")}
              </div>
              <div className="bi-pair-link">
                <span className={`bi-link-badge ${entry.status}`}>
                  {STATUS_LABEL[entry.status]}
                </span>
                {entry.driftMs !== null && (
                  <span className="bi-drift">{(entry.driftMs / 1000).toFixed(2)}s</span>
                )}
                {entry.link && (
                  <button
                    className="bi-mini-button danger"
                    onClick={() => void vm.unlink(entry.link!.id)}
                  >
                    解除
                  </button>
                )}
              </div>
              <div className="bi-pair-side">
                {entry.chineseCues.length ? (
                  entry.chineseCues.map((cue) => (
                    <div className="bi-cue-line" key={cue.id}>
                      {entry.link ? (
                        <span className="bi-cue-grip" aria-hidden="true">↔</span>
                      ) : (
                        <input
                          aria-label="勾选中文条目"
                          type="checkbox"
                          checked={checked.has(entryKeyForCue("chinese", cue.id))}
                          onChange={() => toggleCheck(entryKeyForCue("chinese", cue.id))}
                        />
                      )}
                      <EntryCue
                        cue={cue}
                        language="chinese"
                        selected={selection.cueId === cue.id}
                        issues={issuesFor(cue, "chinese")}
                        onClick={() => vm.selectCue("chinese", cue.id)}
                      />
                      {entry.link && entry.chineseCues.length > 1 && (
                        <button
                          className="bi-mini-button"
                          onClick={() => void vm.splitCue(entry.link!.id, cue.id)}
                        >
                          拆出
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <EntryCue cue={undefined} language="chinese" selected={false} issues={[]} onClick={() => undefined} />
                )}
                {mergeButtons(entry, "chinese")}
              </div>
            </div>
          );
        })}
      </div>
      <p className="timeline-hint">
        勾选两侧未配对条目后「新建配对」；单侧多行可用「并入」合并后双语同行。阅读速度按各语言分别计量，互不混算。
      </p>
    </section>
  );
}
