import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleIdentityClient } from "./googleIdentity";
import { GoogleAuthError } from "./googleAuthError";

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: { access_token: string; expires_in: number; error?: string }) => void;
  error_callback?: (error: { type: string; message?: string }) => void;
}

describe("createGoogleIdentityClient", () => {
  let initTokenClient: ReturnType<typeof vi.fn>;
  let requestAccessToken: ReturnType<typeof vi.fn>;
  let lastConfig: TokenClientConfig;

  beforeEach(() => {
    requestAccessToken = vi.fn();
    initTokenClient = vi.fn((config: TokenClientConfig) => {
      lastConfig = config;
      return { requestAccessToken };
    });
    window.google = { accounts: { oauth2: { initTokenClient } } };
  });

  afterEach(() => {
    delete window.google;
    vi.restoreAllMocks();
  });

  it("resolves with an access token on success", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.callback({
        access_token: "token-abc",
        expires_in: 3600,
      });
    });

    const client = createGoogleIdentityClient("client-id");
    const result = await client.requestAccessToken();

    expect(result.accessToken).toBe("token-abc");
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it("requests the read-only scopes required by the spec", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.callback({
        access_token: "token-abc",
        expires_in: 3600,
      });
    });

    const client = createGoogleIdentityClient("client-id");
    await client.requestAccessToken();

    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/spreadsheets.readonly",
        ].join(" "),
      }),
    );
  });

  it("rejects with access_denied when the user denies consent", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.callback({
        access_token: "",
        expires_in: 0,
        error: "access_denied",
      });
    });

    const client = createGoogleIdentityClient("client-id");
    await expect(client.requestAccessToken()).rejects.toMatchObject({
      code: "access_denied",
    } satisfies Partial<GoogleAuthError>);
  });

  it("rejects with popup_blocked when the popup fails to open", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.error_callback?.({
        type: "popup_failed_to_open",
      });
    });

    const client = createGoogleIdentityClient("client-id");
    await expect(client.requestAccessToken()).rejects.toMatchObject({
      code: "popup_blocked",
    } satisfies Partial<GoogleAuthError>);
  });
});
