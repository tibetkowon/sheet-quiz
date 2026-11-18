# Astryx 디자인 시스템 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직접 만든 Tailwind 토큰/마크업 UI를 Astryx(Meta 오픈소스 React 디자인 시스템) 컴포넌트로 전부 교체해, 디자인 감각 없이도 일관된 기본 틀을 확보한다.

**Architecture:** Astryx는 미리 빌드된 CSS를 `@layer`로 제공한다. 앱 루트를 `<Theme>`(neutral 테마)과 `<LinkProvider>`(React Router `Link`)로 감싸고, 앱 셸 → 공용 컴포넌트 → 화면 순서로 바꾼다. Tailwind 3.4는 레이아웃 보조용으로만 남기고, 색/타이포/버튼 같은 시각 요소는 Astryx가 맡는다.

**Tech Stack:** React 19.3, `@astryxdesign/core` 0.7.16, `@astryxdesign/theme-neutral` 0.7.16, `@stylexjs/stylex` 0.19.x, Vite 5, Tailwind 3.4(보조), React Router, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md` (§11 디자인 시스템과 31행 기술 스택 문구는 Task 9에서 이 전환에 맞게 고친다)

**현재 브랜치 상태:** `tibetkowon/astryx-trial`에 React 19, Astryx 3개 패키지, `@types/react(-dom)` 19 설치와 `pnpm-workspace.yaml`의 `allowBuilds` 설정이 커밋 없이 들어 있다. `pnpm typecheck`/`test`/`build`는 통과, `lint`는 경고 3개(오류 0).

## Global Constraints

- Astryx 패키지는 베타(0.x)이므로 `package.json`에 caret 없이 `0.7.16`으로 고정한다.
- Astryx import는 하위 경로로 한다. 예: `@astryxdesign/core/Button`, `@astryxdesign/core/theme`, `@astryxdesign/core/Link`. 테마는 `@astryxdesign/theme-neutral/built`에서 `neutralTheme`을 가져온다.
- 컴포넌트 props는 추측하지 않는다. 쓰기 전에 `pnpm exec astryx component <이름>`으로 확인한다. `astryx init`은 실행하지 않는다(CLAUDE.md를 수정하기 때문).
- Astryx의 Tailwind 브릿지(`tailwind-theme.css`)는 Tailwind v4 전용이라 이 프로젝트(3.4)에서는 쓰지 않는다. Astryx 토큰이 필요한 Tailwind 클래스는 `bg-[var(--color-background-surface)]` 형태의 임의 값으로만 쓴다.
- `react-hooks/exhaustive-deps` 규칙은 suppress하지 않는다(ESLint 9와 crash). dependency array를 실제로 맞춘다.
- IndexedDB 테스트는 `const db = await getDb(); await db.clear("<store>")`로 격리한다. `deleteDatabase`를 쓰지 않는다.
- AppShell이 `<main>`과 skip link를 이미 렌더링한다. 어떤 페이지도 `<main>`을 직접 렌더링하지 않는다.
- 상태 5종(문제 네비게이터)은 색만으로 구분하지 않는다. 색+아이콘+테두리 3중 코딩을 유지한다(스펙 §11).
- OAuth 토큰은 메모리에만 두고, 런타임 AI 호출과 백엔드는 추가하지 않는다. 이 전환은 UI 레이어만 바꾼다.
- 한 Task 안에서 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`가 모두 통과한 뒤에만 커밋한다(`git commit` hook이 요구). 테스트는 의미(역할·이름·동작)가 바뀌지 않는 한 고치지 않고, DOM이 달라져 쿼리만 깨질 때만 쿼리를 고친다.
- 각 Task는 커밋 전에 사용자 확인을 거친다. `pnpm dev`를 띄우고 해당 화면을 Orca 내장 브라우저 탭(`orca-cli` 스킬의 `references/browser.md` 참고)에 열어 사용자가 직접 보게 한 뒤 멈춰서 피드백을 받는다. 피드백을 반영하고 사용자가 OK 한 다음에만 커밋하고 다음 Task로 넘어간다. 사용자 확인 전에 에이전트가 먼저 화면 폭 390px·1280px, 라이트·다크, 총 4장을 캡처해 눈으로 점검한다.
- 퀴즈·결과처럼 Google 로그인과 시트 데이터가 필요한 화면은 내장 브라우저에서 로그인이 되는지 먼저 확인하고, 안 되면 `e2e/support/mockGoogleApis`의 목 데이터로 띄운다.

## Review Focus

스펙과 테스트가 다루지 않지만 실제 사용에서 문제가 되기 쉬운 것을 가능성이 높은 순서로 적는다. 각 항목의 검증은 해당 코드를 소유한 Task의 단계에 넣었다.

1. **다크 모드 첫 화면:** `localStorage`에 `dark`가 저장된 상태로 새로고침해도 라이트가 번쩍이지 않고 처음부터 다크여야 한다. (Task 1)
2. **모바일 가로 넘침:** 390px 폭에서 가로 스크롤이 생기면 안 된다. 기존 `e2e/mobile-overflow.spec.ts`가 계속 통과해야 한다. (Task 2, 9)
3. **긴 한글 이름:** 폴더/시트/탭 이름이 매우 길어도 카드가 폭을 넘지 않고 말줄임 되어야 한다. (Task 5)
4. **퀴즈 선택 상태 유지:** 객관식 선택, 복수 선택 토글, 보류 표시가 Astryx 입력 컴포넌트로 바뀐 뒤에도 문제 이동·새로고침 복원 후 그대로여야 한다. (Task 7)
5. **오프라인(PWA):** 빌드 후 Astryx CSS가 서비스 워커 precache에 포함되어, 오프라인에서도 스타일이 깨지지 않아야 한다. (Task 9)

## File Structure

| 파일 | 역할 |
|---|---|
| `src/index.css` | Astryx CSS 레이어 순서·import, 폰트(Pretendard) 토큰 덮어쓰기, 포커스 링/reduced-motion 유지 |
| `tailwind.config.js` | `corePlugins.preflight: false`. 최종 Task에서 쓰지 않는 색 토큰 삭제 |
| `src/main.tsx` 또는 `src/App.tsx` | `<Theme mode>` + `<LinkProvider>` 적용 지점 |
| `src/app/AppShell.tsx` | Astryx `AppShell` + `TopNav`로 교체 |
| `src/test/renderWithConnectedAuth.tsx` | 테스트 렌더 래퍼에 `<Theme>`/`<LinkProvider>` 추가 |
| `src/components/*` | 공용 컴포넌트를 Astryx로 교체 (`QuestionNavigatorGrid`는 3중 코딩 때문에 자체 마크업 유지) |
| `src/pages/*` | 화면별 교체 (Task 3~8) |

---

### Task 1: 기반 — 테마·스타일 레이어·Provider

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`(현재 변경 포함), `src/index.css`, `tailwind.config.js`, `src/App.tsx`, `src/test/renderWithConnectedAuth.tsx`
- Create: `src/app/AstryxProviders.tsx`, `src/app/AstryxProviders.test.tsx`

**Interfaces:**
- Produces: `AstryxProviders({ children }: { children: ReactNode }): JSX.Element` — 내부에서 `useTheme()`(기존 훅)의 `theme`을 `<Theme mode={theme}>`에 전달하고 `<LinkProvider component={Link}>`(react-router-dom의 `Link`)로 감싼다. 이후 모든 Task와 테스트 래퍼가 이것을 쓴다.

- [ ] **Step 1: 현재 변경 커밋 + 버전 고정.** `package.json`의 세 Astryx 패키지와 `@stylexjs/stylex`에서 caret을 제거하고, `@astryxdesign/cli@0.7.16`을 devDependency로 추가한다(`pnpm add -D -E @astryxdesign/cli@0.7.16`). 이후 `pnpm install`이 통과하는지 확인하고, 변경 전체를 `chore: React 19 + Astryx 설치`로 커밋한다.

- [ ] **Step 2: 실패하는 테스트를 쓴다** (`src/app/AstryxProviders.test.tsx`).
  - `localStorage["sheet-quiz-theme"] = "dark"` 상태에서 `<AstryxProviders>`를 렌더하면 문서에 다크 모드가 적용된다(`<Theme>`이 붙이는 모드 속성 또는 기존 `html.dark` 클래스 중 `<Theme>`이 실제로 사용하는 쪽을 확인해 단언한다).
  - 저장값이 없으면 라이트다.
  - `<AstryxProviders>` 안의 `<Link>`가 `MemoryRouter` 안에서 `href`를 갖는 앵커로 렌더된다.
  
  Run: `pnpm vitest run src/app/AstryxProviders.test.tsx` — Expected: FAIL (모듈 없음)

- [ ] **Step 3: `AstryxProviders`를 구현한다.** `useTheme()`의 `theme` 값을 `<Theme mode>`에 넘긴다. 테마 기본값은 `'system'`이지만 이 앱은 사용자가 고른 값을 따르므로 항상 명시한다.

- [ ] **Step 4: `src/index.css`를 바꾼다.** 맨 위에 `@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;`를 두고, 그 아래에 `@import '@astryxdesign/core/reset.css'; @import '@astryxdesign/core/astryx.css'; @import '@astryxdesign/theme-neutral/theme.css';`를 추가한다(순서가 바뀌면 캐스케이드가 뒤집힌다). `tailwind.config.js`에 `corePlugins: { preflight: false }`를 넣는다. `@tailwind base`는 지우지 않는다(ring/shadow 유틸리티가 쓰는 `--tw-*` 기본값도 이 지시문이 내보내므로, 지우면 링이 그려지지 않는다). Tailwind 3의 preflight는 레이어 밖에 있어 Astryx reset/버튼 스타일을 덮어쓰기 때문이다. `@tailwind components; @tailwind utilities;`는 남긴다.

- [ ] **Step 5: 한글 폰트.** neutral 테마의 기본 폰트(Figtree)는 한글이 없다. `pnpm exec astryx docs tokens`로 본문/제목 폰트 토큰 이름을 확인하고, `src/index.css`에서 그 토큰을 `Pretendard`(본문)·`Paperlogy`(제목, 기존 `@font-face` 재사용)로 덮어쓴다. 기존 `index.html`의 Pretendard 링크는 그대로 둔다.

- [ ] **Step 6: `src/App.tsx`의 `<AuthProvider>` 바로 안쪽을 `<AstryxProviders>`로 감싸되 `BrowserRouter` 안쪽에 둔다**(`LinkProvider`가 `Link`를 쓰므로 Router 컨텍스트 필요). `src/test/renderWithConnectedAuth.tsx`에도 같은 방식으로 추가한다.

- [ ] **Step 7: 검증.** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` 모두 통과. Step 2의 테스트가 PASS. `pnpm dev`로 띄워 시작 화면이 깨지지 않고 한글 폰트가 적용됐는지, `dark`를 저장한 뒤 새로고침했을 때 라이트가 번쩍이지 않는지 눈으로 확인한다(Review Focus 1). 번쩍이면 `index.html`에서 React 마운트 전에 모드를 정하는 방법을 이 Task에서 해결한다.

- [ ] **Step 8: Commit**
```bash
git add -A
git commit -m "feat: Astryx 테마·Provider·스타일 레이어 기반 추가"
```

---

### Task 2: 앱 셸 (AppShell + TopNav)

**Files:**
- Modify: `src/app/AppShell.tsx`, `src/components/PageContainer.tsx`
- Test: `src/app/AppShell.test.tsx` (신규), `src/App.test.tsx`(필요 시)

**Interfaces:**
- Consumes: `AstryxProviders` (Task 1), 기존 `useTheme(): { theme: "light" | "dark"; toggleTheme: () => void }`
- Produces: `AppShell({ children })` — 시그니처 불변. `PageContainer` props(`children`, `className?`, `maxWidth?`)도 불변이라 아직 안 바꾼 화면이 그대로 동작한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `AppShell`을 `MemoryRouter`+`AstryxProviders` 안에서 렌더하고 다음을 단언한다. 역할 `navigation`에 "자격증", "기록", "설정" 링크가 각각 `/folders`, `/history`, `/settings`를 가리킨다. "다크 모드" 버튼을 누르면 버튼 이름이 "라이트 모드"로 바뀐다. 문서에 `main` 랜드마크가 정확히 하나다. 홈 링크(풀이장)가 `/`를 가리킨다.
  Run: `pnpm vitest run src/app/AppShell.test.tsx` — Expected: FAIL (기존 마크업과 다른 부분이 있으면)

- [ ] **Step 2: 구현.** `AppShell`을 Astryx `AppShell`(`height="auto"`, `contentPadding={0}`)과 `TopNav`로 교체한다. 로고(풀 + 풀이장), 링크 3개, 테마 토글을 `TopNav` 슬롯에 둔다. `TopNav`에는 접근 가능한 이름(`label`)을 준다. 모바일 햄버거 동작은 Astryx 기본값을 따른다. `PageContainer`는 Tailwind 색 클래스를 쓰지 않으므로 폭/패딩만 점검한다.

- [ ] **Step 3: 검증.** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. `pnpm e2e -- mobile-overflow`로 390px 가로 넘침이 없는지 확인한다(Review Focus 2). 390px·1280px × 라이트·다크 캡처를 확인한다.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat: AppShell을 Astryx AppShell/TopNav로 교체"
```

---

### Task 3: 공용 컴포넌트

**Files:**
- Modify: `src/components/Breadcrumb.tsx`, `ErrorBanner.tsx`, `ProgressBar.tsx`, `AutosaveIndicator.tsx`, `src/app/ErrorBoundary.tsx`, `src/components/QuestionNavigatorGrid.tsx`(색 토큰만)
- Test: 같은 이름의 기존 `*.test.tsx`

**Interfaces:**
- Produces: 각 컴포넌트의 export 이름과 props는 불변이다(이후 화면 Task가 그대로 사용). 내부만 Astryx `Breadcrumbs`, `Banner`, `ProgressBar`, `Badge`/`Text`로 교체한다. `BreadcrumbItem` 타입도 유지한다.

- [ ] **Step 1: 기존 테스트를 먼저 돌려 기준선을 확인한다.** `pnpm vitest run src/components src/app/ErrorBoundary.test.tsx` — Expected: PASS

- [ ] **Step 2: 컴포넌트별로 Astryx 문서를 읽고 교체한다.** `ErrorBanner`는 오류 의미가 `role="alert"`로 유지되는지, `ProgressBar`는 `aria-valuenow` 등 진행 값이 유지되는지, `AutosaveIndicator`는 상태 텍스트(저장 중/저장됨/오류)가 그대로 노출되는지 테스트가 확인하게 한다. Astryx 컴포넌트가 해당 속성을 자동으로 주지 않으면 테스트를 약화하지 말고 컴포넌트에 직접 넘긴다.

- [ ] **Step 3: `QuestionNavigatorGrid`는 자체 마크업을 유지한다.** 상태 5종의 색+아이콘+테두리 3중 코딩이 스펙 요구이기 때문이다. Tailwind 커스텀 색 클래스(`bg-accent` 등)만 `var(--color-…)` 임의 값으로 바꾼다(토큰 이름은 `pnpm exec astryx docs tokens`로 확인). 기존 테스트가 통과해야 한다.

- [ ] **Step 4: 검증 + Commit**
```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
git add -A
git commit -m "feat: 공용 컴포넌트를 Astryx로 교체"
```

---

### Task 4: 단순 화면 — 시작, 설정, 기록, 이어풀기 선택

**Files:**
- Modify: `src/pages/StartPage.tsx`, `SettingsPage.tsx`, `HistoryPage.tsx`, `ResumeSelectPage.tsx`
- Test: `SettingsPage.test.tsx`, `HistoryPage.test.tsx`, `ResumeSelectPage.test.tsx`(기존). `StartPage`는 전용 테스트가 없으므로 `src/App.test.tsx`가 시작 화면의 주요 요소를 확인하는지 보고, 없으면 `src/pages/StartPage.test.tsx`를 추가한다(로그인 버튼 노출·클릭 시 `useAuth`의 로그인 호출).

**Interfaces:**
- Consumes: Task 3의 공용 컴포넌트, `PageContainer`
- 각 페이지의 default export와 라우트는 불변이다.

- [ ] **Step 1: 기존 테스트 기준선** — `pnpm vitest run src/pages/SettingsPage.test.tsx src/pages/HistoryPage.test.tsx src/pages/ResumeSelectPage.test.tsx` PASS 확인.
- [ ] **Step 2: 화면별 교체.** 매핑 원칙: 제목 `Heading`, 본문 `Text`, 버튼 `Button`, 묶음 `Card`, 목록 `List`/`Item`(또는 `Table`), 빈 상태 `EmptyState`, 위험 동작(데이터 삭제) 확인은 `AlertDialog`, 불러오기 상태 `Spinner`/`Skeleton`. 설정 화면의 "모든 데이터 삭제"는 기존 확인 흐름(문구·취소/확인 순서)을 바꾸지 않는다.
- [ ] **Step 3: 검증.** 위 테스트 + 전체 검증 통과, 화면 4장 캡처 확인(시작 화면은 가장 먼저 보이는 곳이므로 특히 신경 쓴다).
- [ ] **Step 4: Commit** — `feat: 시작·설정·기록·이어풀기 화면을 Astryx로 교체`

---

### Task 5: 폴더·시트 선택 흐름

**Files:**
- Modify: `src/pages/TopFolderSelectPage.tsx`, `DriveBrowsePage.tsx`, `SheetTabSelectPage.tsx`
- Test: `TopFolderSelectPage.test.tsx`, `DriveBrowsePage.test.tsx`, `SheetTabSelectPage.test.tsx`, `latestRequest.test.tsx`

**Interfaces:**
- Consumes: Task 3의 `Breadcrumb`, `ErrorBanner`. 라우트·페이지 export는 불변. 이 화면들의 로딩 경합 방지(`useLatestRequest`)는 건드리지 않는다.

- [ ] **Step 1: 기존 테스트 기준선 PASS 확인.**
- [ ] **Step 2: 실패하는 테스트를 추가한다**(Review Focus 3). `DriveBrowsePage.test.tsx`에 공백 없이 80자 이상인 한글 폴더 이름을 렌더하는 케이스를 넣고, 그 이름이 DOM에 그대로 존재하면서(접근성 이름 유지) 말줄임 처리용 속성/클래스가 걸린 요소 안에 있는지 단언한다. 정확한 단언은 선택한 Astryx 컴포넌트(`Text maxLines` 등)가 만드는 속성에 맞춘다.
- [ ] **Step 3: 교체.** 폴더/시트/탭 목록 항목은 클릭 가능한 항목이므로 `ClickableCard` 또는 `Item`을 쓰고, 링크 이동은 `LinkProvider` 덕분에 `href`만 주면 React Router로 처리된다. 항목 안의 긴 이름은 `Text`의 `maxLines`로 말줄임 한다.
- [ ] **Step 4: 검증.** 테스트 + 전체 검증 통과. 390px에서 긴 이름 목록을 실제로 확인한다. `pnpm e2e -- drive-connect sheet-select` 통과.
- [ ] **Step 5: Commit** — `feat: 폴더·시트 선택 화면을 Astryx로 교체`

---

### Task 6: 시트 검증·키워드

**Files:**
- Modify: `src/pages/SheetValidationPage.tsx`, `KeywordsPage.tsx`
- Test: `SheetValidationPage.test.tsx`, `KeywordsPage.test.tsx`

**Interfaces:**
- Consumes: Task 3 공용 컴포넌트. 키워드 화면의 분류별 탭/그룹 동작(최근 추가된 기능, `src/sheets`의 `KeywordGroup`)은 그대로 유지하고, 탭은 `TabList`로 바꾼다.

- [ ] **Step 1: 기존 테스트 기준선 PASS 확인.**
- [ ] **Step 2: 교체.** 검증 이슈 목록은 `Table` 또는 `List`, 오류/경고 구분은 `Badge`(아이콘 포함, 색만으로 구분하지 않음), "검증 이슈 Markdown 복사" 동작은 기존 버튼 문구 유지.
- [ ] **Step 3: 검증 + 캡처 확인.**
- [ ] **Step 4: Commit** — `feat: 시트 검증·키워드 화면을 Astryx로 교체`

---

### Task 7: 퀴즈 풀이·제출 확인

**Files:**
- Modify: `src/pages/QuizPage.tsx`, `SubmitConfirmPage.tsx`
- Test: `QuizPage.test.tsx`, `SubmitConfirmPage.test.tsx`, `e2e/quiz-flow.spec.ts`

**Interfaces:**
- Consumes: `useQuiz()`(기존 컨텍스트), `selectSingleAnswer`, `toggleMultipleAnswer`, `markHeld`(`src/quiz`), `QuestionNavigatorGrid`, `AutosaveIndicator`, `ProgressBar`. 이 Task는 표현만 바꾸고 이 함수들의 시그니처는 바꾸지 않는다.

- [ ] **Step 1: 기존 테스트 + `pnpm e2e -- quiz-flow` 기준선 PASS 확인.**
- [ ] **Step 2: 실패하는 테스트를 추가한다**(Review Focus 4). `QuizPage.test.tsx`에서 (a) 단일 선택 후 다음/이전 문제로 갔다가 돌아오면 선택이 유지된다, (b) 복수 선택 두 개를 고른 뒤 하나를 해제하면 나머지 하나만 남는다, (c) 보류를 표시한 문제가 네비게이터에서 보류 상태로 보이고 이동 후에도 유지된다. 이미 같은 내용의 테스트가 있으면 새로 쓰지 않고 그 테스트가 새 컴포넌트에서 그대로 통과하는지만 확인한다.
- [ ] **Step 3: 교체.** 선택지는 단일 `RadioList`(또는 `SelectableCard`), 복수는 `CheckboxList`. 제어 컴포넌트로 만들어 값은 `useQuiz()` 상태에서만 온다(컴포넌트 내부 상태로 복제하지 않는다). 문제 이동/보류/제출 버튼은 `Button`, 제출 확인의 위험 확인은 `AlertDialog` 또는 기존 별도 페이지 흐름을 유지한다(라우트 `/quiz/:attemptId/submit`는 그대로).
- [ ] **Step 4: 검증.** 테스트, 전체 검증, `pnpm e2e -- quiz-flow`, 캡처 확인(390px에서 네비게이터 접기가 겹치지 않는지 포함; 과거 `fix: prevent navigator overlap on mobile` 이슈 재발 방지).
- [ ] **Step 5: Commit** — `feat: 퀴즈 풀이·제출 확인 화면을 Astryx로 교체`

---

### Task 8: 결과 화면

**Files:**
- Modify: `src/pages/ResultsPage.tsx`
- Test: `ResultsPage.test.tsx`, `e2e/results-flow.spec.ts`

**Interfaces:**
- Consumes: `gradeAttempt`, `buildResultMarkdown`, `buildResultJson`, `downloadTextFile`(`src/quiz`), `CategoryStat`/`DifficultyStat`(`src/types`). 내보내기 파일 내용과 파일명은 바꾸지 않는다.

- [ ] **Step 1: 기존 테스트 + `pnpm e2e -- results-flow` 기준선 PASS 확인.**
- [ ] **Step 2: 교체.** 점수 요약은 `Card` + `Heading`, 분류·난이도 통계는 `Table`, 필터는 `SegmentedControl`/`Selector`, 정답/오답 표시는 `Badge`(아이콘 + 텍스트, 색만으로 구분하지 않음), 내보내기 버튼 2개는 `Button`. 통계 시각화가 필요해 보이면 `dataviz` 스킬을 먼저 읽는다(새 차트는 이 Task의 범위가 아니라 필요한 경우에만).
- [ ] **Step 3: 검증 + 캡처 확인.**
- [ ] **Step 4: Commit** — `feat: 결과 화면을 Astryx로 교체`

---

### Task 9: 정리·문서·최종 검증

**Files:**
- Modify: `tailwind.config.js`, `index.html`, `vite.config.ts`(PWA `theme_color`/`background_color`), `src/index.css`, `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`(31행, §11), `CLAUDE.md`, `README.md`(스택 언급이 있으면)

- [ ] **Step 1: 남은 커스텀 Tailwind 색 사용처를 찾아 모두 제거한다.** `grep -rnE "(bg|text|border)-(bg|surface|sunken|accent|status|danger)|dark:" src --include='*.tsx'`에 남는 것이 없어야 한다(Task 3의 `QuestionNavigatorGrid`는 `var(--…)`로 이미 바뀌었다). 없어지면 `tailwind.config.js`의 `colors` 확장과 `darkMode`를 삭제한다. Tailwind를 레이아웃 유틸로 계속 쓰는 곳이 없다면 Tailwind 의존성 삭제는 이 plan 범위 밖이므로 하지 않고 후속 항목으로 남긴다.
- [ ] **Step 2: PWA·브라우저 색.** Astryx neutral의 라이트/다크 배경색을 확인해 `index.html`의 `theme-color` 두 개와 `vite.config.ts`의 `theme_color`/`background_color`를 맞춘다.
- [ ] **Step 3: 문서 갱신.** 스펙 31행의 "React 18, Tailwind" 문구와 §11을 "React 19, Astryx(neutral 테마), Tailwind는 보조 레이아웃용"으로 고치고 이 plan을 참조로 건다. 프로젝트 `CLAUDE.md`의 스택 목록에도 Astryx를 추가한다. 원문 spec의 확정 항목(다크 모드 지원, 차분하고 신뢰감 있는 집중형 톤, 3중 코딩)은 그대로 둔다.
- [ ] **Step 4: 전체 검증.** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm e2e` 전부 통과. 결과를 실제 출력으로 확인한 뒤에만 PASS로 처리한다.
- [ ] **Step 5: 오프라인 확인**(Review Focus 5). `pnpm build && pnpm preview`로 띄운 뒤 한 번 접속하고 네트워크를 끊고 새로고침해 스타일이 유지되는지 확인한다. 깨지면 `vite.config.ts`의 workbox precache 대상에 Astryx CSS가 포함되는지 확인한다.
- [ ] **Step 6: 마지막 캡처 확인.** 12개 화면 × (390px, 1280px) × (라이트, 다크) 중 대표 화면을 훑어 어색한 곳을 목록으로 만든다.
- [ ] **Step 7: Commit** — `chore: Astryx 전환 정리 및 문서 갱신`

---

## Self-Review 메모

- **스펙 커버:** 다크 모드(Task 1·2), 3중 코딩(Task 3), 모바일(Task 2·7·9), PWA(Task 9), 라우트 12개 전부(Task 4~8에 배분: 시작·설정·기록·이어풀기 4, 폴더 흐름 3, 검증·키워드 2, 퀴즈·제출 2, 결과 1).
- **알려진 미확정:** Astryx `Theme`이 다크 모드를 DOM에 어떻게 반영하는지(속성 vs 클래스)와 폰트 토큰 이름은 Task 1에서 문서로 확인해 확정한다. 각 컴포넌트의 정확한 props는 Task별로 `astryx component`로 확인한다.
- **이 plan이 하지 않는 것:** 기능 추가·정보 구조 변경·Tailwind 완전 제거·새 차트.
