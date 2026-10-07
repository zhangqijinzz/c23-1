import type { BilingualProject } from "../bilingual/models";
import {
  bilingualProjectId,
  isBilingualProject,
} from "../bilingual/models";
import { openDb, STORE } from "./indexedDbService";

export async function readBilingualProject(): Promise<BilingualProject | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE)
      .objectStore(STORE)
      .get(bilingualProjectId);
    request.onsuccess = () => {
      const value = request.result;
      resolve(isBilingualProject(value) ? value : null);
      db.close();
    };
    request.onerror = () => {
      reject(request.error);
      db.close();
    };
  });
}

export async function writeBilingualProject(
  project: BilingualProject,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction
      .objectStore(STORE)
      .put({ ...project, id: bilingualProjectId });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("本地保存失败"));
    };
  });
}

export async function deleteBilingualProject(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(bilingualProjectId);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("本地删除失败"));
    };
  });
}
