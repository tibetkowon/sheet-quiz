import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as sheetsClient from "../sheets/sheetsClient";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import SheetTabSelectPage from "./SheetTabSelectPage";

function renderTabSelect() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });

  return renderWithConnectedAuth(
    <Routes>
      <Route path="/sheets/:spreadsheetId/tabs" element={<SheetTabSelectPage />} />
      <Route path="/sheets/:spreadsheetId/validate" element={<div>검증 결과 화면</div>} />
    </Routes>,
    ["/sheets/sheet-1/tabs"],
  );
}

describe("SheetTabSelectPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("auto-navigates to validation when a 문제은행 tab exists", async () => {
    vi.spyOn(sheetsClient, "listSheetTabs").mockResolvedValue([
      { sheetId: 0, title: "문제은행" },
      { sheetId: 1, title: "오답노트" },
    ]);

    renderTabSelect();

    await waitFor(() => expect(screen.getByText("검증 결과 화면")).toBeInTheDocument());
  });

  it("shows a picker and navigates on selection when no priority tab matches", async () => {
    vi.spyOn(sheetsClient, "listSheetTabs").mockResolvedValue([
      { sheetId: 0, title: "1과목" },
      { sheetId: 1, title: "2과목" },
    ]);

    renderTabSelect();

    await waitFor(() => screen.getByText("1과목"));
    expect(screen.getByText("2과목")).toBeInTheDocument();

    await userEvent.click(screen.getByText("2과목"));

    await waitFor(() => expect(screen.getByText("검증 결과 화면")).toBeInTheDocument());
  });

  it("shows an error banner when the tab list request fails", async () => {
    vi.spyOn(sheetsClient, "listSheetTabs").mockRejectedValue(
      new (await import("../sheets/sheetsClient")).SheetsApiError(500, "Sheet 탭 목록을 불러오지 못했습니다."),
    );

    renderTabSelect();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sheet 탭 목록을 불러오지 못했습니다."));
  });
});
