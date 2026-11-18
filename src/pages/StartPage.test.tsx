import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as authContext from "../auth/AuthContext";
import { GoogleAuthError } from "../auth/googleAuthError";
import StartPage from "./StartPage";

function mockAuth(overrides: Partial<ReturnType<typeof authContext.useAuth>> = {}) {
  const connect = vi.fn().mockResolvedValue(true);
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    status: "signed_out",
    googleUserId: null,
    email: null,
    error: null,
    connect,
    disconnect: vi.fn(),
    markExpired: vi.fn(),
    getAccessToken: vi.fn(),
    ...overrides,
  });
  return connect;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/folders" element={<div>폴더 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StartPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the product name as the page heading with a connect button", () => {
    mockAuth();
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "풀이장" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google Drive 연결" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("moves to the folder screen after a successful connection", async () => {
    const connect = mockAuth();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Google Drive 연결" }));
    await waitFor(() => expect(screen.getByText("폴더 화면")).toBeInTheDocument());
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("stays on the start screen when the connection fails", async () => {
    const connect = vi.fn().mockResolvedValue(false);
    mockAuth({ connect });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Google Drive 연결" }));
    await waitFor(() => expect(connect).toHaveBeenCalled());
    expect(screen.queryByText("폴더 화면")).not.toBeInTheDocument();
  });

  it("disables the button and says it is connecting while connecting", () => {
    mockAuth({ status: "connecting" });
    renderPage();
    expect(screen.getByRole("button", { name: "연결하는 중…" })).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the error message and retries the connection from the banner", async () => {
    const connect = vi.fn().mockResolvedValue(true);
    mockAuth({ connect, error: new GoogleAuthError("popup_closed", "closed") });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("로그인 창이 닫혔습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
  });
});
