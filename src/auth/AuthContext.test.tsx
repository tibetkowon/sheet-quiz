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
  it.each(["token", "userinfo"] as const)("연결 해제 후 늦게 도착한 %s 응답을 무시합니다", async (stage) => {
    let finishToken!: (token: googleIdentity.TokenResponse) => void;
    let finishInfo!: (info: Awaited<ReturnType<typeof userInfo.fetchGoogleUserInfo>>) => void;
    const token = { accessToken: "old-token", expiresAt: Date.now() + 3600_000 };
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
      requestAccessToken: () => stage === "token"
        ? new Promise((resolve) => { finishToken = resolve; })
        : Promise.resolve(token),
    });
    const infoSpy = vi.spyOn(userInfo, "fetchGoogleUserInfo").mockImplementation(
      () => new Promise((resolve) => { finishInfo = resolve; }),
    );
    let auth!: ReturnType<typeof useAuth>;
    function Probe() {
      auth = useAuth();
      return null;
    }
    render(<AuthProvider clientId="client-id"><Probe /></AuthProvider>);
    let connecting!: Promise<boolean>;
    await act(async () => { connecting = auth.connect(); });
    act(() => auth.disconnect());
    await act(async () => {
      if (stage === "token") finishToken(token);
      else finishInfo({ googleUserId: "old-user", email: "old@example.com" });
      expect(await connecting).toBe(false);
    });
    expect(auth.status).toBe("signed_out");
    expect(auth.googleUserId).toBeNull();
    expect(auth.email).toBeNull();
    expect(auth.getAccessToken()).toBeNull();
    if (stage === "token") expect(infoSpy).not.toHaveBeenCalled();
  });

  it("새 연결이 성공한 후 이전 연결의 실패가 도착해도 새 토큰을 유지합니다", async () => {
    let rejectOld!: (reason: Error) => void;
    const requestAccessToken = vi.fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }))
      .mockResolvedValue({ accessToken: "new-token", expiresAt: Date.now() + 3600_000 });
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({ requestAccessToken });
    vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({ googleUserId: "new-user", email: "new@example.com" });
    let auth!: ReturnType<typeof useAuth>;
    function Probe() {
      auth = useAuth();
      return null;
    }
    render(<AuthProvider clientId="client-id"><Probe /></AuthProvider>);
    let old!: Promise<boolean>;
    act(() => { old = auth.connect(); });
    act(() => auth.disconnect());
    await act(async () => { expect(await auth.connect()).toBe(true); });
    await act(async () => {
      rejectOld(new Error("late failure"));
      expect(await old).toBe(false);
    });
    expect(auth.status).toBe("connected");
    expect(auth.googleUserId).toBe("new-user");
    expect(auth.getAccessToken()).toBe("new-token");
    expect(auth.error).toBeNull();
  });

});
