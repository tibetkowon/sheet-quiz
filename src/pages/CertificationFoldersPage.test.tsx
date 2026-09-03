import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as driveClient from "../drive/driveClient";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import CertificationFoldersPage from "./CertificationFoldersPage";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

describe("CertificationFoldersPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the saved top folder's child folders as certification folders", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "자격증 문제은행",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([
      { id: "c1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
      { id: "c2", name: "SQLD", modifiedTime: "2026-08-01T00:00:00.000Z" },
    ]);

    renderWithConnectedAuth(<CertificationFoldersPage />);

    await waitFor(() => expect(screen.getByText("AWS")).toBeInTheDocument());
    expect(screen.getByText("SQLD")).toBeInTheDocument();
    expect(screen.getByText("자격증 문제은행")).toBeInTheDocument();
  });

  it("prompts to select a top folder when none is saved yet", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue(undefined);

    renderWithConnectedAuth(<CertificationFoldersPage />);

    await waitFor(() =>
      expect(screen.getByText("먼저 문제은행 최상위 폴더를 선택해주세요.")).toBeInTheDocument(),
    );
  });
});
