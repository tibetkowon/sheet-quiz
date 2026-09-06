// src/quiz/grading.test.ts
import { describe, expect, it } from "vitest";
import { computeStudyResult, gradeAttempt, gradeQuestion } from "./grading";
import type { Question } from "../types/question";
import type { QuestionProgress } from "../types/progress";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    sourceRow: 2,
    questionNumber: 1,
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: "문제",
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
    ],
    correctAnswers: ["A"],
    explanation: "해설",
    ...overrides,
  };
}

function makeProgress(overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    questionId: "q1",
    selectedAnswers: [],
    status: "UNSEEN",
    reviewMarked: false,
    updatedAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("gradeQuestion", () => {

  it("복수 정답을 비교해도 입력 배열 순서를 바꾸지 않습니다", () => {
    const question = makeQuestion({ type: "MULTIPLE", requiredAnswerCount: 2, correctAnswers: ["B", "A"] });
    const progress = makeProgress({ selectedAnswers: ["A", "B"] });
    Object.freeze(question.correctAnswers);
    Object.freeze(progress.selectedAnswers);
    expect(gradeQuestion(question, progress).isCorrect).toBe(true);
    expect(question.correctAnswers).toEqual(["B", "A"]);
    expect(progress.selectedAnswers).toEqual(["A", "B"]);
  });

  it("개수가 같아도 중복 선택으로 빠진 정답을 대체할 수 없습니다", () => {
    const question = makeQuestion({ type: "MULTIPLE", requiredAnswerCount: 2, correctAnswers: ["A", "B"] });
    expect(gradeQuestion(question, makeProgress({ selectedAnswers: ["A", "A"] })).isCorrect).toBe(false);
  });

  it.each(["UNSEEN", "ANSWERED", "SKIPPED"] as const)("상태 %s와 무관하게 실제 선택으로 채점합니다", (status) => {
    expect(gradeQuestion(makeQuestion(), makeProgress({ status, selectedAnswers: ["A"] })).isCorrect).toBe(true);
    expect(gradeQuestion(makeQuestion(), makeProgress({ status })).isAnswered).toBe(false);
  });

  it("marks a single-answer question correct on exact match", () => {
    const grade = gradeQuestion(makeQuestion(), makeProgress({ selectedAnswers: ["A"] }));
    expect(grade).toEqual({
      questionId: "q1",
      isAnswered: true,
      isCorrect: true,
      selectedAnswers: ["A"],
      correctAnswers: ["A"],
    });
  });

  it("marks a single-answer question incorrect on mismatch", () => {
    const grade = gradeQuestion(makeQuestion(), makeProgress({ selectedAnswers: ["B"] }));
    expect(grade.isAnswered).toBe(true);
    expect(grade.isCorrect).toBe(false);
  });

  it("marks an unanswered question as not answered and not correct", () => {
    const grade = gradeQuestion(makeQuestion(), makeProgress({ selectedAnswers: [] }));
    expect(grade.isAnswered).toBe(false);
    expect(grade.isCorrect).toBe(false);
  });

  it("requires an exact set match for multiple-answer questions (no partial credit)", () => {
    const question = makeQuestion({ type: "MULTIPLE", correctAnswers: ["A", "B"] });
    const partial = gradeQuestion(question, makeProgress({ selectedAnswers: ["A"] }));
    expect(partial.isCorrect).toBe(false);

    const extra = gradeQuestion(question, makeProgress({ selectedAnswers: ["A", "B", "C"] }));
    expect(extra.isCorrect).toBe(false);

    const exact = gradeQuestion(question, makeProgress({ selectedAnswers: ["B", "A"] }));
    expect(exact.isCorrect).toBe(true);
  });
});

describe("gradeAttempt", () => {

  it("진행 배열 순서와 무관하게 ID로 연결하고 다른 문제의 기록을 제외합니다", () => {
    const grades = gradeAttempt(
      [makeQuestion({ id: "q1" }), makeQuestion({ id: "q2" })],
      [
        makeProgress({ questionId: "q2", selectedAnswers: ["B"] }),
        makeProgress({ questionId: "deleted", selectedAnswers: ["A"] }),
        makeProgress({ questionId: "q1", selectedAnswers: ["A"] }),
      ],
    );
    expect(grades.map(({ questionId, isCorrect }) => ({ questionId, isCorrect }))).toEqual([
      { questionId: "q1", isCorrect: true },
      { questionId: "q2", isCorrect: false },
    ]);
  });

  it("grades every question even when a progress entry is missing", () => {
    const questions = [makeQuestion({ id: "q1" }), makeQuestion({ id: "q2" })];
    const grades = gradeAttempt(questions, [makeProgress({ questionId: "q1", selectedAnswers: ["A"] })]);
    expect(grades).toHaveLength(2);
    expect(grades[0].isCorrect).toBe(true);
    expect(grades[1].isAnswered).toBe(false);
  });
});

describe("computeStudyResult", () => {
  it("counts correct, incorrect, and unanswered separately", () => {
    const questions = [
      makeQuestion({ id: "q1", category: "A", difficulty: "EASY" }),
      makeQuestion({ id: "q2", category: "A", difficulty: "MEDIUM", correctAnswers: ["B"] }),
      makeQuestion({ id: "q3", category: "B", difficulty: "HARD" }),
    ];
    const progress = [
      makeProgress({ questionId: "q1", selectedAnswers: ["A"] }),
      makeProgress({ questionId: "q2", selectedAnswers: ["A"] }),
      makeProgress({ questionId: "q3", selectedAnswers: [] }),
    ];

    const result = computeStudyResult(questions, progress);

    expect(result.correctCount).toBe(1);
    expect(result.incorrectCount).toBe(1);
    expect(result.unansweredCount).toBe(1);
    expect(result.scorePercent).toBe(33);
  });

  it("groups category and difficulty stats, defaulting missing category to 미분류", () => {
    const questions = [
      makeQuestion({ id: "q1", category: undefined, difficulty: "EASY" }),
      makeQuestion({ id: "q2", category: "보안", difficulty: "EASY", correctAnswers: ["B"] }),
    ];
    const progress = [
      makeProgress({ questionId: "q1", selectedAnswers: ["A"] }),
      makeProgress({ questionId: "q2", selectedAnswers: ["A"] }),
    ];

    const result = computeStudyResult(questions, progress);

    expect(result.categoryStats).toEqual(
      expect.arrayContaining([
        { name: "미분류", total: 1, correct: 1 },
        { name: "보안", total: 1, correct: 0 },
      ]),
    );
    expect(result.difficultyStats).toEqual([{ name: "EASY", total: 2, correct: 1 }]);
  });

  it("returns a 0% score with no division-by-zero crash for an empty question set", () => {
    const result = computeStudyResult([], []);
    expect(result).toEqual({
      scorePercent: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
      categoryStats: [],
      difficultyStats: [],
    });
  });
});
