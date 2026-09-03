import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { TopFolderSelection } from "./topFolderRepo";

export interface SheetQuizDB extends DBSchema {
  topFolder: {
    key: string;
    value: TopFolderSelection;
  };
}

const DB_NAME = "sheet-quiz";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SheetQuizDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SheetQuizDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SheetQuizDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("topFolder")) {
          db.createObjectStore("topFolder", { keyPath: "googleUserId" });
        }
      },
    });
  }
  return dbPromise;
}
