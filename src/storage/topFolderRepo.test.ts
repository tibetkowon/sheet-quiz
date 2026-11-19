import { beforeEach, describe, expect, it, vi } from "vitest";
import { authMock, firestoreFns, resetFirestoreMock, snapshot } from "../test/firestoreMock";
import { clearTopFolder, getTopFolder, saveTopFolder } from "./topFolderRepo";

// 전역 setup의 in-memory fake 대신 실제 repo를 검사한다.
vi.unmock("./topFolderRepo");
vi.mock("../firebase", async () => ({
  auth: (await import("../test/firestoreMock")).authMock,
  firestore: {},
}));
vi.mock("firebase/firestore", async () => (await import("../test/firestoreMock")).firestoreMock);

const selection = {
  googleUserId: "user-1",
  folderId: "folder-1",
  folderName: "자격증 문제은행",
  updatedAt: "2026-09-03T00:00:00.000Z",
};

describe("topFolderRepo (Firestore)", () => {
  beforeEach(() => resetFirestoreMock());

  it("users/{uid}/topFolder/{googleUserId}에 선택을 저장합니다", async () => {
    await saveTopFolder(selection);
    expect(firestoreFns.setDoc).toHaveBeenCalledWith(
      { path: "users/uid-1/topFolder/user-1" },
      selection,
    );
  });

  it("서버 응답을 기다리지 않고, 서버가 거부해도 reject하지 않습니다", async () => {
    firestoreFns.setDoc.mockReturnValue(new Promise(() => {}));
    await expect(saveTopFolder(selection)).resolves.toBeUndefined();

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    firestoreFns.setDoc.mockRejectedValue(new Error("permission-denied"));
    await expect(saveTopFolder(selection)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });

  it("저장된 선택을 반환하고, 없으면 undefined를 반환합니다", async () => {
    expect(await getTopFolder("user-1")).toBeUndefined();
    firestoreFns.getDoc.mockResolvedValue(snapshot(selection));
    expect(await getTopFolder("user-1")).toEqual(selection);
    expect(firestoreFns.getDoc).toHaveBeenLastCalledWith({ path: "users/uid-1/topFolder/user-1" });
  });

  it("선택을 삭제합니다", async () => {
    await clearTopFolder("user-1");
    expect(firestoreFns.deleteDoc).toHaveBeenCalledWith({ path: "users/uid-1/topFolder/user-1" });
  });

  it("로그인하지 않았으면 오류를 던집니다", async () => {
    authMock.currentUser = null;
    await expect(saveTopFolder(selection)).rejects.toThrow("로그인이 필요합니다.");
    await expect(getTopFolder("user-1")).rejects.toThrow("로그인이 필요합니다.");
    await expect(clearTopFolder("user-1")).rejects.toThrow("로그인이 필요합니다.");
  });
});
