import { useState } from "react";
import React from "react";
import ReactDOM from "react-dom/client";
import { SubtitleMeter } from "./features/subtitle-meter/views/SubtitleMeter";
import { BilingualMeter } from "./features/subtitle-meter/bilingual/views/BilingualMeter";
import "./styles.css";

const MODE_KEY = "subtitle-meter.mode";

function AppRoot() {
  const [mode, setMode] = useState<"mono" | "bilingual">(() =>
    localStorage.getItem(MODE_KEY) === "bilingual" ? "bilingual" : "mono",
  );
  const switchMode = (next: "mono" | "bilingual") => {
    localStorage.setItem(MODE_KEY, next);
    setMode(next);
  };
  return mode === "bilingual" ? (
    <BilingualMeter onSwitchMode={() => switchMode("mono")} />
  ) : (
    <SubtitleMeter onSwitchMode={() => switchMode("bilingual")} />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);
