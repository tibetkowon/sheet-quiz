import { describe, expect, it } from "vitest";
import {
  markFirstViewed,
  markHeld,
  moveToIndex,
  restartAttempt,
  selectSingleAnswer,
  toggleMultipleAnswer,
  toggleReviewMarked,
} from "./attemptActions";
import type { StudyAttempt } from "../types/studyAttempt";

function makeAttempt(): StudyAttempt {
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
    progress: [
      {
        questionId: "q1",
        selectedAnswers: [],
        status: "UNSEEN",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
      {
        questionId: "q2",
        selectedAnswers: ["A"],
        status: "ANSWERED",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
    ],
  };
}

describe("selectSingleAnswer", () => {
  it("replaces the selection and marks the question answered", () => {
    const result = selectSingleAnswer(makeAttempt(), "q1", "B");
    const progress = result.progress.find((p) => p.questionId === "q1")!;
    expect(progress.selectedAnswers).toEqual(["B"]);
    expect(progress.status).toBe("ANSWERED");
    expect(progress.answeredAt).toBeDefined();
  });

  it("does not mutate the original attempt", () => {
    const original = makeAttempt();
    selectSingleAnswer(original, "q1", "B");
    expect(original.progress.find((p) => p.questionId === "q1")!.selectedAnswers).toEqual([]);
  });
});

describe("toggleMultipleAnswer", () => {
  it("adds an option not yet selected", () => {
    const result = toggleMultipleAnswer(makeAttempt(), "q1", "A");
    const progress = result.progress.find((p) => p.questionId === "q1")!;
    expect(progress.selectedAnswers).toEqual(["A"]);
    expect(progress.status).toBe("ANSWERED");
  });

  it("removes an option already selected, reverting to UNSEEN when empty", () => {
    const result = toggleMultipleAnswer(makeAttempt(), "q2", "A");
    const progress = result.progress.find((p) => p.questionId === "q2")!;
    expect(progress.selectedAnswers).toEqual([]);
    expect(progress.status).toBe("UNSEEN");
  });
});

describe("markHeld", () => {
  it("sets status to SKIPPED without touching selected answers", () => {
    const result = markHeld(makeAttempt(), "q2");
    const progress = result.progress.find((p) => p.questionId === "q2")!;
    expect(progress.status).toBe("SKIPPED");
    expect(progress.selectedAnswers).toEqual(["A"]);
  });
});

describe("toggleReviewMarked", () => {
  it("flips reviewMarked on and back off", () => {
    const once = toggleReviewMarked(makeAttempt(), "q1");
    expect(once.progress.find((p) => p.questionId === "q1")!.reviewMarked).toBe(true);
    const twice = toggleReviewMarked(once, "q1");
    expect(twice.progress.find((p) => p.questionId === "q1")!.reviewMarked).toBe(false);
  });
});

describe("markFirstViewed", () => {
  it("sets firstViewedAt only the first time", () => {
    const once = markFirstViewed(makeAttempt(), "q1");
    const firstTimestamp = once.progress.find((p) => p.questionId === "q1")!.firstViewedAt;
    expect(firstTimestamp).toBeDefined();

    const twice = markFirstViewed(once, "q1");
    expect(twice.progress.find((p) => p.questionId === "q1")!.firstViewedAt).toBe(firstTimestamp);
  });
});

describe("moveToIndex", () => {
  it("updates lastViewedIndex", () => {
    const result = moveToIndex(makeAttempt(), 1);
    expect(result.lastViewedIndex).toBe(1);
  });
});

describe("restartAttempt", () => {
  it("resets every question's progress and lastViewedIndex", () => {
    const result = restartAttempt(makeAttempt());
    expect(result.lastViewedIndex).toBe(0);
    for (const p of result.progress) {
      expect(p.selectedAnswers).toEqual([]);
      expect(p.status).toBe("UNSEEN");
      expect(p.reviewMarked).toBe(false);
      expect(p.firstViewedAt).toBeUndefined();
      expect(p.answeredAt).toBeUndefined();
    }
  });
});
