import { useMemo, type PointerEvent } from "react";
import {
  LANGUAGE_META,
  type BilingualCue,
  type BilingualProject,
} from "../bilingualModels";
import { getCueMaps, orderedPairs } from "../bilingualPairing";
import { cueMetric, isOverRate } from "../bilingualMetrics";
import type { BilingualMeterViewModel } from "../bilingualViewModel";

function TrackLane({
  language,
  cues,
  maxTime,
  zoom,
  selectedPairId,
  pairs,
  onSelect,
  onDragEnd,
}: {
  language: "en" | "zh";
  cues: BilingualCue[];
  maxTime: number;
  zoom: number;
  selectedPairId: string | null;
  pairs: BilingualProject["pairs"];
  onSelect: (cueId: string) => void;
  onDragEnd: (cueId: string, shiftMs: number) => void;
}) {
  const pairOfCue = (cueId: string) =>
    pairs.find((pair) => (language === "en" ? pair.enId : pair.zhId) === cueId);

  const trackPointerDown =
    (cue: BilingualCue) => (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.stopPropagation();
      const x0 = event.clientX,
        laneWidth =
          event.currentTarget.parentElement?.getBoundingClientRect().width ?? 1;
      let shift = 0;
      const move = (moveEvent: globalThis.PointerEvent) => {
        shift = Math.round(((moveEvent.clientX - x0) / laneWidth) * maxTime);
      };
      const done = () => {
        window.removeEventListener("pointermove", move);
        if (shift) onDragEnd(cue.id, shift);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", done, { once: true });
    };

  return (
    <div className={`bi-lane bi-lane-${language}`}>
      <span className="bi-lane-label">
        <i className={`bi-lang-badge lang-${language}`}>
          {LANGUAGE_META[language].short}
        </i>
        {LANGUAGE_META[language].label}
      </span>
      <div
        className="timeline-track bi-lane-track"
        style={{ minWidth: `${zoom * 100}%` }}
      >
        {cues.map((cue) => {
          const pair = pairOfCue(cue.id),
            metric = cueMetric(cue, language),
            fast = isOverRate(metric);
          return (
            <button
              key={cue.id}
              title={`#${cue.index} · ${(cue.startMs / 1000).toFixed(2)}s · ${metric.rateLabel}`}
              className={`timeline-cue bi-cue lang-${language} ${
                selectedPairId && pair?.id === selectedPairId ? "selected" : ""
              } ${fast ? "rate-hot" : ""} ${pair?.enId && pair.zhId ? "is-paired" : "is-lone"}`}
              style={{
                left: `${(cue.startMs / maxTime) * 100}%`,
                width: `${Math.max(2.2, ((cue.endMs - cue.startMs) / maxTime) * 100)}%`,
              }}
              onClick={() => onSelect(cue.id)}
              onPointerDown={trackPointerDown(cue)}
            >
              {cue.index}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BilingualTimelineModule({
  project,
  vm,
  selectedPairId,
  zoom,
  onZoom,
}: {
  project: BilingualProject;
  vm: BilingualMeterViewModel;
  selectedPairId: string | null;
  zoom: number;
  onZoom: (zoom: number) => void;
}) {
  const maps = useMemo(() => getCueMaps(project.tracks), [project.tracks]);
  const pairs = useMemo(
    () => orderedPairs(project.pairs, project.tracks),
    [project.pairs, project.tracks],
  );
  const maxTime = Math.max(
    1000,
    ...project.tracks.en.cues.map((cue) => cue.endMs),
    ...project.tracks.zh.cues.map((cue) => cue.endMs),
  );
  const pairOfCue = (language: "en" | "zh", cueId: string) =>
    project.pairs.find(
      (pair) => (language === "en" ? pair.enId : pair.zhId) === cueId,
    );

  const selectCue = (language: "en" | "zh", cueId: string) => {
    const pair = pairOfCue(language, cueId);
    if (pair) void vm.selectPair(pair.id);
  };

  const dragEnd = (language: "en" | "zh", cueId: string, shiftMs: number) => {
    const cue = project.tracks[language].cues.find((item) => item.id === cueId);
    if (!cue) return;
    void vm.editCue(language, cueId, {
      startMs: Math.max(0, cue.startMs + shiftMs),
      endMs: Math.max(1, cue.endMs + shiftMs),
    });
  };

  const selectedPair = pairs.find((pair) => pair.id === selectedPairId);
  const selectedOrdinal = selectedPair
    ? pairs.findIndex((pair) => pair.id === selectedPairId) + 1
    : null;
  const selectedOffset =
    selectedPair?.enId && selectedPair.zhId
      ? (maps.zh.get(selectedPair.zhId)?.startMs ?? 0) -
        (maps.en.get(selectedPair.enId)?.startMs ?? 0)
      : null;

  return (
    <section className="module timeline-module bilingual-timeline">
      <div className="module-head">
        <div>
          <span className="module-kicker">BI / 02 · 双语时间轴</span>
          <h2>互相关联的两条语言轨</h2>
        </div>
        <label className="zoom-control">
          缩放{" "}
          <input
            aria-label="双语时间轴缩放"
            type="range"
            min="0.6"
            max="2"
            step="0.1"
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="time-ruler">
        <span>00:00</span>
        <span>{(maxTime / 2000).toFixed(0)}s</span>
        <span>{(maxTime / 1000).toFixed(0)}s</span>
      </div>

      <div className="bi-timeline-scroll">
        <div
          className="bi-timeline-body"
          style={{ minWidth: `${zoom * 100}%` }}
        >
          <TrackLane
            language="en"
            cues={project.tracks.en.cues}
            maxTime={maxTime}
            zoom={zoom}
            selectedPairId={selectedPairId}
            pairs={project.pairs}
            onSelect={(id) => selectCue("en", id)}
            onDragEnd={(id, shift) => dragEnd("en", id, shift)}
          />
          <div className="bi-links" aria-hidden="true">
            {pairs
              .filter((pair) => pair.enId && pair.zhId)
              .map((pair) => {
                const en = maps.en.get(pair.enId!)!,
                  zh = maps.zh.get(pair.zhId!)!,
                  offset = Math.abs(zh.startMs - en.startMs),
                  flagged =
                    pair.kind === "auto" &&
                    offset > project.settings.reviewThresholdMs;
                return (
                  <span
                    key={pair.id}
                    className={`bi-link ${pair.locked ? "locked" : "unlocked"} ${
                      flagged ? "flagged" : ""
                    } ${selectedPairId === pair.id ? "selected" : ""}`}
                    style={{
                      left: `${(en.startMs / maxTime) * 100}%`,
                      right: `${100 - (zh.startMs / maxTime) * 100}%`,
                    }}
                  />
                );
              })}
          </div>
          <TrackLane
            language="zh"
            cues={project.tracks.zh.cues}
            maxTime={maxTime}
            zoom={zoom}
            selectedPairId={selectedPairId}
            pairs={project.pairs}
            onSelect={(id) => selectCue("zh", id)}
            onDragEnd={(id, shift) => dragEnd("zh", id, shift)}
          />
        </div>
      </div>

      <div className="timeline-hint bi-timeline-hint">
        {selectedPair ? (
          <span>
            当前配对 #{selectedOrdinal}
            {selectedOffset !== null && (
              <em
                className={
                  Math.abs(selectedOffset) > project.settings.reviewThresholdMs
                    ? "warning-color"
                    : ""
                }
              >
                {" "}
                · 起始偏差 {(selectedOffset / 1000).toFixed(2)} 秒
              </em>
            )}
            {" · "}
            <button
              className="link-button"
              onClick={() =>
                void vm.setLock(selectedPair.id, !selectedPair.locked)
              }
            >
              {selectedPair.locked
                ? "🔗 已锁定联动（点击解锁）"
                : "🔓 未锁定（点击联动）"}
            </button>
          </span>
        ) : (
          "拖动任一语言轨的时间块：锁定配对会同步平移另一轨，解锁后两轨独立调整"
        )}
      </div>
    </section>
  );
}
