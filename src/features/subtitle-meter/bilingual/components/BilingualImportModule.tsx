import type { ChangeEvent } from "react";
import type { BilingualMeterViewModel } from "../bilingualMeterViewModel";
import type { LanguageTrack } from "../models";

function TrackDropzone({
  label,
  hint,
  track,
  onFile,
}: {
  label: string;
  hint: string;
  track?: LanguageTrack;
  onFile: (file: File) => void;
}) {
  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  };
  return (
    <label className={`dropzone bi-dropzone ${track ? "filled" : ""}`}>
      <input
        aria-label={`导入${label}字幕`}
        type="file"
        accept=".srt,.vtt"
        onChange={handle}
      />
      <span className="upload-icon">{track ? "✓" : "↑"}</span>
      <strong>{track ? track.fileName : `导入${label}字幕`}</strong>
      <span>{track ? `${track.cues.length} 条 · ${track.format.toUpperCase()}` : hint}</span>
    </label>
  );
}

export function BilingualImportModule({
  vm,
  notice,
  phase,
  drafts,
  projectName,
}: {
  vm: BilingualMeterViewModel;
  notice: string;
  phase: string;
  drafts: { foreign?: LanguageTrack; chinese?: LanguageTrack };
  projectName?: string;
}) {
  return (
    <section className="module import-module bilingual-import">
      <div className="module-head">
        <span className="module-kicker">01 / BILINGUAL IMPORT</span>
        <span className="local-mark">● 本地处理 · 两条轨分开解析</span>
      </div>
      <div className="bi-dropzone-row">
        <TrackDropzone
          label="外语"
          hint="英文等外语轨 · SRT / WebVTT"
          track={drafts.foreign}
          onFile={(file) => void vm.importTrack(file, "foreign")}
        />
        <TrackDropzone
          label="中文"
          hint="中文轨 · SRT / WebVTT"
          track={drafts.chinese}
          onFile={(file) => void vm.importTrack(file, "chinese")}
        />
      </div>
      <p className="bi-import-tip">
        两份字幕齐备后按时间自动配对；配对容差可在「配对复核」中调整。
      </p>
      {projectName && (
        <div className="file-status">
          <span className="status-dot" />
          双语项目：{projectName}
          <button
            className="bi-clear-button"
            onClick={() => void vm.clearProject()}
          >
            清空并重新导入
          </button>
        </div>
      )}
      {notice && (
        <div
          className={`notice ${phase === "error" ? "error" : ""}`}
          role="status"
        >
          {notice}
        </div>
      )}
    </section>
  );
}
