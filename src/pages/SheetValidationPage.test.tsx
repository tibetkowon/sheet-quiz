import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as sheetsClient from "../sheets/sheetsClient";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import SheetValidationPage from "./SheetValidationPage";

const VALID_HEADER = [
  "번호",
  "분류",
  "난이도",
  "유형",
  "문제",
  "보기 A",
  "보기 B",
  "보기 C",
  "보기 D",
  "정답",
  "해설",
];

function renderValidation() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });

  return renderWithConnectedAuth(
    <Routes>
      <Route path="/sheets/:spreadsheetId/validate" element={<SheetValidationPage />} />
    </Routes>,
    [
      {
        pathname: "/sheets/sheet-1/validate",
        state: { fileName: "1주차 문제", tabId: 0, tabTitle: "문제은행" },
      },
    ],
  );
}

describe("SheetValidationPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the question count when validation has no errors", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", "해설"],
      ["2", "분류", "MEDIUM", "SINGLE", "문제 2", "A", "B", "", "", "A", "해설"],
    ]);

    renderValidation();

    await waitFor(() => expect(screen.getByText(/문제 2개/)).toBeInTheDocument());
  });

  it("lists blocking errors with sheet name, row number, and message", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "", "A", "B", "", "", "A", "해설"],
    ]);

    renderValidation();

    await waitFor(() =>
      expect(screen.getByText("시트에서 고칠 부분이 1곳 있어요")).toBeInTheDocument(),
    );
    expect(screen.getByText(/문제은행 · 2행/)).toBeInTheDocument();
    expect(screen.getByText("문제 본문이 비어 있습니다.")).toBeInTheDocument();
  });

  it("re-fetches when 다시 검증 is clicked", async () => {
    const spy = vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "", "A", "B", "", "", "A", "해설"],
    ]);

    renderValidation();
    await waitFor(() => screen.getByText("다시 검증"));

    await userEvent.click(screen.getByText("다시 검증"));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it("shows a retryable error banner when the Sheet request fails", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockRejectedValue(
      new (await import("../sheets/sheetsClient")).SheetsApiError(500, "Sheet 데이터를 불러오지 못했습니다."),
    );

    renderValidation();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sheet 데이터를 불러오지 못했습니다."));
  });

  it("shows warnings without blocking when only warnings are present", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", ""],
    ]);

    renderValidation();

    await waitFor(() => expect(screen.getByText(/문제 1개/)).toBeInTheDocument());
    expect(screen.getByText(/경고 1건/)).toBeInTheDocument();
    expect(screen.getByText(/해설이 비어 있습니다\./)).toBeInTheDocument();
  });
});
