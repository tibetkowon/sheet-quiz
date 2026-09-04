// src/quiz/navigation.test.ts
import { describe, expect, it } from "vitest";
import {
  buildNavigatorItems,
  buildProgressByQuestionId,
  findNextFlaggedIndex,
  findNextIndexByStatus,
  summarizeProgress,
} from "./navigation";
import type { Question } from "../types/question";
import type { QuestionProgress } from "../types/progress";

function makeQuestion(id: string, questionNumber: number): Question {
  return {
    id,
    sourceRow: questionNumber + 1,
    questionNumber,
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: `문제 ${questionNumber}`,
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
    ],
    correctAnswers: ["A"],
    explanation: "해설",
  };
}

function makeProgress(questionId: string, overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    questionId,
    selectedAnswers: [],
    status: "UNSEEN",
    reviewMarked: false,
    updatedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

const questions = [makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)];

describe("buildNavigatorItems", () => {
  it("marks the current index and carries each question's status/flag", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2", { status: "SKIPPED", reviewMarked: true }),
      makeProgress("q3"),
    ]);

    const items = buildNavigatorItems(questions, progress, 1);

    expect(items).toEqual([
      { index: 0, questionId: "q1", questionNumber: 1, status: "ANSWERED", reviewMarked: false, isCurrent: false },
      { index: 1, questionId: "q2", questionNumber: 2, status: "SKIPPED", reviewMarked: true, isCurrent: true },
      { index: 2, questionId: "q3", questionNumber: 3, status: "UNSEEN", reviewMarked: false, isCurrent: false },
    ]);
  });
});

describe("summarizeProgress", () => {
  it("counts answered, held, unseen, and flagged independently", () => {
    const summary = summarizeProgress([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2", { status: "SKIPPED", reviewMarked: true }),
      makeProgress("q3", { reviewMarked: true }),
    ]);

    expect(summary).toEqual({ total: 3, answered: 1, held: 1, unseen: 1, flagged: 2 });
  });
});

describe("findNextIndexByStatus", () => {
  it("finds the next question with a given status, wrapping around", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2"),
      makeProgress("q3"),
    ]);

    expect(findNextIndexByStatus(questions, progress, 0, "UNSEEN")).toBe(1);
    expect(findNextIndexByStatus(questions, progress, 1, "UNSEEN")).toBe(2);
    expect(findNextIndexByStatus(questions, progress, 2, "UNSEEN")).toBe(1);
  });

  it("returns null when no question has the target status", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2", { status: "ANSWERED" }),
      makeProgress("q3", { status: "ANSWERED" }),
    ]);

    expect(findNextIndexByStatus(questions, progress, 0, "UNSEEN")).toBeNull();
  });
});

describe("findNextFlaggedIndex", () => {
  it("finds the next flagged question, wrapping around", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1"),
      makeProgress("q2", { reviewMarked: true }),
      makeProgress("q3"),
    ]);

    expect(findNextFlaggedIndex(questions, progress, 0)).toBe(1);
    expect(findNextFlaggedIndex(questions, progress, 1)).toBe(1);
  });

  it("returns null when nothing is flagged", () => {
    const progress = buildProgressByQuestionId([makeProgress("q1"), makeProgress("q2"), makeProgress("q3")]);
    expect(findNextFlaggedIndex(questions, progress, 0)).toBeNull();
  });
});
