// src/pages/QuizPage.test.tsx
import { Route, Routes } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
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

function makeMultiQuestion(id: string, questionNumber: number): Question {
  return {
    ...makeQuestion(id, questionNumber),
    type: "MULTIPLE",
    requiredAnswerCount: 2,
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
      { key: "C", text: "보기 C" },
    ],
    correctAnswers: ["A", "B"],
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

  it("모바일 하단 버튼의 2열 배치와 순서, 반응형 본문 여백을 유지합니다", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1)]));
    const { container } = renderQuiz("attempt-1");
    const submit = await screen.findByRole("button", { name: "제출하기" });
    const bar = container.querySelector(".fixed");

    // jsdom은 레이아웃을 계산하지 않으므로 반응형 레이아웃 클래스를 확인합니다.
    expect(bar).toHaveClass(
      "fixed",
      "inset-x-0",
      "bottom-0",
      "grid",
      "grid-cols-2",
      "gap-2",
      "sm:flex",
      "sm:flex-wrap",
      "sm:justify-center",
    );
    const buttons = within(bar as HTMLElement).getAllByRole("button");
    ["이전", "다음", "나중에 풀기", "다시 볼 문제로 표시", "제출하기"].forEach((name, index) =>
      expect(buttons[index]).toHaveAccessibleName(name),
    );
    expect(buttons).toHaveLength(5);
    // 제출하기는 모바일 2열 격자에서 두 칸을 모두 차지한다.
    expect(submit.parentElement).toHaveClass("col-span-2");
    expect(container.querySelector(".grid")).toHaveClass(
      "px-4",
      "sm:px-8",
      "pb-64",
      "sm:pb-40",
      "lg:pb-28",
    );
    expect(container.querySelector(".grid")).not.toHaveClass("pb-28");
    expect(screen.getByRole("button", { name: "다시 볼 문제로 표시" })).toBeEnabled();
  });

  it("selects an option and advances with 다음", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByText("보기 A"));
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() => expect(screen.getByText("문제 2")).toBeInTheDocument());
  });

  it("keeps a single-choice answer after moving to the next question and back", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));
    await userEvent.click(screen.getByText("보기 B"));
    expect(screen.getByRole("radio", { name: "보기 B" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("문제 2");
    expect(screen.getByRole("radio", { name: "보기 B" })).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "이전" }));
    await screen.findByText("문제 1");
    expect(screen.getByRole("radio", { name: "보기 B" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "보기 A" })).not.toBeChecked();
  });

  it("toggles multiple-choice answers on and off independently", async () => {
    await saveAttempt(makeAttempt([makeMultiQuestion("q1", 1)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));
    await userEvent.click(screen.getByRole("checkbox", { name: "보기 A" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "보기 C" }));
    expect(screen.getByRole("checkbox", { name: "보기 A" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "보기 C" })).toBeChecked();
    expect(screen.getByText(/현재 2개 선택됨/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "보기 A" }));
    expect(screen.getByRole("checkbox", { name: "보기 A" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "보기 C" })).toBeChecked();
    expect(screen.getByText(/현재 1개 선택됨/)).toBeInTheDocument();
  });

  it("clears the selected option when the question is put off for later", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));
    await userEvent.click(screen.getByText("보기 B"));
    expect(screen.getByRole("radio", { name: "보기 B" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "나중에 풀기" }));

    expect(screen.getByRole("radio", { name: "보기 B" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "보기 A" })).not.toBeChecked();
    expect(screen.getByLabelText("문제 1, 보류")).toBeInTheDocument();
  });

  it("shows whether the question is held and lets the user release it", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));
    const hold = screen.getByRole("button", { name: "나중에 풀기" });
    expect(hold).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("보류 중")).not.toBeInTheDocument();

    await userEvent.click(hold);
    expect(hold).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("보류 중")).toBeInTheDocument();

    await userEvent.click(hold);
    expect(hold).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("보류 중")).not.toBeInTheDocument();
    expect(screen.getByLabelText("문제 1, 아직 안 봄")).toBeInTheDocument();
  });

  it("ends the hold when an option is chosen", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));
    await userEvent.click(screen.getByRole("button", { name: "나중에 풀기" }));
    await userEvent.click(screen.getByText("보기 A"));

    expect(screen.getByRole("button", { name: "나중에 풀기" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("문제 1, 답변 완료")).toBeInTheDocument();
  });

  it("shows a held question as held in the navigator and keeps it held after moving away", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));
    await userEvent.click(screen.getByRole("button", { name: "나중에 풀기" }));
    expect(screen.getByLabelText("문제 1, 보류")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("문제 2");
    expect(screen.getByLabelText("문제 1, 보류")).toBeInTheDocument();
  });

  it("disables 이전 on the first question and 다음 on the last", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    expect(screen.getByRole("button", { name: "이전" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "다음" })).toHaveAttribute("aria-disabled", "true");
  });

  it("jumps to the next unseen question via the quick-jump button", async () => {
    await saveAttempt(
      makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)]),
    );

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByRole("button", { name: "다음 미응답 문제로 이동" }));

    await waitFor(() => expect(screen.getByText("문제 2")).toBeInTheDocument());
  });

  it("opens the question list in a drawer and jumps to the chosen question", async () => {
    // jsdom에는 <dialog>의 모달 API가 없어 열림 속성만 흉내 낸다.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    await saveAttempt(
      makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)]),
    );

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    const opener = screen.getByRole("button", { name: "문제 목록" });
    expect(opener).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(opener);

    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByLabelText("문제 3, 아직 안 봄"));

    expect(await screen.findByText("문제 3 / 3")).toBeInTheDocument();
    // 닫힘 애니메이션이 끝나야 <dialog>가 사라지므로(jsdom에는 없다) 서랍 안 목록이 비워졌는지로 확인한다.
    expect(within(sheet).queryByLabelText("문제 3, 아직 안 봄")).not.toBeInTheDocument();
  });

  it("shows the sheet's question number together with its position when numbers do not start at 1", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 31), makeQuestion("q2", 32)]));

    renderQuiz("attempt-1");

    expect(await screen.findByText("문제 31 (2문제 중 1번째)")).toBeInTheDocument();
    expect(screen.queryByText(/31 \/ 2/)).not.toBeInTheDocument();
  });

  it("opens the explanation from a full-width trigger and closes it when moving to another question", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    const trigger = screen.getByRole("button", { name: "해설 보기" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("해설 1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("문제 2");
    expect(screen.getByRole("button", { name: "해설 보기" })).toHaveAttribute(
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
  it.each([
    [-10, 1],
    [99, 2],
    [NaN, 1],
    [1.5, 2],
  ])(
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
