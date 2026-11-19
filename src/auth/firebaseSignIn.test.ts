import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInWithGoogle } from "./firebaseSignIn";

// setup.ts의 전역 mock 대신 실제 모듈을 테스트한다.
vi.unmock("./firebaseSignIn");
vi.mock("firebase/auth", () => {
  class MockProvider {
    static credentialFromResult = vi.fn();
    static credential = vi.fn();
    addScope = vi.fn();
  }
  return {
    GoogleAuthProvider: MockProvider,
    signInWithPopup: vi.fn(),
    signInWithCredential: vi.fn(),
  };
});

const popupResult = (providerData: unknown[]) => ({
  user: { email: "user@example.com", providerData },
});

describe("signInWithGoogle (popup)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the access token and the google.com uid from the popup result", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue(
      popupResult([
        { providerId: "password", uid: "other" },
        { providerId: "google.com", uid: "google-sub-1" },
      ]) as never,
    );
    vi.mocked(GoogleAuthProvider.credentialFromResult).mockReturnValue({
      accessToken: "popup-token",
    } as never);

    const result = await signInWithGoogle("client-id");

    expect(result.googleUserId).toBe("google-sub-1");
    expect(result.email).toBe("user@example.com");
    expect(result.token.accessToken).toBe("popup-token");
    expect(result.token.expiresAt).toBeGreaterThan(Date.now() + 3500_000);
  });

  it("fails with unknown when the popup result has no access token", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue(
      popupResult([{ providerId: "google.com", uid: "google-sub-1" }]) as never,
    );
    vi.mocked(GoogleAuthProvider.credentialFromResult).mockReturnValue(null);

    await expect(signInWithGoogle("client-id")).rejects.toMatchObject({ code: "unknown" });
  });

  it.each([
    ["auth/popup-blocked", "popup_blocked"],
    ["auth/popup-closed-by-user", "popup_closed"],
  ])("maps %s to %s", async (firebaseCode, code) => {
    vi.mocked(signInWithPopup).mockRejectedValue({ code: firebaseCode });

    await expect(signInWithGoogle("client-id")).rejects.toMatchObject({ code });
  });
});
