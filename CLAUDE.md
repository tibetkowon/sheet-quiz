# 풀이장 (sheet-quiz)

개인용 자격증 학습 웹앱.

- React 19
- Vite
- TypeScript strict
- React Router
- IndexedDB
- Astryx (`@astryxdesign/core`, UI 컴포넌트·디자인 토큰)
- Tailwind 3 (레이아웃 보조만)
- Google Drive / Google Sheets 연동
- OAuth token은 메모리에만 보관
- 백엔드 없음
- 외부 DB 없음
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

`git commit`은 `.claude/hooks/verify-before-commit.sh`가 `test`, `typecheck`, `lint`, `build` 통과를 요구한다.
`e2e`는 느려서 hook에서 제외했으므로 `PASS` 처리 전에 직접 실행한다.

## 작업 방식 (ECC)

### 시작

작업 종류에 맞는 orch 명령으로 시작한다.

- 새 기능 / Phase: `/ecc:orch-add-feature`
- 버그: `/ecc:orch-fix-defect`
- 동작 변경: `/ecc:orch-change-feature`
- 리팩터링: `/ecc:orch-refine-code`
- 이전 세션 이어가기: `/ecc:resume-session`

### 단계별 도구

| 단계 | 사용 | 조건 |
|---|---|---|
| Plan | orch의 `planner` | Architecture spec 원문 경로를 넘긴다. Plan은 `docs/superpowers/plans/`에 저장 |
| Plan (large 등급) | `ecc:dev-team` | Phase처럼 큰 작업만. Gate 1 전에 PM·아키텍트·개발·QA 관점 점검 |
| 결정이 필요할 때 | `ecc:council` | 아키텍처 선택처럼 찬반이 갈릴 때만 |
| 구현 | orch의 `tdd-guide` | 빌드·타입 오류는 `/ecc:build-fix`(`react-build-resolver`) |
| 리뷰 | `/ecc:orch-review` | 언어 리뷰어는 `typescript-reviewer`, `react-reviewer` |
| 보안 리뷰 | `security-reviewer` | OAuth·토큰, Drive/Sheets API 호출, IndexedDB 저장을 건드릴 때 |
| 접근성 리뷰 | `a11y-architect` | 화면(`src/pages`, `src/components`)을 바꿀 때 |
| 검증 | `ecc:verification-loop` | PASS 전. 끝에 `pnpm e2e`를 직접 실행 (`e2e-runner`로 실패 분석) |
| 커밋 (Gate 2) | `commit-reviewer` | 메시지를 저장소 이력 형식(한국어, `type: 요약`)에 맞춘다 |
| PR | `/ecc:prp-pr` | |
| 마무리 | `/ecc:checkpoint`, `/ecc:save-session` | Phase나 큰 작업이 끝날 때 |
| 학습 | `/ecc:learn-eval` | 작업 후 반복될 만한 교훈이 생겼을 때. 반복 실수는 `/ecc:hookify` 규칙으로 만든다 |
| 문서 | `/ecc:update-codemaps`, `/ecc:update-docs` | Phase가 끝날 때 |

### 규칙

- Gate 1(plan 승인), Gate 2(커밋 확인)에서 반드시 멈춘다.
- 서브에이전트에 작업을 넘길 때 아래 특이사항도 함께 전달한다.
- 모델은 ECC 에이전트 기본값을 쓴다 (planner: opus, 코딩·리뷰: sonnet). `model`을 따로 넘기지 않는다.
- `santa-method`, `gan-build`, `loop-start` 같은 자동 반복 루프는 쓰지 않는다. Gate에서 멈추는 방식과 맞지 않는다.

### ECC 설정

- `.claude/rules/`에 ECC rules(common, typescript, react, web)가 있다. 이 문서와 충돌하면 이 문서를 따른다.
  - zod 등 새 의존성은 rules가 권해도 추가하지 않는다.
  - 커버리지 80% 기준은 참고만 한다. 검증 명령은 위 블록이 기준이다.
- `.claude/settings.json`에서 `ECC_HOOK_PROFILE=strict`를 쓴다.
- `.claude/hookify.*.local.md`가 아래 특이사항 일부를 자동으로 차단·경고한다. 특이사항을 추가하면 hookify 규칙도 함께 검토한다.

## 알려진 프로젝트 특이사항

### ESLint

`eslint-plugin-react-hooks@4.6.2`는 ESLint 9 환경에서 다음 주석을 사용할 경우 crash가 발생한다.

`eslint-disable-next-line react-hooks/exhaustive-deps`

따라서 이 rule을 suppress하지 않는다.

dependency array를 실제로 exhaustive하게 수정한다.

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

