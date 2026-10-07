import type { PointerEvent } from "react";
import type { BilingualMeterViewModel } from "../bilingualMeterViewModel";
import type { BilingualProject, PairingEntry } from "../models";
import type { SubtitleCue } from "../../models";

export function BilingualTimelineModule({
  project,
  vm,
  pairing,
  selectedCue,
  zoom,
}: {
  project: BilingualProject;
  vm: BilingualMeterViewModel;
  pairing: { entries: PairingEntry[] };
  selectedCue: { track: "foreign" | "chinese" | null; cueId: string | null };
  zoom: number;
}) {
  const maxTime = Math.max(
    1000,
    ...project.foreign.cues.map((cue) => cue.endMs),
    ...project.chinese.cues.map((cue) => cue.endMs),
  );
  const dragCue = (
    event: PointerEvent<HTMLButtonElement>,
    cue: SubtitleCue,
    track: "foreign" | "chinese",
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    const x0 = event.clientX,
      start = cue.startMs,
      end = cue.endMs,
      trackWidth =
        event.currentTarget.closest(".bi-timeline-body")?.getBoundingClientRect()
          .width ?? 1;
    let shift = 0;
    const move = (moveEvent: globalThis.PointerEvent) => {
      shift = Math.round(((moveEvent.clientX - x0) / trackWidth) * maxTime);
    };
    const done = () => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointermove", move);
      if (shift)
        void vm.editCue(track, cue.id, {
          startMs: Math.max(0, start + shift),
          endMs: Math.max(1, end + shift),
        });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  };

  const lane = (track: "foreign" | "chinese", cues: SubtitleCue[]) => (
    <div className="bi-lane" data-track={track}>
      <span className="bi-lane-label">
        {track === "foreign" ? "外语轨" : "中文轨"}
      </span>
      <div className="bi-lane-track">
        {cues.map((cue) => (
          <button
            key={cue.id}
            title={`#${cue.index} · ${(cue.startMs / 1000).toFixed(2)}s`}
            className={`timeline-cue bi-rail-cue ${
              selectedCue.track === track && selectedCue.cueId === cue.id
                ? "selected"
                : ""
            }`}
            style={{
              left: `${(cue.startMs / maxTime) * 100}%`,
              width: `${Math.max(2.5, ((cue.endMs - cue.startMs) / maxTime) * 100)}%`,
            }}
            onClick={() => vm.selectCue(track, cue.id)}
            onPointerDown={(event) => dragCue(event, cue, track)}
          >
            {cue.index}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="module timeline-module bi-timeline">
      <div className="module-head">
        <div>
          <span className="module-kicker">03 / LINKED TIMELINE</span>
          <h2>双语关联时间轴</h2>
        </div>
        <label className="zoom-control">
          缩放{" "}
          <input
            aria-label="时间轴缩放"
            type="range"
            min="0.6"
            max="2"
            step="0.1"
            value={zoom}
            onChange={(e) => vm.setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="time-ruler">
        <span>00:00</span>
        <span>{(maxTime / 2000).toFixed(0)}s</span>
        <span>{(maxTime / 1000).toFixed(0)}s</span>
      </div>
      <div className="bi-timeline-body" style={{ minWidth: `${zoom * 100}%` }}>
        <div className="bi-link-layer" aria-hidden="true">
          {pairing.entries
            .filter((entry) => entry.link)
            .map((entry) => {
              const starts = entry.foreignCues.map((cue) => cue.startMs);
              const otherStarts = entry.chineseCues.map((cue) => cue.startMs);
              if (!starts.length || !otherStarts.length) return null;
              const from = (Math.min(...starts) / maxTime) * 100;
              const to = (Math.min(...otherStarts) / maxTime) * 100;
              const left = Math.min(from, to);
              const width = Math.abs(to - from) || 0.4;
              return (
                <span
                  key={entry.link!.id}
                  className={`bi-link-line ${entry.status === "drift" ? "drift" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            })}
        </div>
        {lane("foreign", project.foreign.cues)}
        {lane("chinese", project.chinese.cues)}
      </div>
      <div className="timeline-hint">
        两轨通过配对关系关联：拖动任一条目改时间后，对应关系与偏差即时重算（连线不跳断）。
      </div>
    </section>
  );
}
