import { useState } from "react";
import type { Format } from "../../models";
import type { BilingualLanguage, BilingualProject } from "../bilingualModels";
import { LANGUAGE_META } from "../bilingualModels";
import type { BilingualMeterViewModel } from "../bilingualViewModel";

export function BilingualDeliveryModule({
  project,
  vm,
  phase,
}: {
  project: BilingualProject;
  vm: BilingualMeterViewModel;
  phase: string;
}) {
  const [mergedFormat, setMergedFormat] = useState<Format>("srt"),
    [enFormat, setEnFormat] = useState<Format>(project.tracks.en.format),
    [zhFormat, setZhFormat] = useState<Format>(project.tracks.zh.format);

  const orderLabel =
    project.settings.trackOrder === "en-first"
      ? "外语在上 · 中文在下"
      : "中文在上 · 外语在下";

  return (
    <section className="module version-module bilingual-delivery">
      <div className="module-head">
        <div>
          <span className="module-kicker">BI / 04 · 双语快照与交付</span>
          <h2>版本与导出</h2>
        </div>
        <span className="saved-label">● 自动保存双轨与对应关系</span>
      </div>

      <div className="version-row">
        <div>
          <strong>双语项目快照</strong>
          <small>
            {project.versions.length
              ? `最近：${project.versions.at(-1)?.label}`
              : "快照同时保存两条语言轨与配对关系，可整体回退"}
          </small>
        </div>
        <button
          className="secondary-button"
          onClick={() => void vm.saveVersion()}
        >
          ＋ 保存快照
        </button>
      </div>
      {project.versions.length > 0 && (
        <div className="version-list">
          {project.versions.map((version) => (
            <button
              key={version.id}
              onClick={() => void vm.restoreVersion(version.id)}
            >
              {version.label}
              <span>恢复 ↗</span>
            </button>
          ))}
        </div>
      )}

      <div className="bi-export-block">
        <div className="bi-export-head">
          <strong>合并为双语交付文件</strong>
          <small>
            同句两行，行序：{orderLabel}；可在「导入配对」页调整轨序规则
          </small>
        </div>
        <div className="export-row">
          <label>
            格式
            <select
              aria-label="合并导出格式"
              value={mergedFormat}
              onChange={(e) => setMergedFormat(e.target.value as Format)}
            >
              <option value="srt">SRT</option>
              <option value="vtt">WebVTT</option>
            </select>
          </label>
          <button
            className="export-button"
            disabled={phase === "exporting"}
            onClick={() => void vm.exportMerged(mergedFormat)}
          >
            导出双语合并字幕 <span>↓</span>
          </button>
        </div>
      </div>

      <div className="bi-export-block">
        <div className="bi-export-head">
          <strong>拆回两份独立字幕</strong>
          <small>各自使用本轨时间码与文本，互不影响</small>
        </div>
        <div className="bi-split-exports">
          {(["en", "zh"] as BilingualLanguage[]).map((language) => {
            const track = project.tracks[language],
              value = language === "en" ? enFormat : zhFormat,
              setValue = language === "en" ? setEnFormat : setZhFormat;
            return (
              <div className="bi-split-row" key={language}>
                <span className={`bi-lang-badge lang-${language}`}>
                  {LANGUAGE_META[language].short}
                </span>
                <div className="bi-split-meta">
                  <strong>{LANGUAGE_META[language].label}</strong>
                  <small>
                    {track.loaded
                      ? `${track.name} · ${track.cues.length} 条`
                      : "尚未导入此轨"}
                  </small>
                </div>
                <select
                  aria-label={`${LANGUAGE_META[language].label}导出格式`}
                  value={value}
                  disabled={!track.loaded}
                  onChange={(e) => setValue(e.target.value as Format)}
                >
                  <option value="srt">SRT</option>
                  <option value="vtt">WebVTT</option>
                </select>
                <button
                  className="secondary-button"
                  disabled={!track.loaded || phase === "exporting"}
                  onClick={() => void vm.exportTrack(language, value)}
                >
                  导出 <span>↓</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="privacy-note">
        双语项目、快照与两条语言轨仅保存在当前浏览器
      </p>
    </section>
  );
}
