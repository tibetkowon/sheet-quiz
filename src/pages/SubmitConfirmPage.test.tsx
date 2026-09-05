import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import SubmitConfirmPage from "./SubmitConfirmPage";

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

function makeAttempt(questions: Question[], progressOverrides: Partial<StudyAttempt["progress"][number]>[] = []): StudyAttempt {
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
    progress: questions.map((q, i) => ({
      questionId: q.id,
      selectedAnswers: [],
      status: "UNSEEN" as const,
      reviewMarked: false,
      updatedAt: "2026-09-05T00:00:00.000Z",
      ...progressOverrides[i],
    })),
    questionSnapshot: questions,
  };
}

function renderConfirm(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/quiz/${id}/submit`]}>
      <Routes>
        <Route path="/quiz/:attemptId/submit" element={<SubmitConfirmPage />} />
        <Route path="/quiz/:attemptId" element={<div>퀴즈 화면</div>} />
        <Route path="/results/:attemptId" element={<div>결과 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SubmitConfirmPage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("shows the current progress counts", async () => {
    await saveAttempt(
      makeAttempt(
        [makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)],
        [{ status: "ANSWERED", selectedAnswers: ["A"] }, { status: "SKIPPED" }, {}],
      ),
    );

    renderConfirm("attempt-1");

    await waitFor(() => screen.getByText("제출하기 전에 확인하세요"));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("navigates back to the quiz on 계속 풀기", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1)]));

    renderConfirm("attempt-1");
    await waitFor(() => screen.getByRole("button", { name: "계속 풀기" }));
    await userEvent.click(screen.getByRole("button", { name: "계속 풀기" }));

    await waitFor(() => expect(screen.getByText("퀴즈 화면")).toBeInTheDocument());
  });

  it("grades, saves, and navigates to results on 제출하기", async () => {
    await saveAttempt(
      makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)], [{ selectedAnswers: ["A"] }, { selectedAnswers: ["B"] }]),
    );

    renderConfirm("attempt-1");
    await waitFor(() => screen.getByRole("button", { name: "제출하기" }));
    await userEvent.click(screen.getByRole("button", { name: "제출하기" }));

    await waitFor(() => expect(screen.getByText("결과 화면")).toBeInTheDocument());
    const saved = await getAttempt("attempt-1");
    expect(saved?.result?.correctCount).toBe(1);
    expect(saved?.result?.incorrectCount).toBe(1);
    expect(saved?.submittedAt).toBeDefined();
  });

  it("shows a not-found message when the attempt id doesn't exist", async () => {
    renderConfirm("missing-attempt");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });

  it("counts a held-but-answered question as 답변완료, not 미응답", async () => {
    await saveAttempt(
      makeAttempt([makeQuestion("q1", 1)], [{ status: "SKIPPED", selectedAnswers: ["A"] }]),
    );

    renderConfirm("attempt-1");
    await waitFor(() => screen.getByText("제출하기 전에 확인하세요"));

    const answeredTile = screen.getByText("답변완료").parentElement;
    expect(within(answeredTile as HTMLElement).getByText("1")).toBeInTheDocument();

    const unseenTile = screen.getByText("미응답").parentElement;
    expect(within(unseenTile as HTMLElement).getByText("0")).toBeInTheDocument();
  });
});
