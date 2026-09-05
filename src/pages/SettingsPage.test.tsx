import { Route, Routes } from "react-router-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as attemptRepo from "../storage/attemptRepo";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import SettingsPage from "./SettingsPage";
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

function makeAttempt(id: string): StudyAttempt {
  return {
    id,
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
  };
}

function renderPage() {
  return renderWithConnectedAuth(
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={<div>시작 화면</div>} />
      <Route path="/folders/select" element={<div>최상위 폴더 선택 화면</div>} />
    </Routes>,
    ["/settings"],
  );
}

describe("SettingsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "clearTopFolder").mockResolvedValue(undefined);
    vi.spyOn(attemptRepo, "deleteAttempt").mockResolvedValue(undefined);
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt("a1"), makeAttempt("a2")]);
  });

  it("shows the connected account email", async () => {
    renderPage();
    await screen.findByText("user@example.com");
  });

  it("resets the top folder and navigates to folder selection", async () => {
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "폴더 다시 선택" }));

    await waitFor(() => expect(topFolderRepo.clearTopFolder).toHaveBeenCalledWith("user-1"));
    await screen.findByText("최상위 폴더 선택 화면");
  });

  it("deletes all attempts and clears the top folder after confirming, then returns to start", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    await waitFor(() => {
      expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a1");
      expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a2");
      expect(topFolderRepo.clearTopFolder).toHaveBeenCalledWith("user-1");
    });
    await screen.findByText("시작 화면");
  });

  it("does not delete anything when the user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    expect(attemptRepo.deleteAttempt).not.toHaveBeenCalled();
  });
});
