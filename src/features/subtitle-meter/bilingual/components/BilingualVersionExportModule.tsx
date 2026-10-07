import { useState } from "react";
import type { Format } from "../../models";
import type { BilingualMeterViewModel } from "../bilingualMeterViewModel";
import type { BilingualProject, MergeTimingBase } from "../models";
import { trackReadingSummary } from "../bilingualExporter";

export function BilingualVersionExportModule({
  project,
  vm,
  phase,
}: {
  project: BilingualProject;
  vm: BilingualMeterViewModel;
  phase: string;
}) {
  const [format, setFormat] = useState<Format>("srt");
  const [timingBase, setTimingBase] = useState<MergeTimingBase>("union");
  const summary = trackReadingSummary(project);
  return (
    <section className="module version-module bi-version-module">
      <div className="module-head">
        <div>
          <span className="module-kicker">04 / BILINGUAL DELIVERY</span>
          <h2>双语版本与交付</h2>
        </div>
        <span className="saved-label">● 自动保存</span>
      </div>

      <div className="version-row">
        <div>
          <strong>双语快照</strong>
          <small>
            {project.versions.length
              ? `最近：${project.versions.at(-1)?.label}`
              : "快照包含双轨时间轴与配对关系"}
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

      <div className="bi-reading-summary">
        <span>
          外语合计 <strong>{summary.foreign.units}</strong> 词
        </span>
        <span>
          中文合计 <strong>{summary.chinese.units}</strong> 字
        </span>
        <small>两种语言分别统计，未混合计量</small>
      </div>

      <div className="bi-export-block">
        <strong>合并为双语交付文件</strong>
        <div className="export-row">
          <label>
            格式
            <select
              aria-label="合并导出格式"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
            >
              <option value="srt">SRT</option>
              <option value="vtt">WebVTT</option>
            </select>
          </label>
          <label>
            时间基准
            <select
              aria-label="合并时间基准"
              value={timingBase}
              onChange={(e) => setTimingBase(e.target.value as MergeTimingBase)}
            >
              <option value="union">两侧并集（覆盖最全）</option>
              <option value="foreign">以外语轨时间</option>
              <option value="chinese">以中文轨时间</option>
            </select>
          </label>
          <button
            className="export-button"
            disabled={phase === "exporting"}
            onClick={() => void vm.exportMerged(format, timingBase)}
          >
            导出双语 <span>↓</span>
          </button>
        </div>
        <p className="privacy-note">
          轨序遵循规则：{project.rules.topLanguage === "foreign" ? "外语在上、中文在下" : "中文在上、外语在下"}
        </p>
      </div>

      <div className="bi-export-block">
        <strong>拆回两份独立字幕</strong>
        <div className="export-row">
          <button
            className="secondary-button"
            disabled={phase === "exporting"}
            onClick={() => void vm.exportSplit()}
          >
            分别导出外语 / 中文 SRT·VTT <span>↓</span>
          </button>
        </div>
        <p className="privacy-note">
          拆分文件保留各轨原始格式与当前（含关联编辑后的）时间轴
        </p>
      </div>
    </section>
  );
}
