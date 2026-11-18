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

## 작업 위임 방식

작업은 plan 항목 하나를 단위로 작게 나눈다.
테스트까지 포함해 단독으로 검증되는 크기여야 한다.

- 문서 읽기, 검증 명령 실행 같은 단순 반복 작업: haiku 서브에이전트
- 실제 코딩: Orca Worker (`--agent codex`, 모델 `gpt-6.2-sol`, effort `medium`)
- 코딩 완료 후 리뷰: sonnet 5.5 서브에이전트 (diff와 해당 plan 항목을 전달)

Orca Worker 규칙:

- Task spec은 혼자서 읽어도 되게 쓴다. 대상, 변경 내용, 제약, 수정 가능한 파일, 완료 증거를 넣고 아래 특이사항도 포함한다.
- 같은 파일을 동시에 고치는 Task는 `--worktree new-child`로 분리한다.
- Worker를 띄운 뒤에는 턴을 끝내고 Orca가 깨울 때까지 기다린다. 폴링하지 않는다.
- Architecture spec은 요약본이 아니라 원문 경로를 넘긴다.

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
