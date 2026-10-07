import { useMemo, useState, type ChangeEvent } from "react";
import type { BilingualLanguage, ReviewItem } from "../bilingualModels";
import { LANGUAGE_META } from "../bilingualModels";
import { cueOfPair, findMergeTargets, getCueMaps } from "../bilingualPairing";
import type { BilingualMeterViewModel } from "../bilingualViewModel";

const TRACKS: Array<{ language: BilingualLanguage; hint: string }> = [
  { language: "en", hint: "外语轨 · SRT / WebVTT" },
  { language: "zh", hint: "中文轨 · SRT / WebVTT" },
];

export function BilingualImportModule({
  vm,
  project,
  review,
  phase,
  notice,
}: {
  vm: BilingualMeterViewModel;
  project: ReturnType<BilingualMeterViewModel["getSnapshot"]>["project"];
  review: ReviewItem[];
  phase: string;
  notice: string;
}) {
  const [actionFor, setActionFor] = useState<{
    reviewId: string;
    mode: "merge" | "link";
  } | null>(null);
  const maps = useMemo(() => getCueMaps(project.tracks), [project.tracks]);
  const paired = project.pairs.filter((pair) => pair.enId && pair.zhId).length;
  const bothLoaded = project.tracks.en.loaded && project.tracks.zh.loaded;

  const pickFile =
    (language: BilingualLanguage) => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void vm.importTrack(language, file);
      event.target.value = "";
    };

  const sourcePair = (item: ReviewItem) =>
    project.pairs.find((entry) => entry.id === item.pairId);

  const mergeTargets = (item: ReviewItem) => {
    const pair = sourcePair(item);
    return pair ? findMergeTargets(pair, project.pairs, project.tracks) : [];
  };

  /** 指定对应的候选：另一侧语言上仍为单侧的条目，按起始时间就近排列 */
  const linkTargets = (item: ReviewItem) => {
    const pair = sourcePair(item);
    if (!pair) return [];
    const side: BilingualLanguage = pair.enId ? "en" : "zh";
    const other: BilingualLanguage = side === "en" ? "zh" : "en";
    const sourceCue = cueOfPair(pair, side, maps);
    return project.pairs
      .filter(
        (entry) =>
          entry.id !== pair.id &&
          (other === "en"
            ? entry.enId && !entry.zhId
            : entry.zhId && !entry.enId),
      )
      .map((entry) => ({
        entry,
        cue: cueOfPair(entry, other, maps),
      }))
      .filter((candidate) => candidate.cue)
      .sort(
        (a, b) =>
          Math.abs(a.cue!.startMs - (sourceCue?.startMs ?? 0)) -
          Math.abs(b.cue!.startMs - (sourceCue?.startMs ?? 0)),
      );
  };

  return (
    <section className="module bilingual-import-module">
      <div className="module-head">
        <div>
          <span className="module-kicker">BI / 01 · 双语导入与配对</span>
          <h2>两条语言轨同时导入</h2>
        </div>
        <span className="local-mark">● 按时间自动配对</span>
      </div>

      <div className="bi-track-dropzones">
        {TRACKS.map(({ language, hint }) => {
          const track = project.tracks[language];
          return (
            <div className="bi-track-card" key={language}>
              <div className="bi-track-card-head">
                <span className={`bi-lang-badge lang-${language}`}>
                  {LANGUAGE_META[language].short}
                </span>
                <div>
                  <strong>{LANGUAGE_META[language].label}</strong>
                  <small>{track.loaded ? track.name : hint}</small>
                </div>
              </div>
              <label className="dropzone bi-dropzone">
                <input
                  aria-label={`导入${LANGUAGE_META[language].label}字幕`}
                  type="file"
                  accept=".srt,.vtt"
                  onChange={pickFile(language)}
                />
                <span className="upload-icon">↑</span>
                <strong>
                  {phase === "importing"
                    ? "正在解析…"
                    : track.loaded
                      ? "重新导入此轨"
                      : "导入字幕"}
                </strong>
                <span>
                  {track.loaded
                    ? `${track.cues.length} 条 · ${track.format.toUpperCase()}`
                    : "点击选择 SRT / WebVTT"}
                </span>
              </label>
              {track.loaded && (
                <button
                  className="link-button danger"
                  onClick={() => void vm.clearTrack(language)}
                >
                  清空此轨
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="bi-pair-settings">
        <label>
          自动配对容差
          <span className="bi-setting-row">
            <input
              aria-label="自动配对容差毫秒"
              type="range"
              min="200"
              max="5000"
              step="100"
              value={project.settings.autoPairToleranceMs}
              onChange={(e) =>
                void vm.setSettings({
                  autoPairToleranceMs: Number(e.target.value),
                })
              }
            />
            <strong>
              {(project.settings.autoPairToleranceMs / 1000).toFixed(1)} 秒
            </strong>
          </span>
        </label>
        <label>
          偏差复核阈值
          <span className="bi-setting-row">
            <input
              aria-label="偏差复核阈值毫秒"
              type="range"
              min="500"
              max="8000"
              step="100"
              value={project.settings.reviewThresholdMs}
              onChange={(e) =>
                void vm.setSettings({
                  reviewThresholdMs: Number(e.target.value),
                })
              }
            />
            <strong>
              {(project.settings.reviewThresholdMs / 1000).toFixed(1)} 秒
            </strong>
          </span>
        </label>
        <label>
          轨序 / 合并导出行序
          <select
            aria-label="轨序规则"
            value={project.settings.trackOrder}
            onChange={(e) =>
              void vm.setSettings({
                trackOrder: e.target.value as "en-first" | "zh-first",
              })
            }
          >
            <option value="en-first">外语在上 · 中文在下</option>
            <option value="zh-first">中文在上 · 外语在下</option>
          </select>
        </label>
        {bothLoaded && (
          <button
            className="secondary-button"
            onClick={() => void vm.rerunAutoPairing()}
          >
            ↻ 重新自动配对
          </button>
        )}
      </div>

      <div className="bi-pair-summary">
        <span>
          已对应 <strong>{paired}</strong>
        </span>
        <span>
          待处理{" "}
          <strong className={review.length ? "warning-color" : ""}>
            {review.length}
          </strong>
        </span>
        <span>
          外语 <strong>{project.tracks.en.cues.length}</strong> · 中文{" "}
          <strong>{project.tracks.zh.cues.length}</strong>
        </span>
      </div>

      {notice && (
        <div
          className={`notice ${phase === "error" ? "error" : ""}`}
          role="status"
        >
          {notice}
        </div>
      )}

      {bothLoaded && (
        <div className="bi-review">
          <div className="bi-review-head">
            <h3>待人工决定</h3>
            <small>
              配不上的与偏差过大的条目；“并入”合并到已有条目，“新建”保留为独立行
            </small>
          </div>
          {review.length === 0 ? (
            <div className="clear-state">
              ✓ 全部已对应，没有需要人工处理的条目
            </div>
          ) : (
            <ul className="bi-review-list">
              {review.map((item) => {
                const pair = project.pairs.find(
                  (entry) => entry.id === item.pairId,
                );
                if (!pair) return null;
                const en = cueOfPair(pair, "en", maps),
                  zh = cueOfPair(pair, "zh", maps),
                  open = actionFor?.reviewId === item.id ? actionFor : null;
                return (
                  <li
                    key={item.id}
                    className={`bi-review-item ${item.type === "review-offset" ? "is-offset" : "is-unpaired"}`}
                  >
                    <div className="bi-review-flags">
                      <span
                        className={`bi-flag ${item.type === "review-offset" ? "flag-offset" : "flag-unpaired"}`}
                      >
                        {item.type === "review-offset" ? "偏差过大" : "配不上"}
                      </span>
                      {item.offsetMs !== null && (
                        <span className="bi-offset-value">
                          偏差 {(Math.abs(item.offsetMs) / 1000).toFixed(2)} 秒
                        </span>
                      )}
                    </div>
                    <p className="bi-review-message">{item.message}</p>
                    <div className="bi-review-cues">
                      <div className="bi-review-cue lang-en">
                        <span>EN</span>
                        {en ? en.text.replace(/\n/g, " / ") : <em>（空缺）</em>}
                      </div>
                      <div className="bi-review-cue lang-zh">
                        <span>中</span>
                        {zh ? zh.text.replace(/\n/g, " / ") : <em>（空缺）</em>}
                      </div>
                    </div>
                    <div className="bi-review-actions">
                      {item.type === "review-offset" ? (
                        <>
                          <button onClick={() => void vm.acceptPair(pair.id)}>
                            确认对应
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => void vm.unlinkPair(pair.id)}
                          >
                            解除并拆开
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="secondary-button"
                            onClick={() =>
                              setActionFor(
                                open?.mode === "merge"
                                  ? null
                                  : { reviewId: item.id, mode: "merge" },
                              )
                            }
                          >
                            并入到…
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() =>
                              setActionFor(
                                open?.mode === "link"
                                  ? null
                                  : { reviewId: item.id, mode: "link" },
                              )
                            }
                          >
                            指定对应…
                          </button>
                          <button
                            onClick={() => void vm.confirmStandalone(pair.id)}
                          >
                            新建（保留单侧）
                          </button>
                        </>
                      )}
                    </div>
                    {open && open.mode === "merge" && (
                      <div className="bi-merge-panel">
                        <small>
                          选择要并入的目标配对（同侧文本会合并、时段取并集）：
                        </small>
                        <div className="bi-merge-targets">
                          {mergeTargets(item).map((target) => {
                            const tEn = cueOfPair(target, "en", maps),
                              tZh = cueOfPair(target, "zh", maps);
                            return (
                              <button
                                key={target.id}
                                className="bi-merge-target"
                                onClick={() => {
                                  void vm.mergeIntoPair(pair.id, target.id);
                                  setActionFor(null);
                                }}
                              >
                                <span className="bi-merge-time">
                                  {(
                                    Math.min(
                                      tEn?.startMs ?? Infinity,
                                      tZh?.startMs ?? Infinity,
                                    ) / 1000
                                  ).toFixed(1)}
                                  s
                                </span>
                                <span className="bi-merge-text">
                                  <em>
                                    {tEn?.text.replace(/\n/g, " / ") ?? "—"}
                                  </em>
                                  <em>
                                    {tZh?.text.replace(/\n/g, " / ") ?? "—"}
                                  </em>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {open && open.mode === "link" && (
                      <div className="bi-merge-panel">
                        <small>
                          与另一侧语言的哪一条互为对应？（建立后将作为人工确认关系）
                        </small>
                        <div className="bi-merge-targets">
                          {linkTargets(item).map(({ entry, cue }) => (
                            <button
                              key={entry.id}
                              className="bi-merge-target"
                              onClick={() => {
                                const side: BilingualLanguage = pair.enId
                                  ? "en"
                                  : "zh";
                                void (side === "en"
                                  ? vm.linkLonePairs(pair.id, entry.id)
                                  : vm.linkLonePairs(entry.id, pair.id));
                                setActionFor(null);
                              }}
                            >
                              <span className="bi-merge-time">
                                {(cue!.startMs / 1000).toFixed(1)}s
                              </span>
                              <span className="bi-merge-text">
                                <em>{cue!.text.replace(/\n/g, " / ")}</em>
                              </span>
                            </button>
                          ))}
                          {linkTargets(item).length === 0 && (
                            <small>另一侧暂时没有可对应的单侧条目</small>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
