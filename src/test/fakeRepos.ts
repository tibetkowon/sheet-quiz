import { vi } from "vitest";
import type { StudyAttempt } from "../types/studyAttempt";
import type { TopFolderSelection } from "../storage/topFolderRepo";

// 보호 로직은 실제 repo의 순수 함수를 그대로 써서 fake와 동작이 갈라지지 않게 한다.
const { shouldWriteAttempt } =
  await vi.importActual<typeof import("../storage/attemptRepo")>("../storage/attemptRepo");

const attempts = new Map<string, StudyAttempt>();
const topFolders = new Map<string, TopFolderSelection>();

// Firestore처럼 저장·조회 때 복사해서 호출자의 수정이 저장본에 섞이지 않게 한다.
const copy = <T>(value: T): T => structuredClone(value);

export function resetFakeRepos() {
  attempts.clear();
  topFolders.clear();
}

export const fakeAttemptRepo = {
  shouldWriteAttempt,
  async saveAttempt(attempt: StudyAttempt, options: { allowSubmittedOverwrite?: boolean } = {}) {
    if (shouldWriteAttempt(attempts.get(attempt.id), attempt, options)) {
      attempts.set(attempt.id, copy(attempt));
    }
  },
  async getAttempt(id: string) {
    const found = attempts.get(id);
    return found && copy(found);
  },
  async listAttemptsByUser(googleUserId: string) {
    return [...attempts.values()].filter((a) => a.googleUserId === googleUserId).map(copy);
  },
  async deleteAttempt(id: string) {
    attempts.delete(id);
  },
};

export const fakeTopFolderRepo = {
  async saveTopFolder(selection: TopFolderSelection) {
    topFolders.set(selection.googleUserId, copy(selection));
  },
  async getTopFolder(googleUserId: string) {
    const found = topFolders.get(googleUserId);
    return found && copy(found);
  },
  async clearTopFolder(googleUserId: string) {
    topFolders.delete(googleUserId);
  },
};
