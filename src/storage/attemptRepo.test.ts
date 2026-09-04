import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "./attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";

function makeAttempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "문제은행",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: [],
    ...overrides,
  };
}

describe("attemptRepo", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("returns undefined when no attempt is saved", async () => {
    expect(await getAttempt("missing")).toBeUndefined();
  });

  it("saves and retrieves an attempt by id", async () => {
    const attempt = makeAttempt();
    await saveAttempt(attempt);
    expect(await getAttempt("attempt-1")).toEqual(attempt);
  });

  it("overwrites the same attempt id on repeated saves", async () => {
    await saveAttempt(makeAttempt({ lastViewedIndex: 0 }));
    await saveAttempt(makeAttempt({ lastViewedIndex: 3 }));
    expect((await getAttempt("attempt-1"))?.lastViewedIndex).toBe(3);
  });

  it("keeps attempts for different ids separate", async () => {
    await saveAttempt(makeAttempt({ id: "attempt-1" }));
    await saveAttempt(makeAttempt({ id: "attempt-2", sheetTabName: "다른 탭" }));
    expect((await getAttempt("attempt-1"))?.sheetTabName).toBe("문제은행");
    expect((await getAttempt("attempt-2"))?.sheetTabName).toBe("다른 탭");
  });
});
