import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import ResumeSelectPage from "./ResumeSelectPage";

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
    indexedDB.deleteDatabase("sheet-quiz");
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

  it("shows a not-found message when the attempt id doesn't exist", async () => {
    renderResume("missing-attempt");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });
});
