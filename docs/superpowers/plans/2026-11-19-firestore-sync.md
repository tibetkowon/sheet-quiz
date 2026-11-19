# Firestore 동기화 (새로고침 로그인 유지 + 기기 간 이어 풀기) Implementation Plan

**Goal:** (1) 새로고침해도 로그인이 풀리지 않는다. (2) PC에서 풀던 시험을 모바일에서 이어 풀 수 있다(반대 방향도 같다).

**Architecture:** 로그인 유지는 Firebase Auth가 맡는다(기본 `browserLocalPersistence`). Drive/Sheets access token은 지금처럼 메모리에만 둔다. 첫 로그인은 `signInWithPopup` 팝업 한 번으로 Firebase 세션과 Drive token을 함께 받는다. 새로고침하면 Firebase 세션만 남는다. 이때 Drive가 필요 없는 화면(풀이·이어 풀기·제출·결과·기록·설정)은 바로 동작한다. Drive가 필요한 화면(폴더 탐색·탭 선택·검증·키워드)에는 "드라이브 다시 연결" 버튼이 나온다. 이 버튼은 기존 GIS token client를 `login_hint`와 함께 호출해서 계정 선택 없이 한 번 클릭으로 끝난다.

풀이 기록과 최상위 폴더는 Firestore가 원본이다. 오프라인에서도 쓸 수 있게 SDK의 `persistentLocalCache`(`persistentMultipleTabManager`)를 켠다. `attemptRepo.ts`/`topFolderRepo.ts`는 export 시그니처를 그대로 두고 구현만 Firestore로 바꾼다. 그래서 페이지 코드는 거의 바뀌지 않는다. 기기 간 동기화는 화면을 열 때 읽어 오는 방식(fetch-on-open)으로 하고, `onSnapshot`은 쓰지 않는다. 기존 IndexedDB 데이터는 기기별 첫 로그인 때 한 번만 업로드하고, 그 뒤로는 읽지 않는다.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`. 이 기능은 spec의 핵심 제약을 뒤집는다. 그래서 Task 0에서 spec과 CLAUDE.md를 **먼저** 고친 뒤에 구현을 시작한다.

**사용자 확정 사항 (2026-11-19):**
- Drive token은 메모리에만 두고, 새로고침 후에는 필요할 때 다시 연결한다.
- Firestore가 원본이다(SDK 오프라인 캐시 사용).
- 기존 IndexedDB 기록은 첫 로그인 때 업로드한다.
- E2E는 Firebase Emulator에서 돌린다.

## 데이터 배치 (Firestore)

```
users/{firebaseUid}/attempts/{attemptId}            StudyAttempt 그대로 (questionSnapshot 포함)
users/{firebaseUid}/topFolder/{googleUserId}        TopFolderSelection 그대로
```

- 규칙(rules)은 Firebase uid를 기준으로 판단한다. 문서 내용과 `attemptId`는 지금처럼 Google sub(`googleUserId`)를 쓴다.
- `googleUserId`는 Firebase `user.providerData`에서 `providerId === "google.com"`인 항목의 `uid`(=Google sub)에서 가져온다. 기존 userinfo `sub`와 같은 값이라 `attemptId`가 바뀌지 않고, 마이그레이션도 같은 id로 맞아떨어진다.
- `topFolder`를 `settings/topFolder`가 아니라 `topFolder/{googleUserId}`에 두는 이유: 기존 시그니처 `getTopFolder(googleUserId)`의 인자를 그대로 쓰고, idb의 keyPath와도 같은 구조가 되기 때문이다.

## 문서 크기 (1 MiB 한도)

- Firestore는 문자열 크기를 UTF-8 바이트로 센다. 한글은 글자당 3바이트다.
- 한 attempt는 문제 탭 하나 전체(`questionSnapshot`)와 진행 기록을 담는다. 그래서 한도를 정하는 것은 **탭 하나의 문항 수 × 문항 하나의 글자 수**다.
- 문항 하나의 크기:
  - 보통(본문 150자, 보기 4×40자, 해설 200자, 보기별 해설 4×80자, 키워드 50자): 약 900자 ≈ 3 KB. 진행 기록과 필드명을 더하면 약 3.5 KB다.
  - 최악(아래 프롬프트 상한을 꽉 채우고 보기 6개): 약 1,800자 ≈ 5.5 KB.
- 기준: **탭 하나에 150문항 이하**, 필드별 글자 수 상한은 아래 프롬프트 기준을 따른다. 150 × 5.5 KB ≈ 825 KB로 900 KB 안에 들어간다. 이 기준은 Task 3에서 문제 생성 프롬프트(`docs/ai-question-generation-prompt.md`)에 반영한다.
- 앱에도 보호 장치를 둔다. `saveAttempt`에서 `new Blob([JSON.stringify(attempt)]).size > 900_000`이면 `"문제 수가 너무 많아 저장할 수 없습니다. 시트를 나눠주세요."` 오류를 던진다. 900 KB로 잡은 이유는 Firestore의 실제 크기 계산(필드명, 인덱스 오버헤드)과 JSON 크기가 달라서 여유를 두기 위해서다. 시험을 시작할 때(SheetValidationPage에서 첫 저장) 이 오류가 표시되므로 풀이 도중에 막히는 일은 없다. 문서를 쪼개는 방식은 범위 밖이다.

## 충돌 정책과 동시성

- 기본은 last write wins다. `saveAttempt`는 쓰기 전에 기존 문서를 읽어서, 기존 문서가 이미 제출됐는데 새 문서는 제출 전 상태이고 `allowSubmittedOverwrite`도 아니면 쓰지 않는다. 이 보호 장치는 지금 코드에 있는 것을 그대로 유지한다.
- `updatedAt` 비교는 하지 않는다(Task 3 리뷰에서 제거). 기기마다 시계가 달라서, 시계가 늦은 기기의 자동저장과 다시 시작하기가 오류 없이 버려지기 때문이다.
- **트랜잭션을 쓰지 않는다.** `runTransaction`은 오프라인이면 실패해서 오프라인 자동저장이 깨진다. 대신 `getDocFromCache(ref)`를 먼저 시도하고 실패하면 `getDoc(ref)`를 쓴 다음 `setDoc`한다. 이 보호 장치의 원래 목적은 "같은 기기에서 제출 직후 늦게 도착한 autosave"를 막는 것이라 캐시만 읽어도 충분하다. 캐시를 먼저 읽는 또 다른 이유가 있다. `beforeunload`/`visibilitychange`에서 호출되는 flush가 네트워크 왕복을 기다리지 않아도 된다.
- **서버 응답(ack)을 기다리지 않는다.** 오프라인이면 `setDoc` Promise가 resolve되지 않아서 "저장 중"이 계속 표시된다. 그래서 `saveAttempt`는 `setDoc`을 호출한 뒤 `void setDoc(...).catch(console.error)`로 넘기고 반환한다. 로컬 캐시에 쓰는 것은 같은 인스턴스의 다음 읽기에 바로 보인다. 화면의 "저장됨"은 "이 기기에 저장됨, 동기화 대기"라는 뜻이 된다. 코드에 `shortcut:` 주석을 남긴다.
- **알려진 동시성 위험:** 두 기기에서 같은 attempt를 동시에 열어 두면, 늦게 autosave한 쪽이 문서 전체를 덮어써서 다른 기기의 진행이 사라진다. 실시간 구독(`onSnapshot`)과 문항 단위 병합은 범위 밖이다. "이어 풀기"는 한 기기에서 그만 풀고 다른 기기에서 다시 여는 흐름이라 화면을 열 때 읽기만 해도 된다. README에 "한 번에 한 기기에서 풀기"를 적는다.

## E2E 로그인 방식 (Emulator)

- 실제 팝업 대신 **테스트 전용 경로**를 쓴다. `VITE_FIREBASE_EMULATOR=1`이면 첫 로그인을 다음 순서로 처리한다.
  1. 기존 GIS token client를 호출한다(e2e에서는 이미 mock이 있다).
  2. `fetchGoogleUserInfo`로 sub와 email을 받는다(이것도 mock이 있다).
  3. `signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true })))`를 호출한다. Auth Emulator는 서명되지 않은 JSON id_token을 받아 준다.

  이렇게 하면 팝업 창을 조작할 필요가 없고, 기존 `mockGoogleApis`를 그대로 쓸 수 있다.
- Emulator는 같은 sub를 같은 uid로 묶는다. 그런데 Playwright는 `fullyParallel`로 돌기 때문에 테스트끼리 데이터가 섞이지 않도록 해야 한다. 그래서 `mockGoogleApis(page, sub = \`mock-user-${randomUUID()}\`)`처럼 테스트마다 고유한 sub를 쓰고, 그 sub를 반환한다. 기기 간 테스트에서는 같은 sub를 두 context에 넘긴다.
- `pnpm e2e`의 실행 순서: `firebase emulators:exec --only auth,firestore --project demo-sheet-quiz "vitest run firestore.rules.test.ts && playwright test"`. 프로젝트 id에 `demo-` 접두어를 붙이면 실제 Firebase 프로젝트 없이 동작한다.
- **요구사항:** `firebase-tools`(devDependency)와 Java(JDK 21 이상. 최신 firebase-tools의 요구사항이므로 설치할 때 버전을 확인한다). `pnpm e2e`를 돌리는 머신에 둘 다 있어야 한다.

## Global Constraints

- Drive/Sheets access token은 메모리에만 둔다(`tokenRef`). Firebase Auth 세션은 SDK가 브라우저(IndexedDB)에 저장하는데, 이것은 허용한다(spec에 명시).
- 자체 백엔드 서버, 런타임 AI 호출은 계속 금지한다. Drive/Sheets는 계속 읽기 전용으로만 쓴다.
- 페이지 코드는 최소로만 바꾼다. repo export 시그니처(`saveAttempt`, `getAttempt`, `listAttemptsByUser`, `deleteAttempt`, `saveTopFolder`, `getTopFolder`, `clearTopFolder`)는 바꾸지 않는다.
- `react-hooks/exhaustive-deps`를 suppress하지 않는다. 비활성화 주석은 eslint-plugin-react-hooks 4.6.2 + ESLint 9에서 crash한다. dependency를 실제로 빠짐없이 적는다.
- IndexedDB 테스트를 격리할 때 `deleteDatabase`를 쓰지 않는다. `const db = await getDb(); await db.clear("<store>")`를 쓴다(마이그레이션 테스트).
- Astryx 관련: `Button isDisabled`는 `aria-disabled`이다. `Spinner`가 숨겨진 `role="alert"`를 만들므로 배너는 `closest('[role="alert"]')`로 확인한다. Tailwind는 레이아웃에만 쓰고 색은 `var(--color-...)`로 쓴다.
- 아무도 요청하지 않은 추상화나 옵션은 만들지 않는다. 실시간 구독, 문서 분할, 병합 알고리즘, 오프라인 표시 UI는 범위 밖이다.
- `initializeFirestore`에는 반드시 `ignoreUndefinedProperties: true`를 준다. `restartAttempt` 등이 `submittedAt: undefined`처럼 명시적인 undefined를 만들어서, 이 설정이 없으면 `setDoc`이 예외를 던진다.

---

### Task 0: Spec과 CLAUDE.md 개정 (구현보다 먼저)

**Files:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`, `CLAUDE.md`

- [ ] §1: "풀이 기록은 IndexedDB에만" → "풀이 기록은 Firestore(사용자별, 소유자만 접근)에 저장하고 SDK 오프라인 캐시를 쓴다. 로그인 세션은 Firebase Auth가 유지하고, Drive access token은 메모리에만 둔다."
- [ ] §2: "Supabase/Firebase … 외부 DB 금지", "클라우드 동기화 금지" → "자체 백엔드 서버 금지. 저장/인증 외부 서비스는 Firebase Auth와 Firestore만 허용한다(2026-11-19 사용자 결정)." 정적 배포 조건은 그대로 둔다.
- [ ] §3: `firebase`를 추가한다. `idb`는 "기존 데이터 마이그레이션 전용"으로 적는다.
- [ ] §4: `src/firebase.ts`를 추가한다. `storage/` 설명을 "Firestore 레포지토리 + 1회성 IndexedDB 마이그레이션"으로 바꾼다.
- [ ] §5 AuthContext: Firebase 사용자(세션 유지)와 메모리 Drive token을 나눠서 설명한다. 상태 의미를 적는다. 시작 시 `connecting`(세션 복원 중), Firebase 사용자는 있는데 token이 없으면 `expired`(→ "드라이브 다시 연결"), 둘 다 있으면 `connected`. QuizContext 설명의 "IndexedDB 동기화"는 "repo 동기화"로 바꾼다.
- [ ] §9 전체 교체: Firestore 경로 배치, 충돌 정책(위 절), 1 MiB 보호 장치, 1회성 마이그레이션, "token은 어디에도 저장하지 않는다"(유지).
- [ ] §12: E2E는 Firebase Emulator(auth+firestore)에서 돌고, 위의 테스트 전용 로그인 경로를 쓴다. rules 테스트를 추가한다.
- [ ] §13: 환경변수에 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`를 추가한다. `VITE_FIREBASE_EMULATOR`는 e2e 전용이다. 배포하려면 Firebase 콘솔 설정과 rules 배포가 필요하다는 점을 적는다.
- [ ] §16에 "2026-11-19 Firebase Auth + Firestore 도입 확정"을 추가한다.
- [ ] CLAUDE.md 스택 목록: "백엔드 없음" → "자체 백엔드 서버 없음", "외부 DB 없음" → "Firebase Auth + Firestore(풀이 기록 동기화)", "OAuth token은 메모리에만 보관" → "Drive OAuth access token은 메모리에만 보관". 특이사항에 "`pnpm e2e`는 Firebase Emulator를 띄운다. firebase-tools와 JDK 21 이상이 필요하다"를 추가한다.

**검증:** 문서만 바뀌므로 `pnpm lint`만 확인한다.

### Task 1: Firebase 기반 설정 + rules + emulator 기반 e2e 파이프라인

앱 동작은 아직 바뀌지 않는다. 기존 e2e가 emulator 아래에서도 그대로 통과하는지 확인하는 단계다.

**Files:** `package.json`, `src/firebase.ts`(신규), `firestore.rules`(신규), `firebase.json`(신규), `firestore.rules.test.ts`(신규), `.env.example`, `.env.e2e`(신규, 커밋), `playwright.config.ts`, `scripts/setup-firebase.sh`(신규), `src/vite-env.d.ts`(env 타입이 있으면)

- [ ] 의존성: `firebase`(dependency), `firebase-tools`와 `@firebase/rules-unit-testing`(devDependency).
- [ ] `src/firebase.ts`: `initializeApp({ apiKey, authDomain, projectId })`, `export const auth = getAuth(app)`, `export const firestore = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true })`. `import.meta.env.VITE_FIREBASE_EMULATOR`이 켜져 있으면 `connectAuthEmulator(auth, "http://127.0.0.1:9099")`와 `connectFirestoreEmulator(firestore, "127.0.0.1", 8080)`을 호출한다. 이름을 `firestore`로 한 이유는 `storage/db.ts`의 `getDb`와 헷갈리지 않게 하기 위해서다.
- [ ] `firestore.rules`:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{uid}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
  ```
- [ ] `firebase.json`: `firestore.rules` 경로, emulators `auth: 9099`, `firestore: 8080`, `ui.enabled: false`.
- [ ] **TDD:** `firestore.rules.test.ts`를 루트에 둔다. 맨 위에 `// @vitest-environment node`를 적고, `describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)`로 감싼다. 그러면 `pnpm test`와 commit hook에서는 skip되고, `emulators:exec` 아래에서만 실행된다. 확인할 경우는 세 가지다. 본인 uid 경로 읽기/쓰기는 허용, 다른 uid는 거부, 비로그인은 거부.
- [ ] `.env.e2e`: `VITE_FIREBASE_API_KEY=demo-key`, `VITE_FIREBASE_AUTH_DOMAIN=localhost`, `VITE_FIREBASE_PROJECT_ID=demo-sheet-quiz`, `VITE_FIREBASE_EMULATOR=1`, `VITE_GOOGLE_CLIENT_ID=e2e-client`. 이 파일은 `.env.local`보다 우선 적용된다.
- [ ] `playwright.config.ts`: webServer를 `pnpm exec vite --mode e2e --port 5174`로, baseURL을 5174로 바꾼다. 포트를 따로 두는 이유는 사용자가 띄워 둔 dev 서버(emulator 설정 없음)가 `reuseExistingServer`로 재사용되는 것을 막기 위해서다.
- [ ] `package.json`: `"e2e": "firebase emulators:exec --only auth,firestore --project demo-sheet-quiz \"vitest run firestore.rules.test.ts && playwright test\""`.
- [ ] `.env.example`에 Firebase 변수 3개를 추가한다.
- [ ] `scripts/setup-firebase.sh <gcpProjectId> [location=asia-northeast3]`: 운영 Firebase 설정 중 firebase CLI로 할 수 있는 부분을 한 번에 실행한다. 다시 실행해도 안전하게 만든다(이미 있으면 건너뜀). 모든 명령에 `--project`를 명시하고 `.firebaserc`는 만들지 않는다. e2e는 `demo-` 프로젝트를 쓰므로 섞이지 않는다.
  1. `firebase projects:addfirebase <id>`: 기존 GCP 프로젝트에 Firebase를 추가한다.
  2. `firebase firestore:databases:create "(default)" --location <location>`: Firestore를 production mode로 만든다.
  3. `firebase apps:list WEB`에 앱이 없으면 `firebase apps:create WEB sheet-quiz`로 만든다.
  4. `firebase apps:sdkconfig WEB <appId>`에서 `apiKey`, `authDomain`, `projectId`를 꺼내 `.env.local`에 `VITE_FIREBASE_*`로 쓴다. 이미 있는 키는 덮어쓰지 않고 차이만 출력한다.
  5. Google 로그인 사용 설정: 설치된 firebase-tools 버전이 `firebase.json`의 `auth.providers.googleSignIn` + `firebase deploy --only auth`를 지원하는지 구현 시 확인한다. 지원하면 자동화하고, 지원하지 않으면 수동 작업으로 남긴다.
  6. `firebase deploy --only firestore:rules`.
  7. 마지막에 남은 수동 작업 목록을 출력한다.
  - 스크립트는 실제 프로젝트를 건드리므로 테스트 대상이 아니다. 대신 `bash -n` 문법 검사와 README 절차로 대신한다. 실행은 사용자가 승인한 뒤에 한다.

**검증:** `pnpm test`(rules 테스트는 skip), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm e2e`(rules 테스트 3개 통과 + 기존 e2e 전부 통과).

### Task 2: 새로고침 후 로그인 유지 + "드라이브 다시 연결"

이 Task까지 머지해도 데이터는 아직 IndexedDB에 있다. 그래도 단독으로 배포할 수 있다.

**Files:** `src/auth/firebaseSignIn.ts`(신규), `src/auth/AuthContext.tsx`, `src/auth/googleIdentity.ts`, `src/types/google.d.ts`, `src/components/DriveReconnectNotice.tsx`(신규), `src/pages/DriveBrowsePage.tsx`, `TopFolderSelectPage.tsx`, `SheetTabSelectPage.tsx`, `SheetValidationPage.tsx`, `KeywordsPage.tsx`, `src/pages/StartPage.tsx`, `src/test/setup.ts`, 관련 테스트

- [ ] `firebaseSignIn.ts`: `signInWithGoogle(clientId): Promise<{ googleUserId; email; token: TokenResponse }>` 하나만 둔다.
  - 운영: `GoogleAuthProvider`에 `drive.readonly`와 `spreadsheets.readonly`를 `addScope`하고 `signInWithPopup`을 호출한다. `GoogleAuthProvider.credentialFromResult(result)?.accessToken`을 token으로 쓴다. 팝업 응답에는 만료 시각이 없으므로 `expiresAt = Date.now() + 3600_000`으로 잡는다(Google 기본값). `googleUserId`는 `providerData`의 google.com uid에서 가져온다. accessToken이 없으면 `GoogleAuthError("unknown")`를 던진다.
  - `VITE_FIREBASE_EMULATOR`: 위 "E2E 로그인 방식"의 GIS → userinfo → `signInWithCredential` 경로를 쓴다.
  - 팝업 오류 코드(`auth/popup-blocked`, `auth/popup-closed-by-user`)는 기존 `GoogleAuthError` 코드(`popup_blocked`, `popup_closed`)로 바꿔서 `AUTH_ERROR_MESSAGES`를 그대로 쓴다.
- [ ] `googleIdentity.ts`: `requestAccessToken(loginHint?: string)`. `initTokenClient` config에 `login_hint`를 넣고 `tokenClient.requestAccessToken({ prompt: "" })`를 호출한다. `google.d.ts` 타입도 고친다.
- [ ] `AuthContext.tsx`:
  - 처음 상태는 `"connecting"`(세션 복원 중)이다. `useEffect`에서 `onAuthStateChanged(auth, …)`를 구독하고 cleanup 때 unsubscribe한다. 사용자가 있으면 `googleUserId`와 `email`을 정하고, 상태는 `tokenRef.current`가 유효하면 `"connected"`, 아니면 `"expired"`로 한다. 사용자가 없으면 `"signed_out"`으로 한다.
  - `connect()`: `auth.currentUser`가 있으면 GIS `requestAccessToken(email)`을 호출한다(계정 선택 없이 한 번 클릭). 없으면 `signInWithGoogle(clientId)`를 호출한다. 기존 generation 경합 처리와 오류 처리는 그대로 둔다. 외부 API(`status`, `connect`, `disconnect`, `markExpired`, `getAccessToken`, `googleUserId`, `email`, `error`)는 바꾸지 않는다.
  - `disconnect()`: 기존 정리 + `void signOut(auth)`.
  - `markExpired()`/`getAccessToken()`: 지금 동작을 유지한다. token만 버리고 신원은 남긴다.
- [ ] `DriveReconnectNotice.tsx`: 안내 문구와 `Button` "드라이브 다시 연결"(`connect()` 호출)만 있다. 연결 중이면 `isDisabled`. 5개 Drive 페이지에서 "Google 연결이 필요합니다…" 문구를 쓰던 분기를 이 컴포넌트로 바꾼다. `googleUserId`가 없으면(=`signed_out`) 지금 문구를 그대로 둔다. 다시 연결되면 `status`가 바뀌고, `status`는 이미 `useLatestRequest` 키에 들어 있으므로 다시 읽기가 자동으로 일어난다.
- [ ] `StartPage.tsx`: 문구 "서버 없이 브라우저에서만 동작…", "계정 정보는 브라우저에만 저장됩니다"를 고친다. 새 문구: "풀이 기록은 내 Google 계정에 연결된 Firebase에 저장되어 다른 기기에서 이어 풀 수 있습니다. 시트는 읽기 권한만 요청합니다." 이 문구를 확인하는 테스트가 있으면 함께 고친다.
- [ ] `src/test/setup.ts`에 전역 mock을 넣는다.
  - `vi.mock("../firebase", () => ({ auth: { currentUser: null, authStateReady: async () => {} }, firestore: {} }))`
  - `vi.mock("firebase/auth", …)`: `onAuthStateChanged`는 unsubscribe만 반환, `signOut`은 resolve.
  - `vi.mock("../auth/firebaseSignIn", …)`: 테스트용 구현이 실제 `createGoogleIdentityClient(clientId).requestAccessToken()`과 `fetchGoogleUserInfo`를 호출하게 만든다. 그러면 지금 페이지 테스트가 쓰는 `vi.spyOn(googleIdentity…)`/`userInfo` spy와 `renderWithConnectedAuth`가 그대로 동작한다.
- [ ] **TDD (AuthContext.test.tsx):**
  - 세션 복원: `onAuthStateChanged`가 사용자와 함께 호출되면 `expired` 상태가 되고 email이 표시된다.
  - 복원 후 `connect()`: GIS가 `login_hint=email`로 호출되고 `connected`가 된다. `signInWithGoogle`은 호출되지 않는다.
  - 처음 `connect()`: `signInWithGoogle`이 한 번 호출되고 `connected`가 된다.
  - `disconnect()`: `signOut`이 호출되고 `signed_out`이 된다.
  - 기존 테스트 4~5개가 통과한다.
- [ ] **TDD (firebaseSignIn.test.ts):** `firebase/auth`를 mock한다. 팝업 결과에서 accessToken과 google.com uid를 꺼내는지, 오류 코드가 올바르게 바뀌는지 확인한다.
- [ ] **TDD (페이지):** `DriveBrowsePage`에서 `expired` 상태일 때 "드라이브 다시 연결" 버튼이 보이고, 클릭하면 폴더 목록을 불러오는지 확인한다.
- [ ] **e2e (`e2e/session-persist.spec.ts`):** 로그인 → 최상위 폴더 선택 → `page.reload()` → `/history`가 다시 연결하지 않아도 열림 → `/folders`에 "드라이브 다시 연결"이 보임 → 클릭 → "AWS"가 보임.

**검증:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, `pnpm e2e`.

### Task 3: repo를 Firestore로 교체 (시그니처 유지)

> Task 3과 Task 4는 **같은 배포**에 포함해야 한다. Task 3만 배포하면 기존 기기의 로컬 기록이 화면에서 사라진 것처럼 보인다.

**Files:** `src/storage/attemptRepo.ts`, `src/storage/topFolderRepo.ts`, `src/storage/attemptRepo.test.ts`, `src/storage/topFolderRepo.test.ts`, `src/storage/repoErrors.test.ts`, `src/test/fakeRepos.ts`(신규), `src/test/setup.ts`, `src/pages/{SubmitConfirmPage,ResumeSelectPage,ResultsPage,SheetValidationPage}.test.tsx`, `e2e/support/googleApiMock.ts`, `e2e/*.spec.ts`, `docs/ai-question-generation-prompt.md`

- [ ] 두 repo에 공통 private helper를 둔다: `async function userRef() { await auth.authStateReady(); const uid = auth.currentUser?.uid; if (!uid) throw new Error("로그인이 필요합니다."); return doc(firestore, "users", uid); }`. 새로고침 직후 QuizPage가 `getAttempt`를 호출해도 세션 복원을 기다린 뒤 읽게 된다.
- [ ] `attemptRepo.ts`:
  - `saveAttempt`: 크기 검사 → 기존 문서 읽기(`getDocFromCache`가 실패하면 `getDoc`) → 위 두 보호 조건 → `void setDoc(ref, attempt).catch(...)`. 서버 응답을 기다리지 않는 이유는 `shortcut:` 주석으로 남긴다.
  - `getAttempt`: `getDoc` 결과의 `data()`, 문서가 없으면 `undefined`.
  - `listAttemptsByUser(googleUserId)`: `getDocs(query(collection(..., "attempts"), where("googleUserId", "==", googleUserId)))`. 단일 필드 조건이라 복합 색인이 필요 없다.
  - `deleteAttempt`: `deleteDoc`.
- [ ] `topFolderRepo.ts`: `users/{uid}/topFolder/{googleUserId}`에 `setDoc`/`getDoc`/`deleteDoc`. `TopFolderSelection` 타입은 그대로 둔다. `db.ts`가 이 타입을 import하고 있으므로 export를 유지한다.
- [ ] `src/test/fakeRepos.ts`: in-memory `Map`으로 두 repo의 export를 똑같이 구현한다. `saveAttempt`의 보호 로직은 실제 repo의 순수 판단 함수 하나(`shouldWriteAttempt(existing, incoming, options)`, attemptRepo에서 export)를 같이 써서 동작이 갈라지지 않게 한다. `resetFakeRepos()`도 둔다. `setup.ts`에서 `vi.mock("../storage/attemptRepo")`와 `vi.mock("../storage/topFolderRepo")`를 fake로 연결하고, `afterEach(resetFakeRepos)`를 등록한다.
- [ ] `getDb()`로 데이터를 직접 넣던 페이지 테스트 4개는 fake `saveAttempt`로 데이터를 넣도록 바꾼다.
- [ ] **TDD (attemptRepo.test.ts / topFolderRepo.test.ts):** 전역 mock을 `vi.unmock`/`vi.importActual`로 풀고 `firebase/firestore`를 mock한다. 확인할 것:
  - `shouldWriteAttempt` 표 테스트: 제출된 문서를 덮어쓰지 않음, `allowSubmittedOverwrite`, 새 문서가 제출본이면 허용, 기존 `updatedAt`이 더 새로워도 씀(시계 차이), 기존 문서 없음.
  - 900 KB를 넘으면 오류를 던지고 `setDoc`을 호출하지 않음.
  - 비로그인이면 오류.
  - 경로가 `users/{uid}/attempts/{id}`인지.
  - `repoErrors.test.ts`는 `getDb` 대신 Firestore 함수를 reject시키도록 바꾼다.
- [ ] `SheetValidationPage`가 저장 실패를 어떻게 보여 주는지 확인한다. 크기 초과 메시지가 사용자에게 보여야 한다. 일반 문구로 덮이면 `err.message`를 표시하도록 한 줄 고친다. 테스트도 한 건 추가한다.
- [ ] `docs/ai-question-generation-prompt.md`를 크기 한도에 맞게 고친다.
  - [내용 요구사항]에 글자 수 상한을 추가한다: 문제 본문 300자, 보기 각 100자, 해설 300자, 보기별 해설 각 80자, 핵심 키워드와 관련 주제를 합쳐 100자. 상한을 넘기지 말고 핵심만 쓰라고 지시한다.
  - 사용법과 참고에 "한 탭에 150문항까지만 넣는다. 더 만들 때는 새 탭을 만들어 `{시작_번호}`를 1부터 다시 시작한다"를 추가한다. 이 제한은 기록을 Firestore 문서 하나(1 MiB 한도)에 저장하기 때문이라고 이유를 한 줄 적는다.
  - `{문제_개수}` 안내에 "한 번 실행할 때 150 이하"를 덧붙인다.
- [ ] e2e: `mockGoogleApis(page, sub?)`가 기본값으로 `mock-user-${crypto.randomUUID()}`를 쓰고 sub를 반환하게 한다. userinfo mock도 그 sub를 반환한다. 기존 spec은 그대로 둔다. `quiz-flow.spec.ts`의 IndexedDB 관련 주석을 고친다.

**검증:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, `pnpm e2e`. 기존 quiz/results/history 흐름이 emulator Firestore 위에서 통과해야 한다.

### Task 4: 기존 IndexedDB 기록 1회 마이그레이션

**Files:** `src/storage/migrateLocalData.ts`(신규, + test), `src/auth/AuthContext.tsx`

- [ ] `migrateLocalData(googleUserId)`:
  - localStorage 키 `sheet-quiz-migrated-${googleUserId}`가 있으면 바로 반환한다. 로컬 데이터는 기기마다 따로 있으므로 표시도 기기별로 한다.
  - 없으면 `getDb()`에서 해당 사용자의 attempts와 topFolder를 읽는다. 각 attempt를 `await saveAttempt(a)`로 올린다. 기존 보호 로직 덕분에 원격 문서가 더 새롭거나 이미 제출됐으면 자동으로 건너뛴다. topFolder는 `getTopFolder`가 비어 있을 때만 `saveTopFolder`한다. 끝나면 표시를 남긴다.
  - 도중에 실패하면 표시를 남기지 않는다. 다음 로그인 때 다시 시도한다.
  - 로컬 idb 데이터는 지우지 않는다. 안전을 위해서다. 정리는 나중에 결정한다.
- [ ] `AuthContext.connect()`의 **첫 로그인 경로**(`signInWithGoogle` 뒤)에서 `await migrateLocalData(googleUserId)`를 호출한 다음 `connected`로 바꾼다. 마이그레이션 실패는 로그인을 막지 않는다(catch 후 진행). 새로고침으로 세션이 복원되는 경로에서는 호출하지 않는다. 업그레이드 전에 쓰던 기기에는 Firebase 세션이 없으므로 반드시 첫 로그인 경로를 지나간다.
- [ ] **TDD:** fake-indexeddb에 데이터를 넣는다(`db.clear`로 격리). 확인할 것: 업로드됨, 원격이 더 새로운 경우 건너뜀, 다른 사용자 데이터는 무시, 두 번째 호출은 아무것도 안 함, 실패하면 표시가 남지 않음. AuthContext 테스트에 "첫 로그인 시 migrate 호출, 세션 복원 시 미호출"을 추가한다.
- [ ] e2e(선택, 간단하면): `addInitScript`로 idb에 기록을 미리 넣은 뒤 로그인하면 `/history`에 보이는지 확인한다. 어려우면 단위 테스트로 대신한다.

**검증:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, `pnpm e2e`.

### Task 5: 기기 간 이어 풀기 e2e + 문구 + README

**Files:** `e2e/cross-device.spec.ts`(신규), `src/pages/SettingsPage.tsx`(문구), `README.md`

- [ ] **e2e:** context A에서 로그인(sub S) → 시험 시작 → 1번 답하고 다음 → "저장됨". `browser.newContext()`로 만든 B에서 같은 S로 로그인 → `/history`에 해당 기록이 보임 → 열면 이어 풀기 → "문제 2 / 2".
- [ ] SettingsPage "전체 데이터 삭제" 안내에 "모든 기기에서 풀이 기록이 삭제됩니다"를 넣는다. 지금 문구가 "이 브라우저" 기준이면 바꾼다. 로직은 그대로 둔다(list + delete가 Firestore에서도 동작한다).
- [ ] README: Firebase 설정 절차(아래 "Firebase 운영 설정": 스크립트 실행 + 수동 작업), 환경변수, `pnpm e2e` 사전 요구사항(Java, firebase-tools), "한 번에 한 기기에서 풀기".

**검증:** 전체 검증 명령 5개.

### Task 6: 번들과 PWA 확인

**Files:** `vite.config.ts`(필요할 때만)

- [ ] `pnpm build` 출력에서 chunk 크기를 확인한다. `firebase/auth`와 `firebase/firestore`(persistent cache 포함)는 gzip 기준 대략 +150~200 KB로 예상한다.
- [ ] Lazy-load는 하지 않는다. 앱이 시작하자마자 AuthProvider가 세션을 복원해야 해서 나중에 불러올 수 있는 구간이 없다. 이득이 작다.
- [ ] Workbox는 기본적으로 2 MiB를 넘는 파일을 precache하지 않는다. 그러면 오프라인 PWA가 깨진다. 빌드 경고가 나오면 `workbox.maximumFileSizeToCacheInBytes`를 올리는 한 줄만 추가한다.
- [ ] `firestore.googleapis.com`은 runtimeCaching에 넣지 않는다. 오프라인은 SDK 캐시가 맡는다. `vite.config.ts` 주석을 그 내용으로 고친다.

**검증:** `pnpm build`(경고 없음), `pnpm preview`로 로그인 → 새로고침 → 세션 유지를 수동으로 확인.

---

## Firebase 운영 설정

**자동화 (`scripts/setup-firebase.sh`, Task 1):** 기존 GCP 프로젝트에 Firebase 추가, Firestore DB 생성(production mode, `asia-northeast3`), 웹 앱 등록, SDK config를 `.env.local`에 기록, rules 배포. Google 로그인 사용 설정도 CLI가 지원하면 여기에 포함한다.

`VITE_GOOGLE_CLIENT_ID`가 속한 **기존** GCP 프로젝트를 대상으로 한다. 그래야 OAuth 동의 화면이 하나로 유지된다.

**사용자 수동 작업 (firebase CLI로 할 수 없음):**

1. `pnpm exec firebase login` (브라우저 인증, 처음 한 번만).
2. 스크립트 실행 승인: `scripts/setup-firebase.sh <gcpProjectId>`.
3. (스크립트가 자동화하지 못한 경우만) Firebase 콘솔 → Authentication → Sign-in method → Google 사용 설정.
4. Firebase 콘솔 → Authentication → Settings → Authorized domains에 Vercel 도메인을 추가한다. `localhost`와 `<project>.firebaseapp.com`은 기본으로 들어 있다.
5. Google Cloud 콘솔 → OAuth 동의 화면: `drive.readonly`와 `spreadsheets.readonly` 범위가 등록돼 있는지 확인한다. Testing 모드면 본인을 테스트 사용자로 추가한다.
6. Google Cloud 콘솔 → 사용자 인증 정보: `VITE_GOOGLE_CLIENT_ID`의 Authorized JavaScript origins에 배포 도메인이 있는지 확인한다.
7. Vercel 프로젝트 환경변수에 `.env.local`의 `VITE_FIREBASE_*` 3개를 넣는다(Vercel 대시보드 또는 `vercel env add`).

## 위험 요소

- **두 기기에서 동시에 편집:** 문서 전체 LWW라 늦게 저장한 쪽이 다른 기기의 진행을 덮어쓴다. 문서화로만 대응한다.
- **기기 간 제출 보호의 한계:** 보호 로직이 캐시를 먼저 읽어서, 다른 기기에서 제출한 사실을 아직 받지 못한 기기가 제출 전 상태로 덮어쓸 수 있다. 같은 기기 안에서는 지금과 똑같이 보호된다.
- **ack를 기다리지 않음:** "저장됨"이 서버 반영을 보장하지 않는다. rules 거부 같은 서버 오류는 콘솔 로그에만 남는다. 크기 초과는 미리 검사해서 화면에 보인다.
- **팝업 문제:** iOS 홈 화면 PWA(standalone)에서는 `signInWithPopup`이 막히거나 이상하게 동작할 수 있다. 실제 기기에서 확인해야 한다. 막히면 `signInWithRedirect`가 대안이지만 서드파티 저장소 분할 문제가 있어서 이번 범위에서는 제외한다.
- **팝업 token 만료 시각:** 응답에 만료 정보가 없어 1시간으로 가정한다. 실제로 더 일찍 만료되면 401 → `markExpired` → 다시 연결 버튼으로 이어져서 지금 흐름이 처리한다.
- **로그아웃해도 로컬 캐시가 남음:** Firestore 오프라인 캐시는 rules 적용 대상이 아니다. 공용 기기라면 다른 사람이 볼 수 있다. 개인용 앱이라 받아들이고, 정리 기능(`terminate` + `clearIndexedDbPersistence`)은 범위 밖이다.
- **프롬프트 기준(150문항, 글자 수 상한)을 넘긴 탭:** 1 MiB 한도 때문에 저장할 수 없을 수 있다. 시험을 시작할 때 보호 장치가 안내하고, 사용자는 탭을 나눠야 한다. 직접 작성했거나 기존에 만든 시트도 마찬가지다.
- **e2e 환경 의존성:** Java와 firebase-tools가 없으면 `pnpm e2e`가 실패한다. 8080/9099 포트가 사용 중이어도 실패한다.
- **무료 한도:** autosave는 변경마다 쓰기 1회(debounce 600ms)다. 개인 사용이라 Spark 무료 한도(일 20k 쓰기)는 충분하다고 예상한다.
- **운영 경로는 e2e로 확인하지 않음:** `signInWithPopup` 실제 경로는 e2e가 아니라 단위 테스트(mock)로만 확인한다. 배포 후 수동 확인이 필요하다.

## 구현 첫 단계에서 확인할 가정

- `persistentLocalCache`와 setup 파일의 `vi.mock`이 jsdom과 함께 잘 동작하는지.
- firebase-tools가 요구하는 JDK 버전(21로 가정).
- Auth Emulator가 `GoogleAuthProvider.credential`의 JSON id_token을 받아 주는지.

## 검증

각 Task마다 `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, 그리고 `pnpm e2e`(Emulator 포함, Java 필요)를 직접 실행한다. 모두 통과해야 PASS다.
