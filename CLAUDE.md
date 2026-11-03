# 풀이장 (sheet-quiz)

개인용 자격증 학습 웹앱.

- React
- Vite
- TypeScript strict
- React Router
- IndexedDB
- Tailwind
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

아래 블록은 `codex-auto.sh`가 직접 읽는 설정이다.

명령을 추가하거나 변경해야 할 경우 이 블록을 수정한다.

<!-- CODEX_AUTO_VERIFY_BEGIN -->
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm e2e
<!-- CODEX_AUTO_VERIFY_END -->

위 검증이 모두 성공해야 작업을 `PASS`로 처리한다.

Claude는 `codex-auto`가 이미 위 검증을 성공적으로 수행했다면 동일한 명령을 다시 실행하지 않는다.

## Roadmap

1. Project init, GIS auth, Drive folder browsing — **완료**
2. Subfolder traversal, Sheet listing, parsing, validation — **완료**
3. Quiz-taking UI, single/multiple answers, question status, IndexedDB autosave, resume — **완료**
4. Final submission, grading, results, per-option explanations, wrong-answer management — **완료**
5. Markdown/JSON export, settings/data deletion, error handling, mobile/accessibility — **완료**
6. Test hardening, independent review, README/docs, production build verification — **완료**

## 현재 상태

2026-09-07 기준:

- Phase 1–6 구현 완료
- Phase 1–6 리뷰 완료 (Phase 6는 저장소 전체 대상 독립 리뷰 — 9건의 major
  발견, 전부 수정. 5건의 minor는 기록만 하고 의도적으로 미수정 — 상세는
  `docs/superpowers/plans/2026-09-06-phase6-test-hardening-review-docs-build.md`
  참고)
- 관련 변경사항 commit 완료
- unit test 269개 통과
- `tsc --noEmit` 통과
- ESLint 통과
  - 기존 Fast Refresh warning 3개만 존재
- `pnpm build` 통과, `pnpm preview`로 프로덕션 번들 수동 구동 검증 완료
  (favicon 404는 이후 `public/favicon.svg` 추가로 수정 완료)
- Playwright E2E 전체 통과
- `README.md` 작성 완료(설치/개발/배포 절차)
- local `main`은 `origin/main`보다 앞서 있음 — 아직 remote push 하지 않음

세부 구현 이력은 각 Phase plan을 확인한다.

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
