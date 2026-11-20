import { describe, expect, it } from "vitest";
import type { StudyAttempt } from "../types/studyAttempt";
import { summarizeAttemptsBySheet } from "./sheetAttemptStatus";

function makeAttempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "1회차",
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

const submitted = "2026-09-05T00:00:00.000Z";

describe("summarizeAttemptsBySheet", () => {
  it("returns an empty map for no attempts", () => {
    expect(summarizeAttemptsBySheet([]).size).toBe(0);
  });

  it("counts submitted and in-progress tabs of a sheet", () => {
    const status = summarizeAttemptsBySheet([
      makeAttempt({ id: "a", sheetTabId: "0", submittedAt: submitted }),
      makeAttempt({ id: "b", sheetTabId: "1", submittedAt: submitted }),
      makeAttempt({ id: "c", sheetTabId: "2" }),
    ]).get("sheet-1");
    expect(status).toEqual({ attemptedTabs: 3, submittedTabs: 2, inProgressTabs: 1 });
  });

  it("counts several attempts of the same tab once", () => {
    const status = summarizeAttemptsBySheet([
      makeAttempt({ id: "a", submittedAt: submitted }),
      makeAttempt({ id: "b", submittedAt: submitted }),
    ]).get("sheet-1");
    expect(status).toEqual({ attemptedTabs: 1, submittedTabs: 1, inProgressTabs: 0 });
  });

  it("treats an attempt with only a result as submitted", () => {
    const result = {
      scorePercent: 100,
      correctCount: 1,
      incorrectCount: 0,
      unansweredCount: 0,
      categoryStats: [],
      difficultyStats: [],
    };
    const status = summarizeAttemptsBySheet([makeAttempt({ result })]).get("sheet-1");
    expect(status).toEqual({ attemptedTabs: 1, submittedTabs: 1, inProgressTabs: 0 });
  });

  it("counts a tab with both submitted and in-progress attempts in both", () => {
    const status = summarizeAttemptsBySheet([
      makeAttempt({ id: "a", submittedAt: submitted }),
      makeAttempt({ id: "b" }),
    ]).get("sheet-1");
    expect(status).toEqual({ attemptedTabs: 1, submittedTabs: 1, inProgressTabs: 1 });
  });

  it("summarizes each spreadsheet separately without changing the input", () => {
    const attempts = [
      makeAttempt({ id: "a", spreadsheetId: "sheet-1", submittedAt: submitted }),
      makeAttempt({ id: "b", spreadsheetId: "sheet-2" }),
    ];
    const copy = structuredClone(attempts);
    const summary = summarizeAttemptsBySheet(attempts);
    expect(summary.get("sheet-1")).toEqual({ attemptedTabs: 1, submittedTabs: 1, inProgressTabs: 0 });
    expect(summary.get("sheet-2")).toEqual({ attemptedTabs: 1, submittedTabs: 0, inProgressTabs: 1 });
    expect(attempts).toEqual(copy);
  });
});
