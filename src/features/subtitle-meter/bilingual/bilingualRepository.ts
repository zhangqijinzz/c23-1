import { readRecord, writeRecord } from "../services/indexedDbService";
import {
  BILINGUAL_STORAGE_ID,
  emptyBilingualProject,
  type BilingualProject,
} from "./bilingualModels";

function isValid(value: unknown): value is BilingualProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<BilingualProject>;
  if (!project.tracks || !project.settings) return false;
  const tracks = project.tracks as Partial<BilingualProject["tracks"]>;
  return Boolean(
    tracks.en &&
      Array.isArray(tracks.en.cues) &&
      tracks.zh &&
      Array.isArray(tracks.zh.cues) &&
      Array.isArray(project.pairs) &&
      Array.isArray(project.versions),
  );
}

export const bilingualRepository = {
  async load(): Promise<BilingualProject | null> {
    try {
      const value = await readRecord<unknown>(BILINGUAL_STORAGE_ID);
      if (!isValid(value)) return null;
      return value;
    } catch {
      return null;
    }
  },
  async save(project: BilingualProject): Promise<void> {
    await writeRecord(BILINGUAL_STORAGE_ID, project);
  },
  empty: emptyBilingualProject,
};
