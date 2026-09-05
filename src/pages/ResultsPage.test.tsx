// src/pages/ResultsPage.test.tsx
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { saveAttempt } from "../storage/attemptRepo";
import { computeStudyResult } from "../quiz/grading";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import ResultsPage from "./ResultsPage";

function makeQuestion(id: string, questionNumber: number, overrides: Partial<Question> = {}): Question {
  return {
    id,
    sourceRow: questionNumber + 1,
    questionNumber,
    category: "컴퓨팅",
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: `문제 ${questionNumber} 본문`,
    options: [
      { key: "A", text: "정답 보기", explanation: "A가 정답인 이유" },
      { key: "B", text: "오답 보기", explanation: "B가 오답인 이유" },
    ],
    correctAnswers: ["A"],
    explanation: `문제 ${questionNumber} 해설`,
    ...overrides,
  };
}

function makeSubmittedAttempt(): StudyAttempt {
  const questions = [
    makeQuestion("q1", 1, { category: "컴퓨팅", difficulty: "EASY" }),
    makeQuestion("q2", 2, { category: "보안", difficulty: "MEDIUM" }),
    makeQuestion("q3", 3, { category: "네트워크", difficulty: "HARD" }),
  ];
  const progress = [
    { questionId: "q1", selectedAnswers: ["A"], status: "ANSWERED" as const, reviewMarked: false, updatedAt: "" },
    { questionId: "q2", selectedAnswers: ["B"], status: "ANSWERED" as const, reviewMarked: true, updatedAt: "" },
    { questionId: "q3", selectedAnswers: [], status: "UNSEEN" as const, reviewMarked: false, updatedAt: "" },
  ];
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
    startedAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    submittedAt: "2026-09-05T00:05:00.000Z",
    progress,
    questionSnapshot: questions,
    result: computeStudyResult(questions, progress),
  };
}

function renderResults(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/results/${id}`]}>
      <Routes>
        <Route path="/results/:attemptId" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResultsPage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("shows the score, correct/total, and flagged counts", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");

    await waitFor(() => expect(screen.getByText("33%")).toBeInTheDocument());
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("filters to only incorrect questions when 오답 is selected", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");
    await waitFor(() => screen.getByText("문제 1 본문"));
    expect(screen.getByText("문제 2 본문")).toBeInTheDocument();
    expect(screen.getByText("문제 3 본문")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "오답" }));

    expect(screen.queryByText("문제 1 본문")).not.toBeInTheDocument();
    expect(screen.getByText("문제 2 본문")).toBeInTheDocument();
    expect(screen.queryByText("문제 3 본문")).not.toBeInTheDocument();
  });

  it("reflects live progress even when the stored result snapshot is stale", async () => {
    const attempt = makeSubmittedAttempt();
    // Simulate a post-submission edit: q3 was originally unanswered (incorrect for
    // scoring purposes) but the user went back and answered it correctly, WITHOUT
    // resubmitting — attempt.result is now stale relative to attempt.progress.
    const editedProgress = attempt.progress.map((p) =>
      p.questionId === "q3" ? { ...p, selectedAnswers: ["A"], status: "ANSWERED" as const } : p,
    );
    await saveAttempt({ ...attempt, progress: editedProgress });

    renderResults("attempt-1");

    // Original stored result was 33% (1/3); live recomputation should now show 67% (2/3).
    await waitFor(() => expect(screen.getByText("67%")).toBeInTheDocument());
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("filters to only correct questions when 정답 is selected", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");
    await waitFor(() => screen.getByText("문제 1 본문"));

    await userEvent.click(screen.getByRole("button", { name: "정답" }));

    expect(screen.getByText("문제 1 본문")).toBeInTheDocument();
    expect(screen.queryByText("문제 2 본문")).not.toBeInTheDocument();
    expect(screen.queryByText("문제 3 본문")).not.toBeInTheDocument();
  });

  it("filters to only unanswered questions when 미응답 is selected", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");
    await waitFor(() => screen.getByText("문제 1 본문"));

    await userEvent.click(screen.getByRole("button", { name: "미응답" }));

    expect(screen.queryByText("문제 1 본문")).not.toBeInTheDocument();
    expect(screen.queryByText("문제 2 본문")).not.toBeInTheDocument();
    expect(screen.getByText("문제 3 본문")).toBeInTheDocument();
  });

  it("filters to only flagged questions when 다시 볼 문제 is selected", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");
    await waitFor(() => screen.getByText("문제 1 본문"));

    await userEvent.click(screen.getByRole("button", { name: "다시 볼 문제" }));

    expect(screen.queryByText("문제 1 본문")).not.toBeInTheDocument();
    expect(screen.getByText("문제 2 본문")).toBeInTheDocument();
    expect(screen.queryByText("문제 3 본문")).not.toBeInTheDocument();
  });

  it("expands a question to show per-option correctness and explanations", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");
    await waitFor(() => screen.getByText("문제 2 본문"));

    await userEvent.click(screen.getByText("문제 2 본문"));

    expect(screen.getByText("A가 정답인 이유")).toBeInTheDocument();
    expect(screen.getByText("B가 오답인 이유")).toBeInTheDocument();
  });

  it("shows a not-found message when the attempt hasn't been submitted", async () => {
    const attempt = makeSubmittedAttempt();
    await saveAttempt({ ...attempt, result: undefined, submittedAt: undefined });

    renderResults("attempt-1");

    await waitFor(() =>
      expect(screen.getByText(/제출된 결과를 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });
});
