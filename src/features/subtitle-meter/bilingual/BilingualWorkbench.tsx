import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  createBilingualViewModel,
} from "./bilingualMeterViewModel";
import { BilingualImportModule } from "./components/BilingualImportModule";
import { PairingReviewModule } from "./components/PairingReviewModule";
import { BilingualTimelineModule } from "./components/BilingualTimelineModule";
import { BilingualEditPanel } from "./components/BilingualEditPanel";
import { BilingualPreviewModule } from "./components/BilingualPreviewModule";
import { BilingualVersionExportModule } from "./components/BilingualVersionExportModule";

const tabs = [
  { id: "import", number: "01", label: "双轨导入", hint: "同时导入中外两份字幕" },
  { id: "review", number: "02", label: "配对复核", hint: "处理配不上与偏差过大" },
  { id: "timeline", number: "03", label: "关联时间轴", hint: "双轨联动调整时间" },
  { id: "delivery", number: "04", label: "双语交付", hint: "合并或拆分导出" },
] as const;
type TabId = (typeof tabs)[number]["id"];

export function BilingualWorkbench() {
  const vm = useMemo(createBilingualViewModel, []),
    state = useSyncExternalStore(vm.subscribe, vm.getSnapshot);
  const [activeTab, setActiveTab] = useState<TabId>("import");
  useEffect(() => {
    void vm.restore();
  }, [vm]);
  const project = state.project;

  const emptyTab = (title: string, description: string) => (
    <section className="module tab-empty-state">
      <span className="empty-tab-mark">双</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button onClick={() => setActiveTab("import")}>
        前往双轨导入 <span>→</span>
      </button>
    </section>
  );

  const unresolved = state.pairing
    ? state.pairing.drift + state.pairing.foreignOnly + state.pairing.chineseOnly
    : 0;

  return (
    <>
      <nav className="module-tabs" role="tablist" aria-label="双语项目模块">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`bi-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="bi-module-panel"
            className={`module-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-number">{tab.number}</span>
            <span className="tab-copy">
              <strong>{tab.label}</strong>
              <small>{tab.hint}</small>
            </span>
            {tab.id === "review" && project && unresolved > 0 && (
              <span className="tab-count">{unresolved}</span>
            )}
          </button>
        ))}
      </nav>
      <section
        id="bi-module-panel"
        className="module-panel"
        role="tabpanel"
        aria-labelledby={`bi-tab-${activeTab}`}
      >
        {activeTab === "import" && (
          <div className="module-page import-page">
            <BilingualImportModule
              vm={vm}
              notice={state.notice}
              phase={state.phase}
              drafts={state.drafts}
              projectName={project?.name}
            />
            {project && state.pairing && (
              <section className="module project-overview">
                <div>
                  <span className="module-kicker">BILINGUAL PROJECT</span>
                  <h2>{project.name}</h2>
                  <p>
                    外语 {project.foreign.cues.length} 条 · 中文{" "}
                    {project.chinese.cues.length} 条 · 配对{" "}
                    {state.pairing.matched + state.pairing.drift} 条 · 已自动保存
                  </p>
                </div>
                <div className="overview-count">
                  <strong>{unresolved}</strong>
                  <span>待人工处理</span>
                </div>
              </section>
            )}
          </div>
        )}
        {activeTab === "review" &&
          (project && state.pairing ? (
            <div className="module-page">
              <PairingReviewModule
                vm={vm}
                pairing={state.pairing}
                rules={project.rules}
                selection={state.selection}
                foreignIssues={state.foreignIssues}
                chineseIssues={state.chineseIssues}
              />
              <BilingualEditPanel
                pairing={state.pairing}
                vm={vm}
                selection={state.selection}
              />
            </div>
          ) : (
            emptyTab(
              "导入双份字幕后开始配对",
              "中外两份字幕会按起始时间自动配对，配不上与偏差过大的条目单独列出由你决定。",
            )
          ))}
        {activeTab === "timeline" &&
          (project && state.pairing ? (
            <div className="module-page">
              <BilingualTimelineModule
                project={project}
                vm={vm}
                pairing={state.pairing}
                selectedCue={state.selection}
                zoom={state.zoom}
              />
              <BilingualPreviewModule project={project} pairing={state.pairing} />
            </div>
          ) : (
            emptyTab(
              "导入双份字幕后查看关联时间轴",
              "两条语言轨上下排列，配对关系以连线标出，改动任一条对应偏差即时更新。",
            )
          ))}
        {activeTab === "delivery" &&
          (project ? (
            <div className="module-page delivery-page">
              <BilingualVersionExportModule
                project={project}
                vm={vm}
                phase={state.phase}
              />
            </div>
          ) : (
            emptyTab(
              "导入双份字幕后管理双语交付",
              "可合并成外语在上中文在下的交付文件，也可拆回两份独立字幕。",
            )
          ))}
      </section>
    </>
  );
}
