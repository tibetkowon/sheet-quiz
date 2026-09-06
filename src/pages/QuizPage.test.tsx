// src/pages/QuizPage.test.tsx
import { Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import QuizPage from "./QuizPage";

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
    explanation: `해설 ${questionNumber}`,
  };
}

function makeAttempt(questions: Question[]): StudyAttempt {
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
    progress: questions.map((q) => ({
      questionId: q.id,
      selectedAnswers: [],
      status: "UNSEEN" as const,
      reviewMarked: false,
      updatedAt: "2026-09-04T00:00:00.000Z",
    })),
    questionSnapshot: questions,
  };
}

function renderQuiz(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/quiz/${id}`]}>
      <Routes>
        <Route path="/quiz/:attemptId" element={<QuizPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("QuizPage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("loads the attempt from IndexedDB and shows the current question", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");

    await waitFor(() => expect(screen.getByText("문제 1")).toBeInTheDocument());
    expect(screen.getByText("보기 A")).toBeInTheDocument();
  });

  it("selects an option and advances with 다음", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByText("보기 A"));
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() => expect(screen.getByText("문제 2")).toBeInTheDocument());
  });

  it("disables 이전 on the first question and 다음 on the last", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("jumps to the next unseen question via the quick-jump button", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByRole("button", { name: "다음 미응답 문제로 이동" }));

    await waitFor(() => expect(screen.getByText("문제 2")).toBeInTheDocument());
  });

  it("shows a collapse toggle for the question navigator that starts expanded", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    const toggle = await screen.findByRole("button", { name: "문제 네비게이터 접기" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);
    expect(await screen.findByRole("button", { name: "문제 네비게이터 펼치기" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("shows a not-found message when the attempt id doesn't exist", async () => {
    renderQuiz("missing-attempt");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });

  it("navigates to the submit confirmation screen when 제출하기 is clicked", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    render(
      <MemoryRouter initialEntries={["/quiz/attempt-1"]}>
        <Routes>
          <Route path="/quiz/:attemptId" element={<QuizPage />} />
          <Route path="/quiz/:attemptId/submit" element={<div>제출 확인 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByRole("button", { name: "제출하기" }));

    await waitFor(() => expect(screen.getByText("제출 확인 화면")).toBeInTheDocument());
  });

  it("flushes the latest answer to storage immediately when 제출하기 is clicked, before the autosave debounce would fire", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1)]));

    render(
      <MemoryRouter initialEntries={["/quiz/attempt-1"]}>
        <Routes>
          <Route path="/quiz/:attemptId" element={<QuizPage />} />
          <Route path="/quiz/:attemptId/submit" element={<div>제출 확인 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByText("보기 A"));
    await userEvent.click(screen.getByRole("button", { name: "제출하기" }));

    await waitFor(() => expect(screen.getByText("제출 확인 화면")).toBeInTheDocument());
    const saved = await getAttempt("attempt-1");
    expect(saved?.progress.find((p) => p.questionId === "q1")?.selectedAnswers).toEqual(["A"]);
  });
  it.each([[-10, 1], [99, 2], [NaN, 1], [1.5, 2]])(
    "저장된 인덱스 %s를 유효 범위로 보정해 문제 %s를 표시합니다",
    async (index, questionNumber) => {
      const attempt = makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]);
      await saveAttempt({ ...attempt, lastViewedIndex: index });
      const view = renderQuiz(attempt.id);
      await screen.findByText(`문제 ${questionNumber}`);
      await userEvent.click(screen.getByText("보기 B"));
      view.unmount();
      await waitFor(async () => {
        const saved = await getAttempt(attempt.id);
        expect(saved?.lastViewedIndex).toBe(questionNumber - 1);
        expect(saved?.progress[questionNumber - 1].selectedAnswers).toEqual(["B"]);
      });
    },
  );

});
