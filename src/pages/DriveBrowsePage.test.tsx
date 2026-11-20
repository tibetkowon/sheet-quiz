import { Route, Routes } from "react-router-dom";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as driveClient from "../drive/driveClient";
import * as attemptRepo from "../storage/attemptRepo";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import DriveBrowsePage from "./DriveBrowsePage";
import type { StudyAttempt } from "../types/studyAttempt";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({
      accessToken: "token-abc",
      expiresAt: Date.now() + 3600_000,
    }),
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
    parentFolderId: "top-1",
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

function mockTopFolder() {
  vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
    googleUserId: "user-1",
    folderId: "top-1",
    folderName: "AWS",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
}

function renderBrowse() {
  return renderWithConnectedAuth(
    <Routes>
      <Route path="/folders" element={<DriveBrowsePage />} />
      <Route path="/folders/:folderId" element={<DriveBrowsePage />} />
      <Route path="/sheets/:spreadsheetId/tabs" element={<div>탭 선택 화면</div>} />
    </Routes>,
    ["/folders"],
  );
}

describe("DriveBrowsePage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows subfolders and Sheet files under the saved top folder", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([
      { id: "sub-1", name: "1주차", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([
      { id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);

    renderBrowse();

    await waitFor(() => expect(screen.getByText(/1주차/)).toBeInTheDocument());
    expect(screen.getByText("실전 모의고사 1")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });

  it("keeps the full name of a very long folder in a clickable row", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const longName = "정보처리기사필기문제은행".repeat(8);
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([
      { id: "sub-1", name: longName, modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([]);

    renderBrowse();

    const row = await screen.findByRole("button", { name: new RegExp(longName) });
    expect(row).toBeInTheDocument();
  });

  it("navigates into a subfolder and loads its own children", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockImplementation(async (_token, parentId) =>
      parentId === "top-1"
        ? [{ id: "sub-1", name: "1주차", modifiedTime: "2026-09-01T00:00:00.000Z" }]
        : [],
    );
    vi.spyOn(driveClient, "listSheetFiles").mockImplementation(async (_token, parentId) =>
      parentId === "sub-1"
        ? [{ id: "sheet-2", name: "1주차 문제", modifiedTime: "2026-09-01T00:00:00.000Z" }]
        : [],
    );

    renderBrowse();
    await waitFor(() => screen.getByText(/1주차/));

    await userEvent.click(screen.getByText(/1주차/));

    await waitFor(() => expect(screen.getByText("1주차 문제")).toBeInTheDocument());
    expect(driveClient.listChildFolders).toHaveBeenCalledWith("token-abc", "sub-1");
  });

  it("navigates to the tab selection route when a Sheet file is clicked", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([
      { id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);

    renderBrowse();
    await waitFor(() => screen.getByText("실전 모의고사 1"));

    await userEvent.click(screen.getByText("실전 모의고사 1"));

    await waitFor(() => expect(screen.getByText("탭 선택 화면")).toBeInTheDocument());
  });

  it("carries folder context and source modifiedTime when a Sheet file is clicked", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([
      { id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);

    renderBrowse();
    await waitFor(() => screen.getByText("실전 모의고사 1"));
    await userEvent.click(screen.getByText("실전 모의고사 1"));

    await waitFor(() => expect(screen.getByText("탭 선택 화면")).toBeInTheDocument());
  });

  it("prompts to select a top folder when none is saved yet", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue(undefined);

    renderBrowse();

    await waitFor(() =>
      expect(screen.getByText("먼저 문제은행 최상위 폴더를 선택해주세요.")).toBeInTheDocument(),
    );
  });

  it("shows an empty state when a folder has no subfolders or Sheet files", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([]);

    renderBrowse();

    await waitFor(() =>
      expect(screen.getByText("하위 폴더나 Sheet 파일이 없습니다.")).toBeInTheDocument(),
    );
  });

  describe("attempt badges", () => {
    const twoSheets = [
      { id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" },
      { id: "sheet-2", name: "실전 모의고사 2", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ];

    it("shows submitted and in-progress badges only on the sheet row that has attempts", async () => {
      mockAuthenticated();
      mockTopFolder();
      vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
      vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue(twoSheets);
      vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([
        makeAttempt({ id: "a", sheetTabId: "0", submittedAt: "2026-09-05T00:00:00.000Z" }),
        makeAttempt({ id: "b", sheetTabId: "1" }),
      ]);

      renderBrowse();

      const row1 = (await screen.findByText("실전 모의고사 1")).closest("li")!;
      await waitFor(() => expect(within(row1).getByText("제출 1/2")).toBeInTheDocument());
      expect(within(row1).getByText("풀이 중 1")).toBeInTheDocument();
      const row2 = screen.getByText("실전 모의고사 2").closest("li")!;
      expect(within(row2).queryByText(/제출|풀이 중/)).not.toBeInTheDocument();
    });

    it("announces the attempt status as part of the file row button", async () => {
      mockAuthenticated();
      mockTopFolder();
      vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
      vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue(twoSheets);
      vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([
        makeAttempt({ id: "a", sheetTabId: "0", submittedAt: "2026-09-05T00:00:00.000Z" }),
        makeAttempt({ id: "b", sheetTabId: "1" }),
      ]);

      renderBrowse();

      expect(
        await screen.findByRole("button", {
          name: /실전 모의고사 1.*풀어 본 2탭 중 1탭 제출, 1탭 풀이 중/,
        }),
      ).toBeInTheDocument();
    });

    it("still lists files without badges or an error when loading attempts fails", async () => {
      mockAuthenticated();
      mockTopFolder();
      vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
      vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue(twoSheets);
      const listAttempts = vi
        .spyOn(attemptRepo, "listAttemptsByUser")
        .mockRejectedValue(new Error("firestore down"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      renderBrowse();

      await screen.findByText("실전 모의고사 1");
      await waitFor(() => expect(listAttempts).toHaveBeenCalled());
      expect(screen.queryByText(/제출 \d|풀이 중/)).not.toBeInTheDocument();
      expect(screen.queryByText("firestore down")).not.toBeInTheDocument();
      expect(document.querySelector('[role="alert"]')?.textContent ?? "").not.toMatch(/\S/);
    });

    it("loads attempts once even after moving into a subfolder", async () => {
      mockAuthenticated();
      mockTopFolder();
      vi.spyOn(driveClient, "listChildFolders").mockImplementation(async (_token, parentId) =>
        parentId === "top-1"
          ? [{ id: "sub-1", name: "1주차", modifiedTime: "2026-09-01T00:00:00.000Z" }]
          : [],
      );
      vi.spyOn(driveClient, "listSheetFiles").mockImplementation(async (_token, parentId) =>
        parentId === "sub-1" ? twoSheets : [],
      );
      const listAttempts = vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([]);

      renderBrowse();
      await userEvent.click(await screen.findByText(/1주차/));
      await screen.findByText("실전 모의고사 1");

      expect(listAttempts).toHaveBeenCalledTimes(1);
    });
  });
});
