import { beforeEach, describe, expect, it, vi } from "vitest";
import { firestoreFns, resetFirestoreMock } from "../test/firestoreMock";
import { deleteAttempt, getAttempt, listAttemptsByUser } from "./attemptRepo";
import { clearTopFolder, getTopFolder } from "./topFolderRepo";

vi.unmock("./attemptRepo");
vi.unmock("./topFolderRepo");
vi.mock("../firebase", async () => ({
  auth: (await import("../test/firestoreMock")).authMock,
  firestore: {},
}));
vi.mock("firebase/firestore", async () => (await import("../test/firestoreMock")).firestoreMock);

describe("저장소 연결 실패", () => {
  beforeEach(() => resetFirestoreMock());

  it.each([
    ["getAttempt", "getDoc", () => getAttempt("attempt-1")],
    ["listAttemptsByUser", "getDocs", () => listAttemptsByUser("user-1")],
    ["deleteAttempt", "deleteDoc", () => deleteAttempt("attempt-1")],
    ["getTopFolder", "getDoc", () => getTopFolder("user-1")],
    ["clearTopFolder", "deleteDoc", () => clearTopFolder("user-1")],
  ] as const)(
    "%s는 Firestore 오류를 빈 결과나 성공으로 숨기지 않습니다",
    async (_name, fn, operation) => {
      const error = new Error("Firestore 연결 실패");
      firestoreFns[fn].mockRejectedValue(error);
      await expect(operation()).rejects.toBe(error);
    },
  );
});
