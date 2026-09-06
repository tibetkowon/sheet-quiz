import { afterEach, describe, expect, it, vi } from "vitest";
import * as dbModule from "./db";
import { deleteAttempt, getAttempt, listAttemptsByUser } from "./attemptRepo";
import { clearTopFolder, getTopFolder } from "./topFolderRepo";

describe("저장소 연결 실패", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["getAttempt", () => getAttempt("attempt-1")],
    ["listAttemptsByUser", () => listAttemptsByUser("user-1")],
    ["deleteAttempt", () => deleteAttempt("attempt-1")],
    ["getTopFolder", () => getTopFolder("user-1")],
    ["clearTopFolder", () => clearTopFolder("user-1")],
  ] as const)("%s는 연결 오류를 빈 결과나 성공으로 숨기지 않습니다", async (_name, operation) => {
    const error = new Error("IndexedDB 연결 실패");
    vi.spyOn(dbModule, "getDb").mockRejectedValue(error);
    await expect(operation()).rejects.toBe(error);
  });
});
