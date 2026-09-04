import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as driveClient from "../drive/driveClient";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import DriveBrowsePage from "./DriveBrowsePage";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
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
});
