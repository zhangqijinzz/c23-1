import { useState } from "react";
import {
  LANGUAGE_META,
  type BilingualLanguage,
  type BilingualProject,
  type BilingualIssue,
} from "../bilingualModels";
import { cueMetric, isOverRate, rateLimitLabel } from "../bilingualMetrics";
import { orderedPairs } from "../bilingualPairing";
import type { BilingualMeterViewModel } from "../bilingualViewModel";

function CueEditor({
  language,
  cue,
  vm,
}: {
  language: BilingualLanguage;
  cue:
    | BilingualProject["tracks"][BilingualLanguage]["cues"][number]
    | undefined;
  vm: BilingualMeterViewModel;
}) {
  if (!cue) {
    return (
      <div className="bi-cue-editor bi-cue-missing">
        <span className={`bi-lang-badge lang-${language}`}>
          {LANGUAGE_META[language].short}
        </span>
        <em>该侧为空（合并导出时此行留空）</em>
      </div>
    );
  }
  const metric = cueMetric(cue, language),
    fast = isOverRate(metric);
  return (
    <div className={`bi-cue-editor lang-${language}`}>
      <div className="bi-cue-editor-head">
        <span className={`bi-lang-badge lang-${language}`}>
          {LANGUAGE_META[language].short}
        </span>
        <strong>#{cue.index}</strong>
        <span className={fast ? "warning-color" : ""}>{metric.rateLabel}</span>
        <small>{rateLimitLabel(language)}</small>
      </div>
      <textarea
        aria-label={`${LANGUAGE_META[language].label}文本`}
        value={cue.text}
        rows={Math.min(3, Math.max(2, cue.text.split("\n").length))}
        onChange={(e) =>
          void vm.editCue(language, cue.id, { text: e.target.value })
        }
      />
      <div className="time-edit">
        <label>
          开始
          <input
            aria-label={`${LANGUAGE_META[language].label}开始时间毫秒`}
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
            aria-label={`${LANGUAGE_META[language].label}结束时间毫秒`}
            type="number"
            min="0"
            step="100"
            value={cue.endMs}
            onChange={(e) =>
              void vm.editCue(language, cue.id, {
                endMs: Number(e.target.value),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}

export function BilingualInspectionModule({
  project,
  issues,
  vm,
  selectedPairId,
}: {
  project: BilingualProject;
  issues: BilingualIssue[];
  vm: BilingualMeterViewModel;
  selectedPairId: string | null;
}) {
  const pairs = orderedPairs(project.pairs, project.tracks);
  const selected = pairs.find((pair) => pair.id === selectedPairId) ?? pairs[0];
  const [linkChoice, setLinkChoice] = useState("");
  const errors = issues.filter((issue) => issue.severity === "error").length,
    warnings = issues.filter((issue) => issue.severity === "warning").length;

  const selectedEn = selected?.enId
      ? project.tracks.en.cues.find((cue) => cue.id === selected.enId)
      : undefined,
    selectedZh = selected?.zhId
      ? project.tracks.zh.cues.find((cue) => cue.id === selected.zhId)
      : undefined;

  const linkCandidates = selected
    ? (() => {
        const side: BilingualLanguage | null = selected.enId
          ? selected.zhId
            ? null
            : "en"
          : selected.zhId
            ? "zh"
            : null;
        if (!side) return [];
        const other: BilingualLanguage = side === "en" ? "zh" : "en";
        return pairs
          .filter((entry) =>
            other === "en"
              ? entry.enId && !entry.zhId
              : entry.zhId && !entry.enId,
          )
          .map((entry) => ({
            entry,
            cue: (other === "en"
              ? project.tracks.en.cues.find((cue) => cue.id === entry.enId)
              : project.tracks.zh.cues.find((cue) => cue.id === entry.zhId))!,
          }))
          .filter((candidate) => candidate.cue)
          .sort((a, b) => {
            const anchor = side === "en" ? selectedEn : selectedZh;
            return (
              Math.abs(a.cue.startMs - (anchor?.startMs ?? 0)) -
              Math.abs(b.cue.startMs - (anchor?.startMs ?? 0))
            );
          });
      })()
    : [];

  return (
    <section className="module inspection-module bilingual-inspection">
      <div className="module-head">
        <div>
          <span className="module-kicker">BI / 03 · 双语校对</span>
          <h2>
            分轨检查 <span className="issue-count">{issues.length}</span>
          </h2>
        </div>
        <div className="issue-summary">
          <span className="error-color">{errors} 错误</span>
          <span className="warning-color">{warnings} 提醒</span>
        </div>
      </div>

      <div className="bi-inspection-body">
        <div className="bi-pair-list">
          {pairs.map((pair, i) => {
            const en = pair.enId
                ? project.tracks.en.cues.find((cue) => cue.id === pair.enId)
                : undefined,
              zh = pair.zhId
                ? project.tracks.zh.cues.find((cue) => cue.id === pair.zhId)
                : undefined;
            const offset = en && zh ? zh.startMs - en.startMs : null,
              offsetFlag =
                pair.kind === "auto" &&
                offset !== null &&
                Math.abs(offset) > project.settings.reviewThresholdMs;
            return (
              <button
                key={pair.id}
                className={`bi-pair-row ${selected?.id === pair.id ? "selected" : ""}`}
                onClick={() => void vm.selectPair(pair.id)}
              >
                <span className="bi-pair-index">{i + 1}</span>
                <span className="bi-pair-texts">
                  <em className="lang-en">
                    {en?.text.replace(/\n/g, " / ") ?? "—"}
                  </em>
                  <em className="lang-zh">
                    {zh?.text.replace(/\n/g, " / ") ?? "—"}
                  </em>
                </span>
                <span className="bi-pair-flags">
                  {pair.kind === "manual" && (
                    <i className="bi-tag manual">人工</i>
                  )}
                  {pair.locked && en && zh && <i className="bi-tag lock">🔗</i>}
                  {offsetFlag && <i className="bi-tag offset">偏差</i>}
                  {!en || !zh ? <i className="bi-tag lone">单侧</i> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="bi-inspection-detail">
          {selected ? (
            <>
              <div className="bi-detail-actions">
                {selected.enId && selected.zhId ? (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => void vm.unlinkPair(selected.id)}
                    >
                      解除对应
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void vm.setLock(selected.id, !selected.locked)
                      }
                    >
                      {selected.locked ? "🔗 解除时间联动" : "🔓 开启时间联动"}
                    </button>
                    {selected.kind === "auto" && (
                      <button onClick={() => void vm.acceptPair(selected.id)}>
                        确认对应
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => void vm.confirmStandalone(selected.id)}
                    >
                      标记为独立条目
                    </button>
                    {linkCandidates.length > 0 && (
                      <span className="bi-link-controls">
                        <select
                          aria-label="选择另一侧语言条目"
                          value={linkChoice}
                          onChange={(e) => setLinkChoice(e.target.value)}
                        >
                          <option value="">指定对应到…</option>
                          {linkCandidates.map(({ entry, cue }) => (
                            <option key={entry.id} value={entry.id}>
                              #{cue.index} ·{" "}
                              {cue.text.replace(/\n/g, " / ").slice(0, 30)}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={!linkChoice}
                          onClick={() => {
                            const side: BilingualLanguage = selected.enId
                              ? "en"
                              : "zh";
                            void (side === "en"
                              ? vm.linkLonePairs(selected.id, linkChoice)
                              : vm.linkLonePairs(linkChoice, selected.id));
                            setLinkChoice("");
                          }}
                        >
                          建立对应
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="bi-editor-grid">
                <CueEditor language="en" cue={selectedEn} vm={vm} />
                <CueEditor language="zh" cue={selectedZh} vm={vm} />
              </div>
            </>
          ) : (
            <div className="clear-state">导入字幕后开始校对</div>
          )}

          <div className="bi-issue-list">
            {issues
              .filter(
                (issue) =>
                  issue.cueId === selectedEn?.id ||
                  issue.cueId === selectedZh?.id,
              )
              .map((issue) => (
                <span key={issue.id} className={`issue-pill ${issue.severity}`}>
                  {issue.message}
                </span>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}
