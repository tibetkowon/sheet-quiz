import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import ResumeSelectPage from "./ResumeSelectPage";
import { getDb } from "../storage/db";
import { selectSingleAnswer, submitAttempt } from "../quiz/attemptActions";

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
    lastViewedIndex: 1,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: [
      {
        questionId: "q1",
        selectedAnswers: ["A"],
        status: "ANSWERED",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
      {
        questionId: "q2",
        selectedAnswers: [],
        status: "UNSEEN",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
    ],
    questionSnapshot: [
      {
        id: "q1",
        sourceRow: 2,
        questionNumber: 1,
        difficulty: "MEDIUM",
        type: "SINGLE",
        requiredAnswerCount: 1,
        text: "문제 1",
        options: [
          { key: "A", text: "보기 A" },
          { key: "B", text: "보기 B" },
        ],
        correctAnswers: ["A"],
        explanation: "해설",
      },
      {
        id: "q2",
        sourceRow: 3,
        questionNumber: 2,
        difficulty: "MEDIUM",
        type: "SINGLE",
        requiredAnswerCount: 1,
        text: "문제 2",
        options: [
          { key: "A", text: "보기 A" },
          { key: "B", text: "보기 B" },
        ],
        correctAnswers: ["A"],
        explanation: "해설",
      },
    ] satisfies Question[],
  };
}

function renderResume(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/quiz/${id}/resume`]}>
      <Routes>
        <Route path="/quiz/:attemptId/resume" element={<ResumeSelectPage />} />
        <Route path="/quiz/:attemptId" element={<div>퀴즈 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResumeSelectPage", () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.clear("attempts");
  });

  it("shows progress so far and navigates to the quiz on 이어서 풀기", async () => {
    await saveAttempt(makeAttempt());
    renderResume("attempt-1");

    await waitFor(() => expect(screen.getByText(/1\/2 답변 완료/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "이어서 풀기" }));

    await waitFor(() => expect(screen.getByText("퀴즈 화면")).toBeInTheDocument());
  });

  it("resets progress and navigates to the quiz on 처음부터 다시 풀기", async () => {
    await saveAttempt(makeAttempt());
    renderResume("attempt-1");

    await waitFor(() => screen.getByRole("button", { name: "처음부터 다시 풀기" }));
    await userEvent.click(screen.getByRole("button", { name: "처음부터 다시 풀기" }));

    await waitFor(() => expect(screen.getByText("퀴즈 화면")).toBeInTheDocument());
    const reset = await getAttempt("attempt-1");
    expect(reset?.progress.every((p) => p.status === "UNSEEN")).toBe(true);
    expect(reset?.lastViewedIndex).toBe(0);
  });

  it("제출된 Sheet를 재시작한 뒤 자동저장과 최초 제출이 정상 동작합니다", async () => {
    const original = makeAttempt();
    const result = {
      scorePercent: 50,
      correctCount: 1,
      incorrectCount: 0,
      unansweredCount: 1,
      categoryStats: [],
      difficultyStats: [],
    };
    const submitted = submitAttempt(original, result);
    await saveAttempt(original);
    await saveAttempt(submitted);
    expect(await getAttempt(original.id)).toEqual(submitted);
    renderResume(original.id);

    await userEvent.click(await screen.findByRole("button", { name: "처음부터 다시 풀기" }));

    await screen.findByText("퀴즈 화면");
    const reset = await getAttempt(original.id);
    expect(reset).toBeDefined();
    expect(reset?.result).toBeUndefined();
    expect(reset?.submittedAt).toBeUndefined();
    expect(reset?.lastViewedIndex).toBe(0);
    expect(reset?.questionSnapshot).toEqual(original.questionSnapshot);
    expect(reset?.progress.every((p) =>
      p.status === "UNSEEN" && p.selectedAnswers.length === 0 && !p.reviewMarked,
    )).toBe(true);

    const answered = selectSingleAnswer(reset!, "q1", "B");
    await saveAttempt(answered);
    expect(await getAttempt(original.id)).toEqual(answered);
    const resubmitted = submitAttempt(answered, result);
    await saveAttempt(resubmitted);
    await saveAttempt(answered);
    expect(await getAttempt(original.id)).toEqual(resubmitted);
  });

  it("shows a not-found message when the attempt id doesn't exist", async () => {
    renderResume("missing-attempt");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });

  it("shows a not-found message when the attempt has no question snapshot", async () => {
    await saveAttempt({ ...makeAttempt(), questionSnapshot: undefined });
    renderResume("attempt-1");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });
});
