import { beforeEach, describe, expect, it } from "vitest";
import { clearTopFolder, getTopFolder, saveTopFolder } from "./topFolderRepo";
import { getDb } from "./db";

describe("topFolderRepo", () => {

  it("같은 사용자의 폴더를 덮어쓰고 다른 사용자 선택은 보존합니다", async () => {
    const selection = { googleUserId: "user-1", folderId: "old", folderName: "기존", updatedAt: "" };
    const other = { ...selection, googleUserId: "user-2" };
    await saveTopFolder(selection);
    await saveTopFolder(other);
    const updated = { ...selection, folderId: "new", folderName: "새 폴더" };
    await saveTopFolder(updated);
    expect(await getTopFolder("user-1")).toEqual(updated);
    await clearTopFolder("user-1");
    expect(await getTopFolder("user-1")).toBeUndefined();
    expect(await getTopFolder("user-2")).toEqual(other);
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.clear("topFolder");
  });

  it("returns undefined when no top folder is saved", async () => {
    const result = await getTopFolder("user-1");
    expect(result).toBeUndefined();
  });

  it("saves and retrieves a top folder selection per Google user", async () => {
    await saveTopFolder({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "자격증 문제은행",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });

    const result = await getTopFolder("user-1");
    expect(result).toEqual({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "자격증 문제은행",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
  });

  it("keeps selections for different Google users separate", async () => {
    await saveTopFolder({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "폴더 A",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
    await saveTopFolder({
      googleUserId: "user-2",
      folderId: "folder-2",
      folderName: "폴더 B",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });

    expect((await getTopFolder("user-1"))?.folderId).toBe("folder-1");
    expect((await getTopFolder("user-2"))?.folderId).toBe("folder-2");
  });

  it("clears a saved selection", async () => {
    await saveTopFolder({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "폴더 A",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
    await clearTopFolder("user-1");
    expect(await getTopFolder("user-1")).toBeUndefined();
  });
});
