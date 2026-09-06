import { describe, expect, it } from "vitest";
import { buildResultJson, buildResultMarkdown } from "./export";
import type { Question } from "../types/question";
import type { StudyAttempt } from "../types/studyAttempt";

const questions: Question[] = [
  {
    id: "q1",
    sourceRow: 2,
    questionNumber: 1,
    category: "컴퓨팅",
    difficulty: "EASY",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: "가상서버 문제",
    options: [
      { key: "A", text: "EC2" },
      { key: "B", text: "S3" },
    ],
    correctAnswers: ["A"],
    explanation: "EC2가 정답입니다.",
  },
  {
    id: "q2",
    sourceRow: 3,
    questionNumber: 2,
    category: "스토리지",
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: "객체스토리지 문제",
    options: [
      { key: "A", text: "EBS" },
      { key: "B", text: "S3" },
    ],
    correctAnswers: ["B"],
    explanation: "S3가 정답입니다.",
  },
];

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
    submittedAt: "2026-09-04T01:00:00.000Z",
    progress: [
      { questionId: "q1", selectedAnswers: ["A"], status: "ANSWERED", reviewMarked: false, updatedAt: "2026-09-04T00:30:00.000Z" },
      { questionId: "q2", selectedAnswers: ["A"], status: "ANSWERED", reviewMarked: false, updatedAt: "2026-09-04T00:31:00.000Z" },
    ],
    ...overrides,
  };
}

describe("buildResultMarkdown", () => {

  it("진행 기록과 제출 시각이 없으면 미응답과 미제출로 내보냅니다", () => {
    const md = buildResultMarkdown(makeAttempt({ progress: [], submittedAt: undefined }), questions);
    expect(md).toContain("점수: 0% (0/2)");
    expect(md).toContain("오답: 0 · 미응답: 2");
    expect(md).toContain("제출 시각: 미제출");
    expect(md).toContain("1. 가상서버 문제 (미응답)");
    expect(md).toContain("- ✔ A. EC2");
    expect(md).toContain("- - B. S3");
  });

  it("오답 선택과 실제 정답의 표시를 구분합니다", () => {
    const md = buildResultMarkdown(makeAttempt(), questions);
    expect(md).toContain("- ✘ A. EBS");
    expect(md).toContain("- ✔ B. S3");
  });

  it("includes the score summary line", () => {
    const md = buildResultMarkdown(makeAttempt(), questions);
    expect(md).toContain("점수: 50% (1/2)");
  });

  it("marks the correct question as 정답 and the wrong one as 오답", () => {
    const md = buildResultMarkdown(makeAttempt(), questions);
    expect(md).toContain("1. 가상서버 문제 (정답)");
    expect(md).toContain("2. 객체스토리지 문제 (오답)");
  });

  it("includes each option's explanation-bearing question explanation text", () => {
    const md = buildResultMarkdown(makeAttempt(), questions);
    expect(md).toContain("EC2가 정답입니다.");
    expect(md).toContain("S3가 정답입니다.");
  });
});

describe("buildResultJson", () => {

  it("특수문자와 줄바꿈을 손실 없이 JSON으로 왕복합니다", () => {
    const text = '따옴표 "문제"\\경로\n다음 줄\t<&> 😀';
    const parsed = JSON.parse(buildResultJson(makeAttempt({ progress: [], submittedAt: undefined }), [
      { ...questions[0], text, explanation: text, category: undefined },
    ]));
    expect(parsed.submittedAt).toBeNull();
    expect(parsed.questions).toEqual([{
      questionNumber: 1,
      text,
      category: null,
      difficulty: "EASY",
      selectedAnswers: [],
      correctAnswers: ["A"],
      isCorrect: false,
      explanation: text,
    }]);
    expect(parsed.result.unansweredCount).toBe(1);
  });

  it("저장된 집계가 오래되어도 현재 답변으로 결과를 계산합니다", () => {
    const attempt = makeAttempt({
      result: { scorePercent: 100, correctCount: 2, incorrectCount: 0, unansweredCount: 0, categoryStats: [], difficultyStats: [] },
    });
    const parsed = JSON.parse(buildResultJson(attempt, questions));
    expect(parsed.result.scorePercent).toBe(50);
    expect(attempt.result?.scorePercent).toBe(100);
  });

  it("produces valid JSON with score and per-question grading", () => {
    const json = buildResultJson(makeAttempt(), questions);
    const parsed = JSON.parse(json);

    expect(parsed.result.scorePercent).toBe(50);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0]).toMatchObject({
      questionNumber: 1,
      isCorrect: true,
      selectedAnswers: ["A"],
      correctAnswers: ["A"],
    });
    expect(parsed.questions[1]).toMatchObject({
      questionNumber: 2,
      isCorrect: false,
    });
  });
});
