import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach, vi } from "vitest";

// vi.fn이 아닌 일반 함수: 테스트의 vi.restoreAllMocks()가 구현을 지우지 않는다. 필요하면 vi.spyOn으로 덮어쓴다.
// 페이지·Context 테스트는 실제 Firebase 대신 이 mock과 GIS/userinfo spy를 쓴다.
vi.mock("../firebase", () => ({
  auth: { currentUser: null, authStateReady: async () => {} },
  firestore: {},
}));

vi.mock("firebase/auth", () => ({
  // 세션 복원이 끝나 로그인한 사용자가 없는 상태로 바로 알린다.
  onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
    callback(null);
    return () => {};
  },
  signOut: async () => {},
}));

vi.mock("../auth/firebaseSignIn", async () => {
  // spy가 걸린 export를 호출 시점에 읽도록 namespace로 가져온다.
  const identity = await import("../auth/googleIdentity");
  const userInfo = await import("../auth/userInfo");
  return {
    signInWithGoogle: async (clientId: string) => {
      const token = await identity.createGoogleIdentityClient(clientId).requestAccessToken();
      return { ...(await userInfo.fetchGoogleUserInfo(token.accessToken)), token };
    },
  };
});

// repo는 기본적으로 in-memory fake를 쓴다. 실제 구현을 검사하는 repo 테스트는 vi.unmock으로 푼다.
vi.mock("../storage/attemptRepo", async () => (await import("./fakeRepos")).fakeAttemptRepo);
vi.mock("../storage/topFolderRepo", async () => (await import("./fakeRepos")).fakeTopFolderRepo);

afterEach(async () => (await import("./fakeRepos")).resetFakeRepos());
