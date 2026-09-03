import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import * as googleIdentity from "./googleIdentity";
import * as userInfo from "./userInfo";

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="email">{auth.email ?? ""}</span>
      <button onClick={() => auth.connect()}>connect</button>
      <button onClick={() => auth.disconnect()}>disconnect</button>
    </div>
  );
}

describe("AuthContext", () => {
  afterEach(() => vi.restoreAllMocks());

  it("moves to connected status with the user's email after connect()", async () => {
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
      requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
    });
    vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
      googleUserId: "user-1",
      email: "user@example.com",
    });

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByText("connect"));
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("connected"));
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
  });

  it("resets to signed_out with an error when connect() fails", async () => {
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
      requestAccessToken: async () => {
        throw new (await import("./googleAuthError")).GoogleAuthError(
          "popup_blocked",
          "팝업이 차단되었습니다.",
        );
      },
    });

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByText("connect"));
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
  });
});
