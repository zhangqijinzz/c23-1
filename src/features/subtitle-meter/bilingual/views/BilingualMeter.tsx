import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BilingualImportModule } from "../components/BilingualImportModule";
import { BilingualTimelineModule } from "../components/BilingualTimelineModule";
import { BilingualInspectionModule } from "../components/BilingualInspectionModule";
import { BilingualDeliveryModule } from "../components/BilingualDeliveryModule";
import { BilingualMeterViewModel } from "../bilingualViewModel";

const tabs = [
  { id: "import", number: "01", label: "双语导入", hint: "两轨导入与自动配对" },
  { id: "timeline", number: "02", label: "时间轴", hint: "双轨联动调整" },
  {
    id: "inspection",
    number: "03",
    label: "分轨校对",
    hint: "阅读速度分语言统计",
  },
  {
    id: "delivery",
    number: "04",
    label: "双语交付",
    hint: "合并导出或拆回两份",
  },
] as const;
type TabId = (typeof tabs)[number]["id"];

const DEMO_EN =
  "1\n00:00:01,000 --> 00:00:03,600\nSubtitle rhythm gives the story room to breathe.\n\n2\n00:00:03,750 --> 00:00:06,200\nLet every line stay just long enough to read.\n\n3\n00:00:06,350 --> 00:00:08,900\nClear, unhurried, never missing a beat.";
const DEMO_ZH =
  "1\n00:00:01,120 --> 00:00:03,500\n字幕的节奏，决定了内容的呼吸。\n\n2\n00:00:03,700 --> 00:00:06,300\n让每一行，都有恰好的停留时间。\n\n3\n00:00:06,500 --> 00:00:09,100\n清晰、从容，不错过每一个重点。";

export function BilingualMeter({ onSwitchMode }: { onSwitchMode: () => void }) {
  const vm = useMemo(() => new BilingualMeterViewModel(), []),
    state = useSyncExternalStore(vm.subscribe, vm.getSnapshot);
  const [activeTab, setActiveTab] = useState<TabId>("import"),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    void vm.restore();
  }, [vm]);

  const project = state.project,
    enLoaded = project.tracks.en.loaded,
    zhLoaded = project.tracks.zh.loaded,
    hasAny = enLoaded || zhLoaded;

  const loadDemo = async () => {
    await vm.importTrack(
      "en",
      new File([DEMO_EN], "demo-en.srt", { type: "text/plain" }),
    );
    await vm.importTrack(
      "zh",
      new File([DEMO_ZH], "demo-zh.srt", { type: "text/plain" }),
    );
  };

  const emptyTab = (title: string, description: string) => (
    <section className="module tab-empty-state">
      <span className="empty-tab-mark">双</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button onClick={() => setActiveTab("import")}>
        前往双语导入 <span>→</span>
      </button>
    </section>
  );

  return (
    <main className="app-shell bilingual-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">双</span>
          <span>
            subtitle<span className="brand-light">meter · bilingual</span>
          </span>
        </a>
        <div className="topbar-right">
          <button className="mode-switch" onClick={onSwitchMode}>
            切换到单语项目
          </button>
          <span className="local-pill">
            <i /> 所有处理均在本地
          </span>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">
            <span /> BILINGUAL DELIVERY PIPELINE
          </div>
          <h1>
            中英两轨，<em>按时间自动对应。</em>
          </h1>
          <p>
            两份字幕同时导入、按容差自动配对，配不上的交由人工并入或新建；阅读速度分语言统计，交付可合可拆。
          </p>
        </div>
        <div className="hero-stats">
          <span>双语配对</span>
          <strong>
            {project.pairs.filter((pair) => pair.enId && pair.zhId).length}
            <small> / {project.pairs.length} 对</small>
          </strong>
        </div>
      </section>

      <nav className="module-tabs" role="tablist" aria-label="双语校对模块">
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
            {tab.id === "import" && state.review.length > 0 && (
              <span className="tab-count">{state.review.length}</span>
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
              project={project}
              review={state.review}
              phase={state.phase}
              notice={state.notice}
            />
            {!hasAny && (
              <section className="module import-welcome">
                <div className="welcome-icon">双</div>
                <div>
                  <h2>从中英两份字幕开始</h2>
                  <p>先导入任一条轨，第二条导入后会按当前容差自动配对。</p>
                  <button onClick={() => void loadDemo()}>
                    载入中英示例对 <span>→</span>
                  </button>
                </div>
                <div className="welcome-checks">
                  <span>容差内自动配对</span>
                  <span>偏差与缺失人工决策</span>
                  <span>合并 / 拆分两种交付</span>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === "timeline" &&
          (enLoaded && zhLoaded ? (
            <div className="module-page">
              <BilingualTimelineModule
                project={project}
                vm={vm}
                selectedPairId={state.selectedPairId}
                zoom={zoom}
                onZoom={setZoom}
              />
              <p className="page-tip">
                两条语言轨互相关联：锁定配对拖动任一侧，另一侧即时同步平移；解锁后各自独立。
              </p>
            </div>
          ) : (
            emptyTab(
              "两条轨都导入后查看双语时间轴",
              "配对会以连线呈现，超阈值的配对连线会高亮提示。",
            )
          ))}

        {activeTab === "inspection" &&
          (hasAny ? (
            <div className="module-page">
              <BilingualInspectionModule
                project={project}
                issues={state.issues}
                vm={vm}
                selectedPairId={state.selectedPairId}
              />
            </div>
          ) : (
            emptyTab(
              "导入字幕后开始分轨校对",
              "中文按汉字、外语按单词分别计算阅读速度，两种语言字符不混合统计。",
            )
          ))}

        {activeTab === "delivery" &&
          (hasAny ? (
            <div className="module-page delivery-page">
              <BilingualDeliveryModule
                project={project}
                vm={vm}
                phase={state.phase}
              />
            </div>
          ) : (
            emptyTab(
              "导入字幕后管理双语交付",
              "可导出外语在上中文在下的合并字幕，也可拆回两份独立字幕。",
            )
          ))}
      </section>

      <footer>
        <span>SUBTITLEMETER · 双语交付链路</span>
        <span>PACE IS MEASURED PER LANGUAGE</span>
      </footer>
    </main>
  );
}
