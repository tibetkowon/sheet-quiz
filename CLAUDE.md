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

## 개발 워크플로: Claude Code + Codex

Claude Code는 감독자 역할만 한다.

Codex가 담당하는 것:

- 애플리케이션 코드 구현
- 버그 수정
- 리팩터링
- 테스트 코드 작성
- 코드 리뷰
- 리뷰 결과에 따른 수정

일반적인 개발 작업에서 Claude Code가 애플리케이션 소스 코드를 직접 작성하거나 수정하지 않는다.

Claude Code가 직접 수정할 수 있는 것:

- spec
- plan
- 문서
- `CLAUDE.md`

구현, 버그 수정, 리팩터링, 테스트 작성 등의 작업은 전역 `codex-auto` workflow를 사용한다.

작업 절차:

1. Claude가 요구사항과 완료 조건을 명확한 작업으로 정리한다.
2. Claude가 전역 `codex-auto`에 작업을 위임한다.
3. Codex는 read-only 환경에서 저장소를 분석하고 코드 변경 patch를 생성한다.
4. `codex-auto.sh`가 Codex 바깥의 호스트 환경에서 patch를 실제 저장소에 적용한다.
5. `codex-auto.sh`가 프로젝트 검증 명령을 실행한다.
6. Codex가 변경사항을 독립적으로 리뷰한다.
7. critical/major 문제가 있거나 검증이 실패하면 Codex가 수정 patch를 생성한다.
8. patch 적용 → 검증 → 리뷰를 제한된 횟수만큼 반복한다.
9. Claude에게는 최종 요약 결과만 반환한다.

`codex-auto`가 `PASS`를 반환하면 Claude는:

- 전체 diff를 다시 읽지 않는다.
- 동일한 테스트를 다시 실행하지 않는다.
- `/codex:review`를 추가 실행하지 않는다.
- `/codex:rescue`를 추가 실행하지 않는다.
- raw Codex 결과를 요청하지 않는다.

다음 상태일 때만 Claude가 직접 조사한다.

- `NEEDS_DECISION`
- `FAIL`

다음 legacy workflow를 자동으로 사용하지 않는다.

- `/codex:rescue`
- `/codex:review`
- `codex:codex-rescue`
- `codex:status` polling

## Codex sandbox 정책

Codex sandbox 내부에서 다음 작업이 성공한다고 가정하지 않는다.

- 소스 파일 직접 쓰기
- `git` write 작업
- `pnpm`
- `npm`
- build
- test
- 외부 네트워크
- 로컬 포트 bind

특히 macOS 외장 볼륨(`/Volumes/...`)과 sandbox 정책에 따라 파일 시스템 및 toolchain 접근 제한이 발생할 수 있다.

따라서 이 프로젝트에서는 Codex를 기본적으로 read-only 코드 분석 및 patch 생성 엔진으로 사용한다.

다음 작업은 호스트의 `codex-auto.sh`가 수행한다.

- patch 적용
- git 상태 확인
- diff 생성
- 테스트
- typecheck
- lint
- build
- e2e

Codex에게 sandbox에서 실패한 동일 명령을 반복해서 실행시키지 않는다.

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

## Phase 완료 리뷰

Phase의 모든 작업이 끝나면 변경사항 전체에 대해 독립적인 Codex 리뷰를 수행한다.

리뷰에서 중점적으로 확인할 것:

- correctness
- regression
- architecture 위반
- security
- data integrity
- edge case
- 필요한 테스트 누락
- accessibility regression

critical 또는 major 문제가 있으면 Codex가 수정한다.

상세 review 결과 전체를 Claude main context로 반환하지 않는다.

최종적으로 다음 정보만 반환한다.

- PASS / NEEDS_DECISION / FAIL
- critical 개수
- major 개수
- minor 개수
- 검증 결과
- 짧은 요약
- 미해결 의사결정

## Roadmap

1. Project init, GIS auth, Drive folder browsing — **완료**
2. Subfolder traversal, Sheet listing, parsing, validation — **완료**
3. Quiz-taking UI, single/multiple answers, question status, IndexedDB autosave, resume — **완료**
4. Final submission, grading, results, per-option explanations, wrong-answer management — **완료**
5. Markdown/JSON export, settings/data deletion, error handling, mobile/accessibility — **완료**
6. Test hardening, independent review, README/docs, production build verification — **시작 전, 사용자 승인 대기**

## 현재 상태

2026-09-06 기준:

- Phase 1–5 구현 완료
- Phase 1–5 리뷰 완료
- 관련 변경사항 commit 완료
- unit test 196개 통과
- `tsc --noEmit` 통과
- ESLint 통과
  - 기존 Fast Refresh warning 3개만 존재
- `pnpm build` 통과
- Playwright E2E 전체 통과
- local `main`은 `origin/main`보다 79 commits 앞서 있음
- 아직 remote push 하지 않음

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