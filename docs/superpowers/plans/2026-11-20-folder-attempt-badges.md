# 폴더 화면 풀이 상태 배지 + 로고 링크 변경 Plan

**Goal:** `/folders` 파일 목록에서 각 Sheet 파일에 풀이 상태 배지("제출 2/3", "풀이 중 1")를 보여준다. 로그인한 상태에서 상단 '풀이장' 로고를 누르면 `/folders`로 간다.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md` (§4 `quiz/`는 순수 로직, §5 폴더 탐색, §6 라우팅). 아키텍처 변경은 없다.
**Tier:** small. 새 의존성, 새 추상화, Firestore 스키마 변경이 없다. Sheets API를 더 호출하지 않는다.

## 설계

- **집계 (순수 함수):** `src/quiz/sheetAttemptStatus.ts`의 `summarizeAttemptsBySheet(attempts: StudyAttempt[]): Map<string, SheetAttemptStatus>`.
  - `SheetAttemptStatus = { attemptedTabs, submittedTabs, inProgressTabs }`. 모두 `spreadsheetId` 안의 서로 다른 `sheetTabId` 수다.
  - 탭에 `submittedAt` 또는 `result`가 있는 attempt가 하나라도 있으면 "제출"로 센다. 둘 다 없는 attempt가 하나라도 있으면 "풀이 중"으로 센다. 한 탭이 둘 다에 들 수 있다(fingerprint가 바뀌어 같은 탭에 attempt가 여러 개일 때).
  - 분모는 attempt가 있는 탭 수다. 시트의 전체 탭 수가 아니다(Sheets API를 호출하지 않으려고).
- **조회:** `DriveBrowsePage`에 `useLatestRequest(googleUserId)`를 하나 더 두고, `googleUserId`가 바뀔 때만 `listAttemptsByUser`를 한 번 부른다. 같은 `/folders/:folderId` 라우트 안에서 폴더를 옮길 때는 다시 부르지 않는다. `/folders`와 `/folders/:id` 사이를 오가면 리마운트되어 한 번 더 부른다. 그래도 된다.
  - 실패하면 배지를 생략한다. 목록 로딩과 오류 배너에 영향을 주지 않는다. `.catch(console.error)`에 "배지는 부가 정보" 주석을 단다(`attemptRepo.saveAttempt`와 같은 방식).
- **표시:** `files.map`의 `Item`에 `endContent`를 넣는다. 레이아웃은 `<span className="flex flex-wrap gap-1">`로만 잡는다(Tailwind는 레이아웃만).
  - `submittedTabs > 0`이면 `<Badge variant="success" label={`제출 ${submitted}/${attempted}`} />`
  - `inProgressTabs > 0`이면 `<Badge variant="warning" label={`풀이 중 ${inProgress}`} />`
  - attempt가 없으면 아무것도 넣지 않는다(`undefined`). 의미는 글자로 전달한다. 색에만 기대지 않는다.
- **로고:** `AppShell`에서 `useAuth()`의 `googleUserId`로 `headingHref={googleUserId ? "/folders" : "/"}`를 정한다. `App.tsx`에서 `AppShell`은 이미 `AuthProvider` 안에 있다.
- **안내 문구:** "…로고를 눌러 시작 화면에서 다시 연결해주세요."를 "Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 다시 연결해주세요."로 바꾼다. 로그아웃 상태면 시작 화면으로, 로그인 상태면 `/folders`의 `DriveReconnectNotice`로 가므로 두 경우 모두 맞다. 같은 문구가 5곳에 있어 모두 바꾼다: `DriveBrowsePage.tsx`, `KeywordsPage.tsx`, `SheetTabSelectPage.tsx`, `TopFolderSelectPage.tsx`, `SheetValidationPage.tsx`. 단위 테스트와 e2e 중 이 문구를 검사하는 곳은 없다.

## Tasks (TDD: 테스트 먼저)

### Task 1: 집계 함수

**Files:** `src/quiz/sheetAttemptStatus.ts`(신규), `src/quiz/sheetAttemptStatus.test.ts`(신규)

- [ ] 테스트를 먼저 쓴다(RED).
  - 빈 배열이면 빈 Map
  - 탭 3개 중 2개 제출, 1개 풀이 중이면 `{ attemptedTabs: 3, submittedTabs: 2, inProgressTabs: 1 }`
  - 같은 탭에 attempt가 여러 개여도 탭 하나로 센다
  - `result`만 있고 `submittedAt`은 없는 경우도 제출로 센다
  - 한 탭에 제출 attempt와 진행 중 attempt가 함께 있으면 두 수에 모두 1씩 더한다
  - spreadsheetId가 다르면 따로 집계한다
- [ ] 구현한다(GREEN). 입력은 바꾸지 않는다.

### Task 2: DriveBrowsePage 배지

**Files:** `src/pages/DriveBrowsePage.tsx`, `src/pages/DriveBrowsePage.test.tsx`

- [ ] 테스트를 먼저 쓴다. `HistoryPage.test.tsx`처럼 `vi.spyOn(attemptRepo, "listAttemptsByUser")`를 쓴다. 기본은 `test/setup.ts`의 fake repo라 기존 테스트는 빈 목록으로 계속 통과한다.
  - sheet-1에 제출 1개, 진행 중 1개(서로 다른 탭)가 있으면 "제출 1/2"와 "풀이 중 1"이 sheet-1 행 안에 보인다. sheet-2 행에는 배지가 없다.
  - `listAttemptsByUser`가 reject해도 파일 목록이 보이고 배지와 오류 배너는 없다.
  - 하위 폴더로 이동해도 `listAttemptsByUser`는 한 번만 불린다.
- [ ] 구현한다. 위 "설계" 참고. `exhaustive-deps`는 suppress하지 않는다.
- [ ] 안내 문구 5곳을 바꾼다.

### Task 3: AppShell 로고 링크

**Files:** `src/app/AppShell.tsx`, `src/app/AppShell.test.tsx`

- [ ] 테스트를 먼저 바꾼다.
  - `renderShell`에 `AuthProvider`를 넣는다. 기존 테스트(로그아웃, href "/")는 그대로 통과해야 한다.
  - 추가: 로그인 상태에서 로고 링크의 href가 "/folders"다.
- [ ] 구현한다. `useAuth` 한 줄과 `headingHref` 식이다.

### Task 4: e2e

**Files:** `e2e/quiz-flow.spec.ts`

- [ ] 로고를 누르면 이제 `/folders`로 바로 가므로 그 뒤의 `"Google Drive 연결"` 클릭을 지우고 주석도 고친다. 이 수정이 없으면 e2e가 실패한다.
- [ ] 로고를 누른 뒤 `AWS`를 클릭하고, `실전 모의고사 1` 행에 `"풀이 중 1"`이 보이는지 확인한다.

## 검증

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm e2e`.
리뷰는 `/ecc:orch-review`(`typescript-reviewer`, `react-reviewer`)로 한다. 화면을 바꾸므로 `a11y-architect`로 배지 글자와 행의 접근 가능한 이름을 확인한다. 토큰, OAuth, Drive API 호출 방식은 바뀌지 않아 security 리뷰는 대상이 아니다.

## 위험

- **행 접근 가능한 이름이 길어짐:** 배지 글자가 `Item` 버튼의 이름에 붙는다("실전 모의고사 1 제출 2/3 풀이 중 1"). 정규식으로 찾는 기존 테스트와 e2e는 영향이 없다.
- **"2/3"의 의미:** 분모가 시트 전체 탭 수가 아니라 풀어 본 탭 수다. 사용자가 이렇게 정했다.
- **한 탭이 제출과 풀이 중에 모두 들어감:** 시트가 바뀌어 새 attempt가 생긴 경우다.
- **attempt가 많을 때:** `listAttemptsByUser`는 전체를 읽는다. 개인용이라 수가 적다.

## 범위 밖

- 시트의 전체 탭 수 조회(Sheets API 추가 호출)
- attempt 목록 캐시와 폴더 간 공유
- 하위 폴더 단위 집계 배지
