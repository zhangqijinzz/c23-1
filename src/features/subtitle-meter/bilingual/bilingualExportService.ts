import type { BilingualProject } from "./bilingualModels";

export function downloadTextFile(
  name: string,
  content: string,
  format: "srt" | "vtt",
): void {
  const blob = new Blob([content], {
    type:
      format === "vtt" ? "text/vtt;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function baseName(name: string): string {
  return name.replace(/\.(srt|vtt)$/i, "");
}

export function bilingualExportNames(project: BilingualProject): {
  merged: string;
  en: string;
  zh: string;
} {
  const stem =
    baseName(project.name || project.tracks.en.name || "bilingual-project") ||
    "bilingual-project";
  return {
    merged: `${stem}-bilingual`,
    en: `${stem}-en`,
    zh: `${stem}-zh`,
  };
}
