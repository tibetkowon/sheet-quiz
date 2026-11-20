# PWA "불러오는 중" 멈춤 수정 Plan

**증상:** Safari / iPhone PWA에서 화면을 전환할 때 `LoadingIndicator`에서 멈추고 넘어가지 않는 경우가 있다.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`. 아키텍처 변경은 없다.
**Tier:** small. 새 의존성이 없다.

## 원인

1. **확인됨:** `QuizPage`, `ResultsPage`, `ResumeSelectPage`, `SubmitConfirmPage`가 `getAttempt(id).then(...)`만 있고 `.catch`가 없다. 읽기가 reject되면 상태가 `"loading"`에 남는다.
2. **추정:** Firestore 읽기(`getDoc`/`getDocs`)와 Google API `fetch`에 타임아웃이 없다. iOS가 백그라운드에서 IndexedDB·네트워크 연결을 끊으면 promise가 끝나지 않을 수 있다. 이 경우는 1을 고쳐도 계속 멈춘다. 실기기 로그로 확정하지 못했다.

## 설계

- **실패 화면:** 4개 화면에 `"error"` 상태를 더하고 `.catch`에서 그 상태로 바꾼다. 오류는 `ErrorBanner`(기존 컴포넌트)로 "풀이 기록을 불러오지 못했습니다." 문구와 `onRetry`(다시 불러오기)를 보여준다. 다시 불러오기는 `HistoryPage`처럼 `load`를 `useCallback`으로 빼서 재사용한다.
- **Firestore 읽기 타임아웃:** `src/storage/withTimeout.ts`의 `withTimeout(promise, ms)`. 시간이 지나면 `Error("응답이 없습니다…")`로 reject한다. `getAttempt`, `listAttemptsByUser`, `getTopFolder`에 적용한다(`userRef()`의 `authStateReady` 대기도 포함되도록 함수 전체를 감싼다). 쓰기(`saveAttempt`)는 이미 응답을 기다리지 않아서 대상이 아니다.
  - 기본값 `READ_TIMEOUT_MS = 15_000`. Firestore는 오프라인이면 약 10초 뒤 캐시로 돌아오므로 그보다 길게 잡는다.
- **fetch 타임아웃:** `driveClient`, `sheetsClient`, `userInfo`의 `fetch`에 `signal: AbortSignal.timeout(READ_TIMEOUT_MS)`를 넣는다(Safari 16+ 지원). 호출하는 화면은 이미 `DriveApiError`가 아닌 오류를 일반 문구로 보여주므로 화면 변경은 없다.

## Tasks (TDD: 회귀 테스트 먼저)

### Task 1: 4개 화면의 실패 처리

**Files:** `src/pages/{Quiz,Results,ResumeSelect,SubmitConfirm}Page.tsx` 및 각 `.test.tsx`

- [ ] 각 화면에 RED 테스트: `vi.spyOn(attemptRepo, "getAttempt").mockRejectedValueOnce(...)` → 오류 문구가 알림 영역 안에 보이고(`closest('[role="alert"]')`), "다시 시도"를 누르면 기록이 정상으로 뜬다.
- [ ] `.catch`와 `"error"` 상태, `ErrorBanner` 추가로 GREEN.

### Task 2: Firestore 읽기 타임아웃

**Files:** `src/storage/withTimeout.ts`(신규), `src/storage/withTimeout.test.ts`(신규), `attemptRepo.ts`, `topFolderRepo.ts`

- [ ] RED: fake timer로 끝나지 않는 promise가 `READ_TIMEOUT_MS` 뒤 reject되는지, 제때 끝나면 값이 그대로 오는지, 타이머가 정리되는지.
- [ ] 구현 후 세 읽기 함수에 적용.

### Task 3: fetch 타임아웃

**Files:** `src/drive/driveClient.ts`, `src/sheets/sheetsClient.ts`, `src/auth/userInfo.ts`

- [ ] 각 fetch 호출에 `signal`이 전달되는지 기존 테스트에 단언 하나씩 추가(RED) 후 구현.

## 검증

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm e2e`.
리뷰: `/ecc:orch-review`. 화면을 바꾸므로 `a11y-architect`. Drive/Sheets API 호출을 건드리므로 `security-reviewer`.

## 위험

- 원인 2는 추정이다. 고친 뒤에도 멈추면 이제 15초 뒤 오류와 "다시 시도"가 나오므로, 그때의 콘솔 로그로 원인을 다시 좁힌다.
- 느린 네트워크에서 15초를 넘는 정상 응답이 오류로 바뀔 수 있다. 다시 시도로 회복된다.
- iOS가 끊은 IndexedDB 연결은 다시 시도로도 안 돌아올 수 있다(페이지 새로고침이 필요할 수 있음). 이번 범위에서는 다루지 않는다.

## 범위 밖

- Firestore 캐시 설정 변경(`persistentMultipleTabManager` → single 등)
- 오프라인 표시 UI
