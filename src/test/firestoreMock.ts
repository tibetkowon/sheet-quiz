import { vi } from "vitest";

// repo 단위 테스트용 firebase/firestore, ../firebase 대체물. 경로 문자열만 만들어 어떤 문서를 건드렸는지 확인한다.
interface Ref {
  path: string;
}

const pathOf = (parent: object, segments: string[]) => ({
  path: ("path" in parent ? [(parent as Ref).path, ...segments] : segments).join("/"),
});

export const authMock: {
  currentUser: { uid: string } | null;
  authStateReady: () => Promise<void>;
} = { currentUser: { uid: "uid-1" }, authStateReady: async () => {} };

export function snapshot(data?: unknown) {
  return { data: () => data };
}

export const firestoreFns = {
  getDoc: vi.fn(),
  getDocFromCache: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
};

export const firestoreMock = {
  ...firestoreFns,
  doc: (parent: object, ...segments: string[]) => pathOf(parent, segments),
  collection: (parent: object, ...segments: string[]) => pathOf(parent, segments),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (ref: Ref, ...constraints: unknown[]) => ({ ref, constraints }),
};

export function resetFirestoreMock() {
  authMock.currentUser = { uid: "uid-1" };
  firestoreFns.getDoc.mockReset().mockResolvedValue(snapshot());
  firestoreFns.getDocFromCache.mockReset().mockResolvedValue(snapshot());
  firestoreFns.getDocs.mockReset().mockResolvedValue({ docs: [] });
  firestoreFns.setDoc.mockReset().mockResolvedValue(undefined);
  firestoreFns.deleteDoc.mockReset().mockResolvedValue(undefined);
}
