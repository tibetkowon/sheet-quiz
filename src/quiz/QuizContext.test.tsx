// src/quiz/QuizContext.test.tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as attemptRepo from "../storage/attemptRepo";
import { QuizProvider, useQuiz } from "./QuizContext";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";

function makeQuestion(id: string, questionNumber: number, type: Question["type"] = "SINGLE"): Question {
  return {
    id,
    sourceRow: questionNumber + 1,
    questionNumber,
    difficulty: "MEDIUM",
    type,
    requiredAnswerCount: type === "SINGLE" ? 1 : 2,
    text: `문제 ${questionNumber}`,
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
      { key: "C", text: "보기 C" },
    ],
    correctAnswers: type === "SINGLE" ? ["A"] : ["A", "B"],
    explanation: "해설",
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

function Probe() {
  const quiz = useQuiz();
  return (
    <div>
      <span data-testid="current-number">{quiz.currentQuestion.questionNumber}</span>
      <span data-testid="answered-count">{quiz.progressSummary.answered}</span>
      <span data-testid="autosave-status">{quiz.autosaveStatus}</span>
      <button onClick={() => quiz.selectAnswer("A")}>select-A</button>
      <button onClick={() => quiz.selectAnswer("B")}>select-B</button>
      <button onClick={quiz.setHeld}>hold</button>
      <button onClick={quiz.toggleReviewMarked}>flag</button>
      <button onClick={quiz.goNext}>next</button>
      <button onClick={quiz.goPrev}>prev</button>
    </div>
  );
}

describe("QuizContext", () => {
  afterEach(() => vi.restoreAllMocks());

  it("selects a single answer and updates the answered count", async () => {
    vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1), makeQuestion("q2", 2)];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    await userEvent.click(screen.getByText("select-A"));

    expect(screen.getByTestId("answered-count")).toHaveTextContent("1");
  });

  it("toggles a multiple-choice answer on and off", async () => {
    vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1, "MULTIPLE")];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    await userEvent.click(screen.getByText("select-A"));
    await userEvent.click(screen.getByText("select-B"));
    expect(screen.getByTestId("answered-count")).toHaveTextContent("1");

    await userEvent.click(screen.getByText("select-A"));
    await userEvent.click(screen.getByText("select-B"));
    expect(screen.getByTestId("answered-count")).toHaveTextContent("0");
  });

  it("moves between questions with goNext/goPrev", async () => {
    vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1), makeQuestion("q2", 2)];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    expect(screen.getByTestId("current-number")).toHaveTextContent("1");
    await userEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("current-number")).toHaveTextContent("2");
    await userEvent.click(screen.getByText("prev"));
    expect(screen.getByTestId("current-number")).toHaveTextContent("1");
  });

  it("autosaves to IndexedDB after a change, reporting saving then saved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saveSpy = vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1)];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    await act(async () => {
      screen.getByText("select-A").click();
    });
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("saving");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(saveSpy).toHaveBeenCalled();
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("saved");
    vi.useRealTimers();
  });
  it.each(["hidden", "beforeunload", "unmount"])("%s에서 디바운스 대기 중 최신 답변을 저장합니다", async (event) => {
    vi.useFakeTimers();
    const save = vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const view = render(<QuizProvider initialAttempt={makeAttempt([makeQuestion("q1", 1)])}><Probe /></QuizProvider>);
    try {
      await act(async () => { screen.getByText("select-A").click(); });
      await act(async () => { screen.getByText("select-B").click(); });
      expect(save).not.toHaveBeenCalled();
      await act(async () => {
        if (event === "hidden") {
          vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
          document.dispatchEvent(new Event("visibilitychange"));
        } else if (event === "beforeunload") {
          window.dispatchEvent(new Event("beforeunload"));
        } else {
          view.unmount();
        }
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].progress[0].selectedAnswers).toEqual(["B"]);
      await act(async () => { await vi.advanceTimersByTimeAsync(700); });
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("이전 저장 완료는 최신 답변의 저장 대기 상태를 바꾸지 않습니다", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    vi.spyOn(attemptRepo, "saveAttempt").mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue();
    const view = render(<QuizProvider initialAttempt={makeAttempt([makeQuestion("q1", 1)])}><Probe /></QuizProvider>);
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(600); });
      await act(async () => { screen.getByText("select-B").click(); });
      await act(async () => { finish(); });
      expect(screen.getByTestId("autosave-status")).toHaveTextContent("saving");
      await act(async () => { await vi.advanceTimersByTimeAsync(600); });
      expect(screen.getByTestId("autosave-status")).toHaveTextContent("saved");
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

});
