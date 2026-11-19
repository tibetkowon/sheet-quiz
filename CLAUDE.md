# 풀이장 (sheet-quiz)

개인용 자격증 학습 웹앱.

- React 19
- Vite
- TypeScript strict
- React Router
- Firebase Auth + Firestore (로그인 유지, 풀이 기록 기기 간 동기화)
- IndexedDB (기존 기록 마이그레이션 전용)
- Astryx (`@astryxdesign/core`, UI 컴포넌트·디자인 토큰)
- Tailwind 3 (레이아웃 보조만)
- Google Drive / Google Sheets 연동
- Drive OAuth access token은 메모리에만 보관
- 자체 백엔드 서버 없음
- Firestore 외 외부 DB 없음
- 런타임 AI 호출 없음

## 주요 문서

- Architecture spec:
  `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`
- Phase plans:
  `docs/superpowers/plans/YYYY-MM-DD-phaseN-*.md`

Architecture spec이 아키텍처에 대한 최종 기준이다.

각 Phase는 구현 전에 plan을 작성한다.

## 검증 명령

명령을 추가하거나 변경해야 할 경우 이 블록을 수정한다.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm e2e
```

위 검증이 모두 성공해야 작업을 `PASS`로 처리한다.

`git commit`은 `.claude/settings.json`의 hook이 `test`, `typecheck`, `lint`, `build` 통과를 요구한다.
`e2e`는 느려서 hook에서 제외했으므로 `PASS` 처리 전에 직접 실행한다.

## 작업 방식 (ECC)

작업 종류에 맞는 orch 명령으로 시작한다.

- 새 기능 / Phase: `/ecc:orch-add-feature`
- 버그: `/ecc:orch-fix-defect`
- 동작 변경: `/ecc:orch-change-feature`
- 리팩터링: `/ecc:orch-refine-code`

규칙:

- Plan 단계에서 Architecture spec 원문 경로를 넘긴다. Plan은 `docs/superpowers/plans/`에 저장한다.
- Gate 1(plan 승인), Gate 2(커밋 확인)에서 반드시 멈춘다.
- 서브에이전트에 작업을 넘길 때 아래 특이사항도 함께 전달한다.
- 리뷰는 `/ecc:orch-review`로 한다.
- PASS 전 `pnpm e2e`를 직접 실행한다 (hook은 e2e를 검사하지 않음).
- 모델은 ECC 에이전트 기본값을 쓴다 (planner: opus, 코딩·리뷰: sonnet). `model`을 따로 넘기지 않는다.

## 알려진 프로젝트 특이사항

### ESLint

`eslint-plugin-react-hooks@4.6.2`는 ESLint 9 환경에서 다음 주석을 사용할 경우 crash가 발생한다.

`eslint-disable-next-line react-hooks/exhaustive-deps`

따라서 이 rule을 suppress하지 않는다.

dependency array를 실제로 exhaustive하게 수정한다.

### Firebase Emulator

`pnpm e2e`는 Firebase Emulator(auth, firestore)를 띄운다. `firebase-tools`와 JDK 21 이상이 필요하다.

### IndexedDB 테스트 격리

`src/storage/db.ts`의 `getDb()`는 connection Promise를 module scope에서 cache한다.

따라서 첫 DB connection 이후:

`indexedDB.deleteDatabase("sheet-quiz")`

를 `beforeEach`에서 호출하는 방식은 올바른 테스트 격리를 제공하지 않는다.

대신 다음 패턴을 사용한다.

```ts
const db = await getDb();
await db.clear("<storeName>");
```

### Astryx

- Tailwind 3과 Astryx의 Tailwind 브릿지(v4 전용)는 함께 쓸 수 없다. Tailwind는 레이아웃에만 쓰고 색은 `var(--color-...)` 토큰으로 쓴다.
- Astryx 토큰을 덮어쓸 때는 `:root, [data-astryx-theme]`에 지정한다. `:root`만 쓰면 `<Theme>`이 감싼 요소에서 무시된다.
- Tailwind의 `@tailwind base`는 지우지 않는다(`preflight`는 설정에서 끈다). 지우면 `ring`/`shadow` 유틸리티가 그려지지 않는다.
- `Button`의 `isDisabled`는 네이티브 `disabled`가 아니라 `aria-disabled`다. 테스트는 `toBeDisabled()` 대신 `aria-disabled`를 확인한다.
- Astryx는 `Spinner` 등을 쓰면 보이지 않는 `role="alert"` 영역을 하나 만든다. 오류 배너 테스트는 `getByRole("alert")` 대신 메시지 텍스트가 알림 영역 안에 있는지(`closest('[role="alert"]')`)로 확인한다.
- 접힌 `Collapsible`/체크박스 목록은 jsdom에서 보이는지(`toBeVisible`)를 알 수 없다. `aria-expanded` 등 상태로 확인한다.

