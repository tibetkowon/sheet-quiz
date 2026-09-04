import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { TopFolderSelection } from "./topFolderRepo";
import type { StudyAttempt } from "../types/studyAttempt";

export interface SheetQuizDB extends DBSchema {
  topFolder: {
    key: string;
    value: TopFolderSelection;
  };
  attempts: {
    key: string;
    value: StudyAttempt;
    indexes: {
      googleUserId: string;
      bySheetTab: [string, string];
    };
  };
}

const DB_NAME = "sheet-quiz";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SheetQuizDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SheetQuizDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SheetQuizDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("topFolder")) {
          db.createObjectStore("topFolder", { keyPath: "googleUserId" });
        }
        if (!db.objectStoreNames.contains("attempts")) {
          const store = db.createObjectStore("attempts", { keyPath: "id" });
          store.createIndex("googleUserId", "googleUserId");
          store.createIndex("bySheetTab", ["spreadsheetId", "sheetTabId"]);
        }
      },
    });
  }
  return dbPromise;
}
