import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authContext from "../auth/AuthContext";
import * as sheetsClient from "../sheets/sheetsClient";
import KeywordsPage from "./KeywordsPage";

function renderKeywords() {
  return render(
    <MemoryRouter initialEntries={["/sheets/sheet-1/keywords"]}>
      <Routes>
        <Route path="/sheets/:spreadsheetId/keywords" element={<KeywordsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("KeywordsPage", () => {
  const markExpired = vi.fn();
  const getAccessToken = vi.fn<() => string | null>();

  beforeEach(() => {
    markExpired.mockClear();
    getAccessToken.mockReturnValue("token");
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      status: "connected",
      googleUserId: "user-1",
      email: "user@example.com",
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      markExpired,
      getAccessToken,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows keywords grouped by category", async () => {
    const getValues = vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      ["영역", "키워드", "설명"],
      ["컴퓨팅", "EC2", "가상 서버"],
      ["스토리지", "S3"],
    ]);

    renderKeywords();

    const compute = (await screen.findByText("컴퓨팅")).closest("details")!;
    const storage = screen.getByText("스토리지").closest("details")!;
    expect(within(compute).getByText("EC2")).toBeInTheDocument();
    expect(within(compute).getByText("가상 서버")).toBeInTheDocument();
    expect(within(storage).getByText("S3")).toBeInTheDocument();
    expect(getValues).toHaveBeenCalledWith("token", "sheet-1", "키워드");
  });

  it("explains how to add a missing keyword tab", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockRejectedValue(new sheetsClient.SheetsApiError(400, "Bad request"));

    renderKeywords();

    expect(await screen.findByText(/이 시트에 '키워드' 탭이 없습니다/)).toBeVisible();
  });

  it("shows the empty state when the keyword tab only contains headers", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([["영역", "키워드", "설명"]]);

    renderKeywords();

    expect(await screen.findByText("키워드가 아직 없습니다")).toBeVisible();
  });

  it("asks the user to connect to Google when no access token is available", () => {
    getAccessToken.mockReturnValue(null);

    renderKeywords();

    expect(screen.getByRole("alert")).toHaveTextContent("Google 연결이 필요합니다");
  });

  it("marks the connection expired on a 401 response", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockRejectedValue(
      new sheetsClient.SheetsApiError(401, "Google 연결이 만료되었습니다."),
    );

    renderKeywords();

    expect(await screen.findByRole("alert")).toHaveTextContent("Google 연결이 만료되었습니다.");
    expect(markExpired).toHaveBeenCalledOnce();
  });

  it("shows the parser error for missing headers", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([["설명"]]);

    renderKeywords();

    expect(await screen.findByRole("alert")).toHaveTextContent("'영역', '키워드' 헤더를 찾을 수 없습니다.");
  });
});
