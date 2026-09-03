import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as driveClient from "../drive/driveClient";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import TopFolderSelectPage from "./TopFolderSelectPage";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

describe("TopFolderSelectPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists Drive root folders once connected", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockResolvedValue([
      { id: "f1", name: "자격증 문제은행", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);

    renderWithConnectedAuth(<TopFolderSelectPage />);

    await waitFor(() => expect(screen.getByText("자격증 문제은행")).toBeInTheDocument());
  });

  it("saves the selected folder as the top folder and navigates to the certification folders page", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockResolvedValue([
      { id: "f1", name: "자격증 문제은행", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
    const saveSpy = vi.spyOn(topFolderRepo, "saveTopFolder").mockResolvedValue();

    renderWithConnectedAuth(
      <Routes>
        <Route path="/" element={<TopFolderSelectPage />} />
        <Route path="/folders" element={<div>자격증 폴더 화면</div>} />
      </Routes>,
    );
    await waitFor(() => screen.getByText("자격증 문제은행"));

    await userEvent.click(screen.getByText("자격증 문제은행"));
    await waitFor(() =>
      expect(driveClient.listChildFolders).toHaveBeenCalledWith("token-abc", "f1"),
    );

    await userEvent.click(screen.getByRole("button", { name: /이 폴더를 문제은행 최상위 폴더로 선택/ }));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ googleUserId: "user-1", folderId: "f1", folderName: "자격증 문제은행" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("자격증 폴더 화면")).toBeInTheDocument());
  });

  it("shows a retryable error banner when Drive listing fails", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockRejectedValue(
      new (await import("../drive/driveApiError")).DriveApiError(500, "Drive 폴더 목록을 불러오지 못했습니다."),
    );

    renderWithConnectedAuth(<TopFolderSelectPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Drive 폴더 목록을 불러오지 못했습니다."));
  });

  it("filters folders by the search query", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockResolvedValue([
      { id: "f1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
      { id: "f2", name: "SQLD", modifiedTime: "2026-08-01T00:00:00.000Z" },
    ]);

    renderWithConnectedAuth(<TopFolderSelectPage />);
    await waitFor(() => screen.getByText("AWS"));

    await userEvent.type(screen.getByPlaceholderText("폴더 또는 파일 검색"), "SQ");

    expect(screen.queryByText("AWS")).not.toBeInTheDocument();
    expect(screen.getByText("SQLD")).toBeInTheDocument();
  });
});
