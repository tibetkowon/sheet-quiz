import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudyAttempt } from "../types/studyAttempt";
import * as attemptRepo from "./attemptRepo";
import { getDb } from "./db";
import { migrateLocalData } from "./migrateLocalData";
import * as topFolderRepo from "./topFolderRepo";

const marker = (uid: string) => `sheet-quiz-migrated-${uid}`;

const attempt = (id: string, over: Partial<StudyAttempt> = {}): StudyAttempt => ({
  id,
  googleUserId: "u1",
  spreadsheetId: "s",
  spreadsheetName: "S",
  sheetTabId: "t",
  sheetTabName: "T",
  parentFolderId: "p",
  certificationFolderName: "C",
  questionSetFingerprint: "f",
  sourceModifiedTime: "2026-01-01T00:00:00.000Z",
  lastViewedIndex: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progress: [],
  ...over,
});

const folder = (googleUserId: string, folderId: string) => ({
  googleUserId,
  folderId,
  folderName: folderId,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("migrateLocalData", () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.clear("attempts");
    await db.clear("topFolder");
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("uploads the user's local attempts and topFolder and sets the marker", async () => {
    const db = await getDb();
    await db.put("attempts", attempt("a1"));
    await db.put("topFolder", folder("u1", "f1"));

    await migrateLocalData("u1");

    expect(await attemptRepo.getAttempt("a1")).toMatchObject({ id: "a1" });
    expect(await topFolderRepo.getTopFolder("u1")).toMatchObject({ folderId: "f1" });
    expect(window.localStorage.getItem(marker("u1"))).not.toBeNull();
    expect(await db.get("attempts", "a1")).toBeDefined();
  });

  it("keeps the remote copy when it is newer or equal", async () => {
    const db = await getDb();
    await db.put("attempts", attempt("a1", { lastViewedIndex: 1 }));
    await attemptRepo.saveAttempt(
      attempt("a1", { lastViewedIndex: 5, updatedAt: "2026-02-01T00:00:00.000Z" }),
    );

    await migrateLocalData("u1");

    expect((await attemptRepo.getAttempt("a1"))?.lastViewedIndex).toBe(5);
  });

  it("replaces an older remote copy", async () => {
    const db = await getDb();
    await db.put(
      "attempts",
      attempt("a1", { lastViewedIndex: 3, updatedAt: "2026-02-01T00:00:00.000Z" }),
    );
    await attemptRepo.saveAttempt(attempt("a1", { lastViewedIndex: 1 }));

    await migrateLocalData("u1");

    expect((await attemptRepo.getAttempt("a1"))?.lastViewedIndex).toBe(3);
  });

  it("ignores other users' data", async () => {
    const db = await getDb();
    await db.put("attempts", attempt("a2", { googleUserId: "u2" }));
    await db.put("topFolder", folder("u2", "f2"));

    await migrateLocalData("u1");

    expect(await attemptRepo.getAttempt("a2")).toBeUndefined();
    expect(await topFolderRepo.getTopFolder("u2")).toBeUndefined();
  });

  it("is a no-op on the second call", async () => {
    const db = await getDb();
    await db.put("attempts", attempt("a1"));
    await migrateLocalData("u1");
    const save = vi.spyOn(attemptRepo, "saveAttempt");

    await db.put("attempts", attempt("a3"));
    await migrateLocalData("u1");

    expect(save).not.toHaveBeenCalled();
    expect(await attemptRepo.getAttempt("a3")).toBeUndefined();
  });

  it("keeps uploading after one attempt fails, leaves no marker, and retries next time", async () => {
    const db = await getDb();
    await db.put("attempts", attempt("a1"));
    await db.put("attempts", attempt("a2"));
    await db.put("topFolder", folder("u1", "f1"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.spyOn(attemptRepo, "saveAttempt");
    save.mockRejectedValueOnce(new Error("boom"));

    await migrateLocalData("u1");
    expect(save).toHaveBeenCalledTimes(2);
    expect(await topFolderRepo.getTopFolder("u1")).toMatchObject({ folderId: "f1" });
    expect(window.localStorage.getItem(marker("u1"))).toBeNull();

    await migrateLocalData("u1");
    expect(await attemptRepo.getAttempt("a1")).toBeDefined();
    expect(await attemptRepo.getAttempt("a2")).toBeDefined();
    expect(window.localStorage.getItem(marker("u1"))).not.toBeNull();
  });

  it("does not overwrite an existing remote topFolder", async () => {
    const db = await getDb();
    await db.put("topFolder", folder("u1", "local"));
    await topFolderRepo.saveTopFolder(folder("u1", "remote"));

    await migrateLocalData("u1");

    expect((await topFolderRepo.getTopFolder("u1"))?.folderId).toBe("remote");
  });
});
