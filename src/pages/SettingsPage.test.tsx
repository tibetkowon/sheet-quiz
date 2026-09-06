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

  it("일부 삭제 실패 시 설정을 유지하고 재시도 성공 후 폴더를 지우고 시작 화면으로 이동합니다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(attemptRepo, "deleteAttempt").mockImplementation((id) =>
      id === "a1" ? Promise.reject(new Error("boom")) : Promise.resolve(undefined),
    );
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("일부 풀이 기록을 삭제하지 못했습니다.");
    expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a1");
    expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a2");
    expect(topFolderRepo.clearTopFolder).not.toHaveBeenCalled();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText("시작 화면")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모든 데이터 삭제" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "폴더 다시 선택" })).toBeEnabled();

    vi.mocked(attemptRepo.deleteAttempt).mockResolvedValue(undefined);
    vi.mocked(attemptRepo.listAttemptsByUser).mockResolvedValue([makeAttempt("a1")]);
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));
    await waitFor(() => {
      expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a1");
      expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a2");
      expect(topFolderRepo.clearTopFolder).toHaveBeenCalledWith("user-1");
    });
    await screen.findByText("시작 화면");
    expect(attemptRepo.deleteAttempt).toHaveBeenCalledTimes(3);
  });

  it("폴더 초기화 실패를 안내하고 연결을 유지한 채 재시도합니다", async () => {
    vi.mocked(topFolderRepo.clearTopFolder).mockRejectedValueOnce(new Error("boom"));
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "폴더 다시 선택" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("폴더 설정을 초기화하지 못했습니다.");
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText("최상위 폴더 선택 화면")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "폴더 다시 선택" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "모든 데이터 삭제" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "폴더 다시 선택" }));

    await screen.findByText("최상위 폴더 선택 화면");
    expect(topFolderRepo.clearTopFolder).toHaveBeenCalledTimes(2);
  });

  it.each(["조회", "폴더 삭제"])("전체 삭제 중 %s 실패를 안내하고 재시도합니다", async (step) => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    if (step === "조회") {
      vi.mocked(attemptRepo.listAttemptsByUser).mockRejectedValueOnce(new Error("boom"));
    } else {
      vi.mocked(topFolderRepo.clearTopFolder).mockRejectedValueOnce(new Error("boom"));
    }
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("전체 데이터 삭제를 완료하지 못했습니다.");
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText("시작 화면")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모든 데이터 삭제" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "폴더 다시 선택" })).toBeEnabled();
    if (step === "조회") {
      expect(attemptRepo.deleteAttempt).not.toHaveBeenCalled();
      expect(topFolderRepo.clearTopFolder).not.toHaveBeenCalled();
    }
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    await screen.findByText("시작 화면");
    expect(attemptRepo.listAttemptsByUser).toHaveBeenCalledTimes(2);
    expect(topFolderRepo.clearTopFolder).toHaveBeenLastCalledWith("user-1");
  });

  it("does not delete anything when the user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    expect(attemptRepo.deleteAttempt).not.toHaveBeenCalled();
  });
});
