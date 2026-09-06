# Phase 6: 테스트 보강·독립 리뷰·문서화·프로덕션 빌드 검증 Implementation Plan

> **For agentic workers:** This plan follows the Claude-Codex 협업 프로세스 정의
> (CLAUDE.md "개발 워크플로: Claude Code + Codex" 섹션, spec §14) — 즉, 코드 변경이
> 필요한 작업(Task 1, 2)은 전역 `codex-auto` 스킬 한 번의 호출로 위임한다.
> `codex-auto`가 patch 생성·적용·검증(`pnpm test`/`typecheck`/`lint`/`build`/`e2e`)·
> 독립 리뷰·리뷰 수정까지 내부적으로 반복 수행하고 Claude에는 압축된 최종
> 결과(PASS/NEEDS_DECISION/FAIL, critical/major/minor 개수, 요약)만 반환한다.
> Claude Code는 `codex-auto`가 `PASS`를 반환하면 diff 재검토, 동일 테스트 재실행,
> `/codex:review` 재실행을 하지 않는다. `NEEDS_DECISION`/`FAIL`일 때만 직접
> 조사한다. 문서 작업(Task 3)과 빌드 산출물 수동 점검(Task 4)은 CLAUDE.md가
> Claude에게 직접 허용한 영역(문서, 검증 명령 실행)이므로 Claude가 직접
> 수행한다.

**Goal:** 로드맵 6단계를 마무리한다 — 테스트 커버리지 보강, 전체 코드베이스에
대한 Codex의 독립적인 리뷰와 critical/major 수정, README 작성, `pnpm build`
산출물이 실제로 정적 호스팅 환경에서 동작하는지 수동 검증 (spec §15 항목 6).

**Architecture:** 코드 변경이 필요한 두 작업(테스트 보강, 전체 리뷰+수정)은
각각 하나의 `codex-auto` 호출로 위임하고, Claude는 완료 조건만 정의한다.
README는 스펙 §13(배포)과 §16(사용자 확정 사항)의 내용을 반영해 Claude가 직접
작성한다. 프로덕션 빌드 검증은 `pnpm build` 후 `pnpm preview`로 실제 정적
번들을 구동해 dev 서버(`pnpm dev`, 기존 E2E가 사용하는 서버)에서는 드러나지
않는 문제(자산 경로, 환경변수 인라이닝, 콘솔 에러)를 Claude가 직접 확인한다.

**Tech Stack:** React 18, TypeScript strict, Vite, Vitest + Testing Library,
Playwright, `idb`, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`
(§11 디자인 시스템, §12 테스트 전략, §13 배포, §14 협업 프로세스, §15 로드맵,
§16 사용자 확정 사항)

## Global Constraints

- No backend, no external DB, no AI calls — 모든 로직은 클라이언트에서 실행된다
  (spec §2).
- OAuth access token은 메모리에만 보관하며 IndexedDB나 다른 저장소에 절대
  기록하지 않는다 (spec §9) — Task 2 리뷰와 Task 4 빌드 검증 모두 이 불변식이
  production 번들에서도 깨지지 않는지 확인해야 한다.
- 다크모드는 Tailwind `darkMode: 'class'`, 기존 토큰(`bg`, `surface`, `sunken`,
  `border`, `text`, `accent`, `status.*`, `danger`)만 사용한다 (spec §11) — 새
  테스트나 리뷰 수정이 새 색상을 도입하지 않는지 확인한다.
- `eslint-plugin-react-hooks@4.6.2`가 ESLint 9에서
  `eslint-disable-next-line react-hooks/exhaustive-deps` 주석에 crash하므로,
  이 규칙을 절대 suppress하지 않는다 — dependency array를 실제로 exhaustive하게
  고친다.
- Playwright 버튼 매처는 동일 접두 텍스트를 가진 버튼이 여러 개일 때
  `{ name: "...", exact: true }`를 사용한다 (반복적으로 발생했던 버그).
- GitHub Pages 서브경로 배포는 코드 변경(빌드 설정 등) 없이 README 안내로만
  다룬다 — 사용자와 이미 합의된 범위 축소 (spec §11 "새로 디자인을 받지
  않기로 사용자와 합의됨"과 동일한 원칙으로, §13의 "README에 별도 안내만"
  문구를 그대로 따른다).
- `VITE_GOOGLE_CLIENT_ID` 외의 새 환경변수를 필요성이 명확해지기 전까지
  만들지 않는다 (spec §13).

---

### Task 1: 테스트 커버리지 감사 및 보강 (`codex-auto`)

**대상:** `src/` 전체 — 특히 순수 함수가 많은 `src/quiz/grading.ts`,
`src/quiz/export.ts`, `src/sheets/*`(파싱/검증), `src/storage/*Repo.ts`,
그리고 조건부 렌더링이 있는 컴포넌트(`src/pages/*`, `src/components/*`).

**요구사항 (codex-auto에 전달할 작업 지시):**

- 현재 테스트 스위트(`src/**/*.test.ts(x)`, 34개 파일, 196개 테스트,
  전부 통과 중)를 읽고, 각 순수 함수/컴포넌트에서 아직 커버되지 않은
  분기·에지 케이스를 찾는다: 예) 빈 입력, 중복 ID, 잘못된 형식의 시트 데이터,
  IndexedDB 조회 실패, 복수 정답 채점의 부분 정답 처리, 내보내기 시 특수문자
  이스케이프, 네비게이터 상태 전이의 경계 조건.
- 찾은 gap마다 실패하는 테스트를 먼저 추가하고, 테스트가 실제 버그를
  드러내면 최소한의 수정으로 고친다. 버그가 없는 정상 동작을 확인하는
  테스트라면 구현은 변경하지 않는다.
- 새 테스트는 기존 테스트 파일의 스타일(Vitest + Testing Library,
  `describe`/`it`, 기존 fixture/helper 재사용)을 따른다.
- 기존 196개 테스트를 절대 삭제하거나 약화(assertion 제거 등)하지 않는다.

**완료 조건:**

- `pnpm test` — 기존 테스트 전부 통과 + 테스트 개수가 196개보다 늘어남.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm e2e` 모두 통과.
- 버그를 발견해 수정한 경우, 그 사실과 파일/증상을 요약에 포함.

- [ ] **Step 1:** 아래 지시로 `codex-auto` 스킬을 호출한다.

```
Phase 6 Task 1 — 테스트 커버리지 보강.

src/ 전체(특히 src/quiz/grading.ts, src/quiz/export.ts, src/sheets/*,
src/storage/*Repo.ts, src/pages/*, src/components/*)에서 현재 테스트
스위트(34개 파일, 196개 테스트, 전부 통과)가 커버하지 않는 분기와 에지
케이스를 찾아 유닛/컴포넌트 테스트를 추가하라. 실패하는 테스트를 먼저
작성하고, 테스트가 실제 버그를 드러낼 때만 최소한으로 구현을 수정하라.
정상 동작을 확인하는 테스트라면 구현을 바꾸지 마라. 기존 196개 테스트는
절대 삭제·약화하지 마라. 새 테스트는 기존 파일의 스타일과 fixture를
재사용하라.

완료 조건: pnpm test/typecheck/lint/build/e2e 전부 통과, 테스트 개수가
196개보다 증가. 버그를 고쳤다면 요약에 파일과 증상을 포함하라.
```

- [x] **Step 2:** `codex-auto` 결과가 `PASS`. 15개 파일에 걸쳐 커버되지 않은
  분기/에지 케이스 테스트를 추가(구현 변경 없음). `b73bc58`로 커밋 완료.

---

### Task 2: 전체 코드베이스 독립 리뷰 및 critical/major 수정 (`codex-auto`)

CLAUDE.md "Phase 완료 리뷰" 섹션에 정의된 리뷰다. 지금까지의 Phase별 리뷰는
각 Phase의 diff만 대상으로 했으므로, Phase 6에서는 **저장소 전체**를 대상으로
한 번 더 독립적인 리뷰를 수행한다.

**요구사항 (codex-auto에 전달할 작업 지시):**

- `git diff`가 아니라 `src/` 전체와 `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`를 대조하며 리뷰한다.
- 확인 항목: correctness, regression, spec 대비 architecture 위반, security
  (특히 OAuth 토큰이 메모리 밖으로 새는 경로가 있는지), data integrity
  (IndexedDB 스키마/마이그레이션), edge case, 누락된 테스트, accessibility
  regression.
- critical 또는 major 발견 시 Codex가 직접 수정 patch를 만든다. minor는
  기록만 하고 수정하지 않는다(범위 제한).

**완료 조건:**

- `pnpm test`/`typecheck`/`lint`/`build`/`e2e` 전부 통과.
- critical/major 이슈가 있었다면 전부 해결된 상태로 `PASS`.
- 최종 요약에 critical/major/minor 개수와 미해결 의사결정(있다면)을 포함.

- [ ] **Step 1:** 아래 지시로 `codex-auto` 스킬을 호출한다.

```
Phase 6 Task 2 — 전체 코드베이스 독립 리뷰.

이번에는 git diff가 아니라 src/ 전체를 대상으로,
docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md의
아키텍처와 대조하며 독립적인 리뷰를 수행하라. 확인 항목: correctness,
regression, spec 대비 architecture 위반, security(특히 OAuth access
token이 IndexedDB나 다른 영속 저장소로 새는 경로가 있는지), data
integrity(IndexedDB 스키마 일관성), edge case, 누락된 테스트,
accessibility regression. critical 또는 major 발견 시 직접 수정하라.
minor는 기록만 하고 수정하지 마라.

완료 조건: pnpm test/typecheck/lint/build/e2e 전부 통과, critical/major
이슈가 모두 해결된 상태로 PASS. 최종 요약에 critical/major/minor 개수와
미해결 의사결정을 포함하라.
```

- [ ] **Step 2:** `codex-auto` 결과가 `PASS`이면 다음 태스크로 진행한다.
  `NEEDS_DECISION`이면 미해결 의사결정을 사용자에게 그대로 전달하고 지시를
  받는다. `FAIL`이면 Claude가 직접 조사한다.

**진행 상태 (2026-09-06):** 3차례 시도 — ① 결과 없이 중단, ② 유효한 리뷰
결과(9건의 실질적 버그 — 자동저장 경쟁 상태, 제출 기록 덮어쓰기, stale
요청 경쟁, OAuth 재연결 경쟁, 비동기 실패 무한로딩, fingerprint에 상황 누락,
프로토타입 오염 속성 허용, 모바일 버튼 줄바꿈, 저장된 인덱스 범위 초과 —
및 5건의 minor를 찾아냄)를 만들었으나 `src/sheets/fingerprint.ts`,
`src/pages/SubmitConfirmPage.tsx` 두 파일에서 patch apply 실패로 전체 패치가
반영되지 못함, ③ Codex 사용량 한도(quota) 초과로 실행 자체가 실패. **다음
세션에서 quota 회복 후 재시도 필요 — 미해결.** 발견된 이슈 목록은
`~/.claude/codex-runs/sheet-quiz/20260906-184253-57204/implement-result.txt`에
보존되어 있으므로, 재시도 시 처음부터 다시 찾게 하는 대신 이 목록을 프롬프트에
포함해 patch만 다시 생성시키는 편이 효율적이다.

---

### Task 3: README.md 작성 (Claude 직접 작성 — 문서이므로 위임하지 않음)

**Files:**
- Modify: `README.md` (현재 `# sheet-quiz` 한 줄뿐)

**포함할 내용:**

1. 프로젝트 소개 — 개인용 자격증 학습 웹앱, React/Vite/TS strict/Tailwind,
   백엔드 없음·외부 DB 없음·런타임 AI 호출 없음 (CLAUDE.md 상단 요약과 동일).
2. 사전 준비 — Google Cloud Console에서 OAuth 2.0 클라이언트 ID(웹 애플리케이션)
   발급, 승인된 자바스크립트 원본에 로컬/배포 도메인 등록.
3. 설치 및 환경변수 — `pnpm install`, `.env.example`을 `.env.local`로 복사 후
   `VITE_GOOGLE_CLIENT_ID` 채우기.
4. 개발 명령 — `pnpm dev`, `pnpm test`/`pnpm test:watch`, `pnpm typecheck`,
   `pnpm lint`, `pnpm build`, `pnpm preview`, `pnpm e2e` (각 명령의 역할 한 줄
   설명 — `pnpm e2e`는 `pnpm dev` 서버를 자동 기동해 실행됨을 명시).
5. 배포 — Vercel을 1차 대상으로 한 절차(레포 import, 환경변수
   `VITE_GOOGLE_CLIENT_ID` 등록, 빌드 명령 `pnpm build`/출력 `dist`), 대안으로
   Cloudflare Pages·GitHub Pages(서브경로 배포 시 `vite.config.ts`의 `base`
   옵션 필요, SPA라서 404 fallback으로 `index.html` 사용)·일반 정적 서버 안내
   (spec §13, §89 반영).
6. 데이터와 프라이버시 — OAuth 토큰은 메모리에만 보관되며 새로고침 시
   재로그인 필요, 진행 상황과 히스토리는 브라우저 IndexedDB에만 저장되고
   서버로 전송되지 않는다는 점을 명시 (spec §9).
7. 알려진 제약 — GitHub Pages 서브경로/오프라인 등은 별도 코드 대응 없이
   문서 안내 수준이라는 점 (spec §11/§13 범위 합의 반영).

- [x] **Step 1:** 위 항목대로 `README.md`를 작성했다.
- [x] **Step 2:** `pnpm typecheck` 통과 확인.
- [x] **Step 3:** `fe8b63e`로 커밋 완료.

---

### Task 4: 프로덕션 빌드 수동 검증 (Claude 직접 수행)

기존 `pnpm e2e`는 `pnpm dev`(Vite dev 서버)만 구동하므로(`playwright.config.ts`
`webServer.command: "pnpm dev"`), 실제 `pnpm build`가 만든 정적 번들이
동작하는지는 지금까지 한 번도 검증되지 않았다. Vite dev 서버는 트랜스파일/HMR
경로가 달라 프로덕션 번들에서만 나타나는 문제(자산 경로, 환경변수 인라이닝,
minify로 인한 런타임 에러)를 가릴 수 있다.

**Steps:**

- [ ] **Step 1:** 클린 빌드 실행.

```bash
rm -rf dist
pnpm build
```

Expected: `tsc -b`와 `vite build` 모두 에러 없이 종료, `dist/`에
`index.html`과 해시된 JS/CSS 자산이 생성됨.

- [x] **Step 2:** 프로덕션 번들을 정적 서버로 구동.

```bash
pnpm preview --port 4173
```

- [x] **Step 3:** 브라우저로 `http://localhost:4173` 접속해(Playwright MCP)
  다음을 점검했다.
  - 시작 화면이 정상 렌더링됨(헤더, 기록/설정 nav, 다크모드 토글, "Google
    Drive 연결" 버튼 모두 접근성 스냅샷에 정상 노출).
  - 모든 정적 자산(`index-*.js`, `index-*.css`, 외부 폰트 CSS/woff2)이 200
    으로 로드됨. 경로 문제로 인한 404 없음.
  - `dist/assets/*.js`를 `AIza…`/`sk-…`/PEM 헤더 패턴으로 grep — 하드코딩된
    비밀값 없음(`.env.local`이 없는 상태로 빌드해 `VITE_GOOGLE_CLIENT_ID`는
    빈 문자열로 인라인됨 — 실제 클라이언트 ID를 넣고 재검증이 필요하면 배포
    전에 한 번 더 확인할 것).
  - 콘솔 에러 1건 발견: `favicon.ico` 요청이 404. 기능에는 영향 없는 minor.
- [x] **Step 4:** `favicon.ico` 404는 minor로 기록만 하고 수정하지 않음
  (index.html에 `<link rel="icon">`이 없어 브라우저 기본 요청이 실패하는
  것으로, 별도 asset 추가가 필요 — 코드 변경이므로 Codex 몫. Codex 사용량
  한도로 이번 세션에서는 위임하지 않음. 그 외 base 경로/환경변수 인라이닝
  문제는 발견되지 않음).
- [x] **Step 5:** `pnpm preview` 프로세스와 Playwright 브라우저를 종료함.
  코드 변경이 없었으므로 커밋 없음.

---

## Phase 6 완료 조건 요약

- Task 1, 2가 각각 `codex-auto`로부터 `PASS`를 받음 (또는 `NEEDS_DECISION`이
  사용자와 함께 해소됨).
- `README.md`가 설치/개발/배포 절차를 포함해 커밋됨.
- 프로덕션 빌드(`dist/`)가 `vite preview`로 정상 구동되는 것을 직접 확인함.
- 로드맵의 "현재 상태" 섹션과 6단계 항목을 완료로 갱신.
