import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveApiError } from "./driveApiError";
import { listChildFolders, listRootFolders, listSheetFiles } from "./driveClient";

describe("listChildFolders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queries Drive for non-trashed folders under the given parent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: "f1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const folders = await listChildFolders("token-abc", "parent-1");

    expect(folders).toEqual([
      { id: "f1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("mimeType+%3D+%27application%2Fvnd.google-apps.folder%27");
    expect(calledUrl).toContain("trashed+%3D+false");
    expect(calledUrl).toContain("%27parent-1%27+in+parents");
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer token-abc" },
    });
  });

  it("throws DriveApiError with status 401 when the token is expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    await expect(listChildFolders("expired-token", "parent-1")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<DriveApiError>);
  });

  it("lists folders under the Drive root via listRootFolders", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listRootFolders("token-abc");

    expect(fetchMock.mock.calls[0][0]).toContain("%27root%27+in+parents");
  });
});

describe("listSheetFiles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queries Drive for non-trashed Google Sheet files under the given parent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: "s1", name: "1주차 문제", modifiedTime: "2026-09-01T00:00:00.000Z" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const files = await listSheetFiles("token-abc", "parent-1");

    expect(files).toEqual([{ id: "s1", name: "1주차 문제", modifiedTime: "2026-09-01T00:00:00.000Z" }]);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("mimeType+%3D+%27application%2Fvnd.google-apps.spreadsheet%27");
    expect(calledUrl).toContain("%27parent-1%27+in+parents");
  });

  it("throws DriveApiError with status 401 when the token is expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    await expect(listSheetFiles("expired-token", "parent-1")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<DriveApiError>);
  });
});
