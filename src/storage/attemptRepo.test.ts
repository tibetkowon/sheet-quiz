import { beforeEach, describe, expect, it } from "vitest";
import { deleteAttempt, getAttempt, listAttemptsByUser, saveAttempt } from "./attemptRepo";
import { getDb } from "./db";
import type { StudyAttempt } from "../types/studyAttempt";

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

describe("attemptRepo", () => {

  it("반환된 중첩 데이터를 수정해도 저장된 기록은 바뀌지 않습니다", async () => {
    const attempt = makeAttempt({
      progress: [{ questionId: "q1", selectedAnswers: ["A"], status: "ANSWERED", reviewMarked: false, updatedAt: "" }],
    });
    await saveAttempt(attempt);
    const loaded = await getAttempt(attempt.id);
    expect(loaded).toEqual(attempt);
    loaded!.progress[0].selectedAnswers.push("B");
    expect(await getAttempt(attempt.id)).toEqual(attempt);
  });

  it("한 기록을 삭제해도 다른 사용자의 기록과 인덱스는 유지합니다", async () => {
    const other = makeAttempt({ id: "other", googleUserId: "user-2" });
    await saveAttempt(makeAttempt());
    await saveAttempt(other);
    await deleteAttempt("attempt-1");
    expect(await listAttemptsByUser("user-1")).toEqual([]);
    expect(await listAttemptsByUser("user-2")).toEqual([other]);
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.clear("attempts");
  });

  it("returns undefined when no attempt is saved", async () => {
    expect(await getAttempt("missing")).toBeUndefined();
  });

  it("saves and retrieves an attempt by id", async () => {
    const attempt = makeAttempt();
    await saveAttempt(attempt);
    expect(await getAttempt("attempt-1")).toEqual(attempt);
  });

  it("overwrites the same attempt id on repeated saves", async () => {
    await saveAttempt(makeAttempt({ lastViewedIndex: 0 }));
    await saveAttempt(makeAttempt({ lastViewedIndex: 3 }));
    expect((await getAttempt("attempt-1"))?.lastViewedIndex).toBe(3);
  });

  it("keeps attempts for different ids separate", async () => {
    await saveAttempt(makeAttempt({ id: "attempt-1" }));
    await saveAttempt(makeAttempt({ id: "attempt-2", sheetTabName: "다른 탭" }));
    expect((await getAttempt("attempt-1"))?.sheetTabName).toBe("문제은행");
    expect((await getAttempt("attempt-2"))?.sheetTabName).toBe("다른 탭");
  });

  it("lists only attempts belonging to the given user, most-recent-first not required", async () => {
    await saveAttempt(makeAttempt({ id: "a1", googleUserId: "user-1" }));
    await saveAttempt(makeAttempt({ id: "a2", googleUserId: "user-1" }));
    await saveAttempt(makeAttempt({ id: "a3", googleUserId: "user-2" }));

    const found = await listAttemptsByUser("user-1");

    expect(found.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("returns an empty array when the user has no attempts", async () => {
    expect(await listAttemptsByUser("nobody")).toEqual([]);
  });

  it("deletes an attempt by id", async () => {
    await saveAttempt(makeAttempt({ id: "a1" }));
    await deleteAttempt("a1");
    expect(await getAttempt("a1")).toBeUndefined();
  });

  it("does not throw when deleting an id that does not exist", async () => {
    await expect(deleteAttempt("missing")).resolves.toBeUndefined();
  });
  it.each(["result", "submittedAt"] as const)("이미 %s가 있는 기록은 지연된 자동저장으로 덮어쓰지 않습니다", async (field) => {
    const submitted = makeAttempt({
      [field]: field === "result"
        ? { scorePercent: 100, correctCount: 1, incorrectCount: 0, unansweredCount: 0, categoryStats: [], difficultyStats: [] }
        : "2026-09-06T00:00:00.000Z",
    });
    await saveAttempt(submitted);
    await Promise.all([
      saveAttempt(makeAttempt({ lastViewedIndex: 99 })),
      saveAttempt(makeAttempt({ lastViewedIndex: 4 })),
    ]);
    expect(await getAttempt(submitted.id)).toEqual(submitted);
  });

  it.each(["result", "submittedAt"] as const)("이미 제출된 기록 위에 %s가 있는 새 제출을 저장합니다", async (field) => {
    const existing = makeAttempt({
      submittedAt: "2026-09-06T00:00:00.000Z",
      result: { scorePercent: 0, correctCount: 0, incorrectCount: 1, unansweredCount: 0, categoryStats: [], difficultyStats: [] },
    });
    await saveAttempt(existing);
    const submitted = makeAttempt({
      lastViewedIndex: 1,
      progress: [{ questionId: "q1", selectedAnswers: ["A"], status: "ANSWERED", reviewMarked: false, updatedAt: "2026-09-07T00:00:00.000Z" }],
      [field]: field === "result"
        ? { scorePercent: 100, correctCount: 1, incorrectCount: 0, unansweredCount: 0, categoryStats: [], difficultyStats: [] }
        : "2026-09-07T00:00:00.000Z",
    });
    await saveAttempt(submitted);
    expect(await getAttempt(submitted.id)).toEqual(submitted);
    await saveAttempt(makeAttempt({ lastViewedIndex: 99 }));
    expect(await getAttempt(submitted.id)).toEqual(submitted);
  });

  it("제출 트랜잭션 뒤에 시작된 지연 자동저장은 제출 완료를 보존합니다", async () => {
    await saveAttempt(makeAttempt());
    const submitted = makeAttempt({ submittedAt: "2026-09-06T00:00:00.000Z" });
    await Promise.all([saveAttempt(submitted), saveAttempt(makeAttempt({ lastViewedIndex: 4 }))]);
    expect(await getAttempt(submitted.id)).toEqual(submitted);
  });

});
