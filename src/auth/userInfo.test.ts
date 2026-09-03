import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleUserInfo } from "./userInfo";

describe("fetchGoogleUserInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the stable Google user id and email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sub: "1234567890", email: "user@example.com" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGoogleUserInfo("token-abc");

    expect(result).toEqual({ googleUserId: "1234567890", email: "user@example.com" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: "Bearer token-abc" } },
    );
  });

  it("throws GoogleAuthError when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(fetchGoogleUserInfo("token-abc")).rejects.toMatchObject({
      code: "unknown",
    });
  });
});
