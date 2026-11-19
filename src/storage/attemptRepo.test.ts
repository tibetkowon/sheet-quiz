import { beforeEach, describe, expect, it, vi } from "vitest";
import { authMock, firestoreFns, resetFirestoreMock, snapshot } from "../test/firestoreMock";
import {
  deleteAttempt,
  getAttempt,
  listAttemptsByUser,
  saveAttempt,
  shouldWriteAttempt,
} from "./attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";

// 전역 setup의 in-memory fake 대신 실제 repo를 검사한다.
vi.unmock("./attemptRepo");
vi.mock("../firebase", async () => ({
  auth: (await import("../test/firestoreMock")).authMock,
  firestore: {},
}));
vi.mock("firebase/firestore", async () => (await import("../test/firestoreMock")).firestoreMock);

const SUBMITTED = { submittedAt: "2026-09-06T00:00:00.000Z" };
const RESULT = {
  scorePercent: 100,
  correctCount: 1,
  incorrectCount: 0,
  unansweredCount: 0,
  categoryStats: [],
  difficultyStats: [],
};

function makeAttempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "문제은행",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: [],
    ...overrides,
  };
}

describe("shouldWriteAttempt", () => {
  const older = "2026-09-04T00:00:00.000Z";
  const newer = "2026-09-05T00:00:00.000Z";

  it.each([
    ["기존 문서가 없으면 쓴다", undefined, makeAttempt(), {}, true],
    [
      "제출 전 기존 문서는 덮어쓴다",
      makeAttempt({ updatedAt: older }),
      makeAttempt({ updatedAt: newer }),
      {},
      true,
    ],
    [
      "updatedAt이 같으면 쓴다",
      makeAttempt({ updatedAt: older }),
      makeAttempt({ updatedAt: older }),
      {},
      true,
    ],
    [
      "기존 updatedAt이 더 새로워도 쓴다 (기기 간 시계 차이로 저장이 버려지지 않게)",
      makeAttempt({ updatedAt: newer }),
      makeAttempt({ updatedAt: older }),
      {},
      true,
    ],
    [
      "제출된(submittedAt) 기존 문서는 제출 전 상태로 덮어쓰지 않는다",
      makeAttempt({ ...SUBMITTED, updatedAt: older }),
      makeAttempt({ updatedAt: newer }),
      {},
      false,
    ],
    [
      "제출된(result) 기존 문서는 제출 전 상태로 덮어쓰지 않는다",
      makeAttempt({ result: RESULT, updatedAt: older }),
      makeAttempt({ updatedAt: newer }),
      {},
      false,
    ],
    [
      "allowSubmittedOverwrite면 제출된 문서도 덮어쓴다",
      makeAttempt({ ...SUBMITTED, updatedAt: older }),
      makeAttempt({ updatedAt: newer }),
      { allowSubmittedOverwrite: true },
      true,
    ],
    [
      "새 문서가 제출본(submittedAt)이면 허용한다",
      makeAttempt({ ...SUBMITTED, updatedAt: older }),
      makeAttempt({ ...SUBMITTED, updatedAt: newer }),
      {},
      true,
    ],
    [
      "새 문서가 제출본(result)이면 허용한다",
      makeAttempt({ ...SUBMITTED, updatedAt: older }),
      makeAttempt({ result: RESULT, updatedAt: newer }),
      {},
      true,
    ],
    [
      "allowSubmittedOverwrite면 기존 updatedAt이 더 새로워도 덮어쓴다",
      makeAttempt({ ...SUBMITTED, updatedAt: newer }),
      makeAttempt({ updatedAt: older }),
      { allowSubmittedOverwrite: true },
      true,
    ],
  ] as const)("%s", (_name, existing, incoming, options, expected) => {
    expect(shouldWriteAttempt(existing, incoming, options)).toBe(expected);
  });
});

describe("attemptRepo (Firestore)", () => {
  beforeEach(() => resetFirestoreMock());

  it("users/{uid}/attempts/{id} 경로에 기록을 저장합니다", async () => {
    const attempt = makeAttempt();
    await saveAttempt(attempt);
    expect(firestoreFns.setDoc).toHaveBeenCalledWith(
      { path: "users/uid-1/attempts/attempt-1" },
      attempt,
    );
  });

  it("900KB를 넘는 기록은 오류를 던지고 저장하지 않습니다", async () => {
    const huge = makeAttempt({ spreadsheetName: "가".repeat(900_001) });
    await expect(saveAttempt(huge)).rejects.toThrow(
      "문제 수가 너무 많아 저장할 수 없습니다. 시트를 나눠주세요.",
    );
    expect(firestoreFns.setDoc).not.toHaveBeenCalled();
    expect(firestoreFns.getDocFromCache).not.toHaveBeenCalled();
  });

  it("글자 수가 아니라 UTF-8 바이트로 크기를 잰다", async () => {
    // 한글 400,000자 = 1.2MB(UTF-8)이지만 글자 수로는 900,000 미만이다.
    const korean = makeAttempt({ spreadsheetName: "가".repeat(400_000) });
    await expect(saveAttempt(korean)).rejects.toThrow("시트를 나눠주세요");
  });

  it("로그인하지 않았으면 모든 작업이 오류를 던집니다", async () => {
    authMock.currentUser = null;
    await expect(saveAttempt(makeAttempt())).rejects.toThrow("로그인이 필요합니다.");
    await expect(getAttempt("a")).rejects.toThrow("로그인이 필요합니다.");
    await expect(listAttemptsByUser("u")).rejects.toThrow("로그인이 필요합니다.");
    await expect(deleteAttempt("a")).rejects.toThrow("로그인이 필요합니다.");
    expect(firestoreFns.setDoc).not.toHaveBeenCalled();
  });

  it("세션 복원(authStateReady)이 끝난 뒤에 사용자를 읽습니다", async () => {
    authMock.currentUser = null;
    const original = authMock.authStateReady;
    authMock.authStateReady = async () => {
      authMock.currentUser = { uid: "restored" };
    };
    try {
      await getAttempt("a1");
      expect(firestoreFns.getDoc).toHaveBeenCalledWith({ path: "users/restored/attempts/a1" });
    } finally {
      authMock.authStateReady = original;
    }
  });

  it("캐시에 없으면 서버 읽기로 기존 문서를 확인합니다", async () => {
    firestoreFns.getDocFromCache.mockRejectedValue(new Error("cache miss"));
    firestoreFns.getDoc.mockResolvedValue(snapshot(makeAttempt({ ...SUBMITTED })));
    await saveAttempt(makeAttempt({ updatedAt: "2026-09-05T00:00:00.000Z" }));
    expect(firestoreFns.getDoc).toHaveBeenCalledTimes(1);
    expect(firestoreFns.setDoc).not.toHaveBeenCalled();
  });

  it("제출된 기존 문서를 제출 전 자동저장으로 덮어쓰지 않습니다", async () => {
    firestoreFns.getDocFromCache.mockResolvedValue(snapshot(makeAttempt({ ...SUBMITTED })));
    await saveAttempt(makeAttempt({ lastViewedIndex: 4 }));
    expect(firestoreFns.setDoc).not.toHaveBeenCalled();
  });

  it("allowSubmittedOverwrite로 제출된 문서를 다시 시작할 수 있습니다", async () => {
    firestoreFns.getDocFromCache.mockResolvedValue(snapshot(makeAttempt({ ...SUBMITTED })));
    const restarted = makeAttempt({ updatedAt: "2026-09-05T00:00:00.000Z" });
    await saveAttempt(restarted, { allowSubmittedOverwrite: true });
    expect(firestoreFns.setDoc).toHaveBeenCalledWith(expect.anything(), restarted);
  });

  it("서버 응답을 기다리지 않고, 서버가 거부해도 saveAttempt는 reject하지 않습니다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    firestoreFns.setDoc.mockRejectedValue(new Error("permission-denied"));
    await expect(saveAttempt(makeAttempt())).resolves.toBeUndefined();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();

    firestoreFns.setDoc.mockReturnValue(new Promise(() => {}));
    await expect(saveAttempt(makeAttempt())).resolves.toBeUndefined();
  });

  it("문서가 없으면 getAttempt는 undefined를 반환합니다", async () => {
    expect(await getAttempt("missing")).toBeUndefined();
  });

  it("getAttempt는 저장된 문서 내용을 반환합니다", async () => {
    const attempt = makeAttempt();
    firestoreFns.getDoc.mockResolvedValue(snapshot(attempt));
    expect(await getAttempt("attempt-1")).toEqual(attempt);
    expect(firestoreFns.getDoc).toHaveBeenCalledWith({ path: "users/uid-1/attempts/attempt-1" });
  });

  it("listAttemptsByUser는 googleUserId로 거른 문서들을 반환합니다", async () => {
    const a1 = makeAttempt({ id: "a1" });
    const a2 = makeAttempt({ id: "a2" });
    firestoreFns.getDocs.mockResolvedValue({ docs: [snapshot(a1), snapshot(a2)] });
    expect(await listAttemptsByUser("user-1")).toEqual([a1, a2]);
    expect(firestoreFns.getDocs).toHaveBeenCalledWith({
      ref: { path: "users/uid-1/attempts" },
      constraints: [{ field: "googleUserId", op: "==", value: "user-1" }],
    });
  });

  it("deleteAttempt는 해당 문서를 삭제합니다", async () => {
    await deleteAttempt("a1");
    expect(firestoreFns.deleteDoc).toHaveBeenCalledWith({ path: "users/uid-1/attempts/a1" });
  });
});
