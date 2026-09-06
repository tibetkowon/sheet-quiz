import { Route, Routes } from "react-router-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as attemptRepo from "../storage/attemptRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import HistoryPage from "./HistoryPage";
import type { StudyAttempt } from "../types/studyAttempt";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

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
    progress: [],
    ...overrides,
  };
}

function renderPage() {
  return renderWithConnectedAuth(
    <Routes>
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/quiz/:attemptId" element={<div>퀴즈 화면</div>} />
      <Route path="/results/:attemptId" element={<div>결과 화면</div>} />
    </Routes>,
    ["/history"],
  );
}

describe("HistoryPage", () => {

  it("최신 기록부터 표시하면서 저장소가 반환한 배열은 변경하지 않습니다", async () => {
    const attempts = [
      makeAttempt({ id: "old", sheetTabName: "이전", updatedAt: "2026-09-01T00:00:00.000Z" }),
      makeAttempt({ id: "new", sheetTabName: "최근", updatedAt: "2026-09-06T00:00:00.000Z" }),
    ];
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue(attempts);
    renderPage();
    await screen.findByRole("button", { name: "AWS 최근 이어서 풀기" });
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("AWS · 최근");
    expect(rows[1]).toHaveTextContent("AWS · 이전");
    expect(attempts.map((attempt) => attempt.id)).toEqual(["old", "new"]);
  });

  it("이어서 풀기 버튼으로 퀴즈 화면에 이동합니다", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt()]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "AWS 1회차 이어서 풀기" }));
    expect(await screen.findByText("퀴즈 화면")).toBeInTheDocument();
  });

  it("제출 기록의 결과 보기 버튼으로 결과 화면에 이동합니다", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt({
      submittedAt: "2026-09-06T00:00:00.000Z",
      result: { scorePercent: 0, correctCount: 0, incorrectCount: 0, unansweredCount: 1, categoryStats: [], difficultyStats: [] },
    })]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "AWS 1회차 결과 보기" }));
    expect(await screen.findByText("결과 화면")).toBeInTheDocument();
  });

  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockAuthenticated();
    vi.spyOn(attemptRepo, "deleteAttempt").mockResolvedValue(undefined);
  });

  it("shows an in-progress attempt with a 이어서 풀기 action", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt()]);
    renderPage();

    await screen.findByText(/AWS · 1회차/);
    expect(screen.getByRole("button", { name: "AWS 1회차 이어서 풀기" })).toBeInTheDocument();
  });

  it("shows a submitted attempt with a 결과 보기 action and its score", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([
      makeAttempt({
        submittedAt: "2026-09-04T02:00:00.000Z",
        result: { scorePercent: 80, correctCount: 4, incorrectCount: 1, unansweredCount: 0, categoryStats: [], difficultyStats: [] },
      }),
    ]);
    renderPage();

    await screen.findByRole("button", { name: "AWS 1회차 결과 보기" });
    expect(screen.getByText(/80%/)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no saved attempts", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([]);
    renderPage();

    await screen.findByText("아직 저장된 풀이 기록이 없습니다.");
  });

  it("deletes an attempt after confirmation and refreshes the list", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser")
      .mockResolvedValueOnce([makeAttempt()])
      .mockResolvedValueOnce([]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await screen.findByText(/AWS · 1회차/);
    fireEvent.click(screen.getByRole("button", { name: "AWS 1회차 삭제" }));

    await waitFor(() => expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("attempt-1"));
    await screen.findByText("아직 저장된 풀이 기록이 없습니다.");
  });

  it("does not delete when the user cancels the confirmation", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt()]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();

    await screen.findByText(/AWS · 1회차/);
    fireEvent.click(screen.getByRole("button", { name: "AWS 1회차 삭제" }));

    expect(attemptRepo.deleteAttempt).not.toHaveBeenCalled();
  });
});
