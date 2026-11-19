import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as firebaseAuth from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "../firebase";
import * as firebaseSignIn from "./firebaseSignIn";
import { AuthProvider, useAuth } from "./AuthContext";
import * as googleIdentity from "./googleIdentity";
import * as userInfo from "./userInfo";
import * as migrateLocalData from "../storage/migrateLocalData";

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="email">{auth.email ?? ""}</span>
      <span data-testid="uid">{auth.googleUserId ?? ""}</span>
      <button onClick={() => auth.connect()}>connect</button>
      <button onClick={() => auth.disconnect()}>disconnect</button>
    </div>
  );
}

const mockUser = {
  uid: "firebase-uid",
  email: "user@example.com",
  providerData: [{ providerId: "google.com", uid: "google-sub-1" }],
};

// 새로고침 뒤 Firebase 세션이 복원된 상태를 만든다.
function restoreSession() {
  (auth as { currentUser: unknown }).currentUser = mockUser;
  vi.spyOn(firebaseAuth, "onAuthStateChanged").mockImplementation(((
    _a: unknown,
    cb: (u: unknown) => void,
  ) => {
    cb(mockUser);
    return () => {};
  }) as unknown as typeof firebaseAuth.onAuthStateChanged);
}

describe("AuthContext", () => {
  afterEach(() => {
    (auth as { currentUser: unknown }).currentUser = null;
    vi.restoreAllMocks();
  });

  it("restores the session as expired with the user's identity and no Drive token", async () => {
    restoreSession();

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("expired"));
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
    expect(screen.getByTestId("uid")).toHaveTextContent("google-sub-1");
  });

  it("reconnects a restored session through GIS with login_hint, without signing in again", async () => {
    restoreSession();
    const requestAccessToken = vi
      .fn()
      .mockResolvedValue({ accessToken: "t", expiresAt: Date.now() + 3600_000 });
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({ requestAccessToken });
    vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
      googleUserId: "google-sub-1",
      email: "user@example.com",
    });
    const signIn = vi.spyOn(firebaseSignIn, "signInWithGoogle");

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("expired"));
    await act(async () => {
      await userEvent.click(screen.getByText("connect"));
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("connected"));
    expect(requestAccessToken).toHaveBeenCalledWith("user@example.com");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rejects a reconnect token from a different Google account", async () => {
    restoreSession();
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
      requestAccessToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "t", expiresAt: Date.now() + 3600_000 }),
    });
    vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
      googleUserId: "other-sub",
      email: "other@example.com",
    });
    let auth!: ReturnType<typeof useAuth>;
    function Probe() {
      auth = useAuth();
      return <span data-testid="status">{auth.status}</span>;
    }

    render(
      <AuthProvider clientId="client-id">
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("expired"));
    let ok!: boolean;
    await act(async () => {
      ok = await auth.connect();
    });

    expect(ok).toBe(false);
    expect(screen.getByTestId("status")).toHaveTextContent("expired");
    expect(auth.error?.code).toBe("account_mismatch");
    expect(auth.getAccessToken()).toBeNull();
    expect(auth.googleUserId).toBe("google-sub-1");
  });

  it("signs in once through signInWithGoogle on the first connect()", async () => {
    const signIn = vi.spyOn(firebaseSignIn, "signInWithGoogle").mockResolvedValue({
      googleUserId: "google-sub-1",
      email: "user@example.com",
      token: { accessToken: "t", expiresAt: Date.now() + 3600_000 },
    });

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
    await act(async () => {
      await userEvent.click(screen.getByText("connect"));
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("connected"));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("uid")).toHaveTextContent("google-sub-1");
  });

  describe("local data migration", () => {
    const signInResult = {
      googleUserId: "google-sub-1",
      email: "user@example.com",
      token: { accessToken: "t", expiresAt: Date.now() + 3600_000 },
    };
    const renderAndConnect = async (initial: string) => {
      render(
        <AuthProvider clientId="client-id">
          <TestConsumer />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent(initial));
      await act(async () => {
        await userEvent.click(screen.getByText("connect"));
      });
      await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("connected"));
    };

    it("migrates once on the first connect() while still connecting", async () => {
      vi.spyOn(firebaseSignIn, "signInWithGoogle").mockResolvedValue(signInResult);
      let statusDuring = "";
      const migrate = vi
        .spyOn(migrateLocalData, "migrateLocalData")
        .mockImplementation(async () => {
          statusDuring = screen.getByTestId("status").textContent ?? "";
        });

      await renderAndConnect("signed_out");

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledWith("google-sub-1");
      expect(statusDuring).toBe("connecting");
    });

    it("still connects when the migration fails", async () => {
      vi.spyOn(firebaseSignIn, "signInWithGoogle").mockResolvedValue(signInResult);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(migrateLocalData, "migrateLocalData").mockRejectedValue(new Error("boom"));

      await renderAndConnect("signed_out");

      expect(screen.getByTestId("uid")).toHaveTextContent("google-sub-1");
    });

    it("does not migrate on session restore or reconnect", async () => {
      restoreSession();
      vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
        requestAccessToken: vi.fn().mockResolvedValue(signInResult.token),
      });
      vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
        googleUserId: "google-sub-1",
        email: "user@example.com",
      });
      const migrate = vi.spyOn(migrateLocalData, "migrateLocalData");

      await renderAndConnect("expired");

      expect(migrate).not.toHaveBeenCalled();
    });
  });

  it("does not flash expired when the auth listener fires during the first connect()", async () => {
    let notify!: (u: unknown) => void;
    vi.spyOn(firebaseAuth, "onAuthStateChanged").mockImplementation(((
      _a: unknown,
      cb: (u: unknown) => void,
    ) => {
      notify = cb;
      cb(null);
      return () => {};
    }) as unknown as typeof firebaseAuth.onAuthStateChanged);
    let finishSignIn!: (v: Awaited<ReturnType<typeof firebaseSignIn.signInWithGoogle>>) => void;
    vi.spyOn(firebaseSignIn, "signInWithGoogle").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSignIn = resolve;
        }),
    );

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByText("connect"));
    });
    act(() => notify(mockUser));
    expect(screen.getByTestId("status")).toHaveTextContent("connecting");

    await act(async () => {
      finishSignIn({
        googleUserId: "google-sub-1",
        email: "user@example.com",
        token: { accessToken: "t", expiresAt: Date.now() + 3600_000 },
      });
    });
    expect(screen.getByTestId("status")).toHaveTextContent("connected");
  });

  it("signs out of Firebase and becomes signed_out on disconnect()", async () => {
    restoreSession();
    const signOut = vi.spyOn(firebaseAuth, "signOut");

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("expired"));
    await act(async () => {
      await userEvent.click(screen.getByText("disconnect"));
    });

    expect(signOut).toHaveBeenCalledOnce();
    expect(screen.getByTestId("status")).toHaveTextContent("signed_out");
  });

  it("moves to connected status with the user's email after connect()", async () => {
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
  it.each(["token", "userinfo"] as const)(
    "연결 해제 후 늦게 도착한 %s 응답을 무시합니다",
    async (stage) => {
      let finishToken!: (token: googleIdentity.TokenResponse) => void;
      let finishInfo!: (info: Awaited<ReturnType<typeof userInfo.fetchGoogleUserInfo>>) => void;
      const token = { accessToken: "old-token", expiresAt: Date.now() + 3600_000 };
      vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
        requestAccessToken: () =>
          stage === "token"
            ? new Promise((resolve) => {
                finishToken = resolve;
              })
            : Promise.resolve(token),
      });
      // 첫 로그인 경로는 토큰 뒤에 userinfo까지 한 번에 처리하므로 token 단계에서도 userinfo가 호출된다.
      vi.spyOn(userInfo, "fetchGoogleUserInfo").mockImplementation(() =>
        stage === "token"
          ? Promise.resolve({ googleUserId: "old-user", email: "old@example.com" })
          : new Promise((resolve) => {
              finishInfo = resolve;
            }),
      );
      let auth!: ReturnType<typeof useAuth>;
      function Probe() {
        auth = useAuth();
        return null;
      }
      render(
        <AuthProvider clientId="client-id">
          <Probe />
        </AuthProvider>,
      );
      let connecting!: Promise<boolean>;
      await act(async () => {
        connecting = auth.connect();
      });
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
    },
  );

  it("새 연결이 성공한 후 이전 연결의 실패가 도착해도 새 토큰을 유지합니다", async () => {
    let rejectOld!: (reason: Error) => void;
    const requestAccessToken = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = reject;
          }),
      )
      .mockResolvedValue({ accessToken: "new-token", expiresAt: Date.now() + 3600_000 });
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({ requestAccessToken });
    vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
      googleUserId: "new-user",
      email: "new@example.com",
    });
    let auth!: ReturnType<typeof useAuth>;
    function Probe() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider clientId="client-id">
        <Probe />
      </AuthProvider>,
    );
    let old!: Promise<boolean>;
    act(() => {
      old = auth.connect();
    });
    act(() => auth.disconnect());
    await act(async () => {
      expect(await auth.connect()).toBe(true);
    });
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
