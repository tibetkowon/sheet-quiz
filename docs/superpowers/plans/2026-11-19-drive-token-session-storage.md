# Drive 토큰 sessionStorage 보관 (새로고침 후 Drive 연결 유지) Plan

**Goal:** `/folders` 같은 Drive 화면에서 새로고침해도, 토큰이 유효한 동안(최대 1시간)에는 "드라이브 다시 연결" 없이 그대로 보인다. 만료되면 지금처럼 다시 연결 버튼이 나온다.

**배경 (2026-11-19 사용자 결정):** 앱이 공개되지 않는다. 범위가 `drive.readonly`라 Google 앱 인증을 받기가 사실상 어렵고, 결국 본인과 지인만 OAuth 테스트 사용자로 쓰게 된다. 그래서 "Drive token은 메모리에만" 원칙을 완화한다. 감수하는 위험은 XSS가 생겼을 때 읽기 전용 토큰이 최대 1시간 동안 노출될 수 있다는 것이다.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md` (§1, §4, §5, §9, §16 개정). 이 plan은 `2026-11-19-firestore-sync.md`의 "Drive token은 메모리에만" 결정을 바꾼다.
**Tier:** standard. 인증과 토큰을 다루는 보안 트리거라 standard가 하한이다.

## 설계

- 키 `sheet-quiz-drive-token`. 값은 `{ accessToken, expiresAt, googleUserId }` JSON이다.
- `localStorage`가 아니라 `sessionStorage`를 쓴다. 탭을 닫으면 사라져서 노출 기간이 짧아진다.
- **저장:** `connect()`가 성공해 `tokenRef`를 정할 때 같이 저장한다.
- **복원:** `onAuthStateChanged`에서 사용자가 있을 때만 복원한다. 저장된 `googleUserId`가 복원된 사용자와 같고, `expiresAt - 60s`가 아직 지나지 않았을 때만 `tokenRef`에 넣고 `connected`로 둔다. 조건이 하나라도 맞지 않으면 저장값을 지우고 `expired`로 둔다.
- **삭제:** `disconnect()`, `markExpired()`, 사용자 없음(`signed_out`), `getAccessToken()`에서 만료를 발견했을 때, 그리고 `connect()`를 시작할 때 지운다.
- 저장소 접근은 `try/catch`로 감싼다. 사파리 사생활 보호 모드 같은 환경에서 실패하면 지금처럼 메모리로만 동작한다.
- `AuthContext`의 외부 API는 바꾸지 않는다. 바뀌는 파일은 `AuthContext.tsx` 한 곳이다.

## Tasks (TDD: 기존 테스트를 새 동작으로 먼저 바꾼다)

### Task 1: AuthContext 토큰 보관

**Files:** `src/auth/AuthContext.tsx`, `src/auth/AuthContext.test.tsx`

- [ ] 테스트를 먼저 바꾼다.
  - 기존 "restores the session as expired …"는 저장된 토큰이 **없을 때** expired인 경우로 남긴다.
  - 추가 1: 저장된 유효 토큰이 있으면 복원 후 `connected`, `getAccessToken()`이 그 토큰을 돌려준다.
  - 추가 2: 저장된 토큰이 다른 `googleUserId`이거나 만료됐으면 `expired`이고, 저장값이 지워진다.
  - 추가 3: `connect()` 성공 시 저장되고, `disconnect()`와 `markExpired()` 시 지워진다.
- [ ] `sessionStorage`는 `beforeEach`/`afterEach`에서 `window.sessionStorage.clear()`로 격리한다. bare 전역 대신 `window.sessionStorage`를 쓴다. Node 26 전역 webstorage 문제 때문이다.
- [ ] 구현한다. 위 "설계" 참고.

### Task 2: e2e 갱신

**Files:** `e2e/session-persist.spec.ts`

- [ ] 새로고침 후 `/folders`가 다시 연결 없이 바로 목록("AWS")을 보이는지 확인한다.
- [ ] 같은 spec에서 `sessionStorage`를 비운 뒤(새 탭과 같은 상황) 새로고침하면 "드라이브 다시 연결"이 나오고, 클릭하면 목록이 보이는지 확인한다. 기존 재연결 경로 검증을 유지하기 위해서다.

### Task 3: 문서

**Files:** spec, `CLAUDE.md`, `README.md`

- [ ] spec §1, §4, §5, §9: "메모리에만"을 "sessionStorage(탭 단위, 만료 시 삭제)"로 바꾼다. §16에 결정과 이유를 기록하고 이 plan을 링크한다.
- [ ] `CLAUDE.md`: "Drive OAuth access token은 메모리에만 보관"을 "Drive OAuth access token은 sessionStorage에 보관(탭 단위, 최대 1시간)"으로 바꾼다.
- [ ] `README.md` "데이터와 프라이버시": 같은 내용으로 고친다. "1시간이 지나거나 새 탭이면 다시 연결"을 함께 적는다.

## 검증

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm e2e`.
리뷰는 `/ecc:orch-review`로 하고 security 관점을 포함한다.

## 범위 밖

- 토큰 자동 갱신: 팝업 없이는 불가능하다.
- 폴더 목록 캐시.
- `localStorage` 보관: 노출 기간이 길어서 쓰지 않는다.
