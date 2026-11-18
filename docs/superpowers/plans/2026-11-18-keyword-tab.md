# 키워드 탭 Implementation Plan

**Goal:** 스프레드시트 안에 `키워드` 탭을 두면, 시험 시작 전에 영역별 키워드 정리본을 볼 수 있다.
탭이 없는 기존 시트는 그대로 동작한다.

**Architecture:** 키워드 탭은 문제 탭과 별개의 탭이다. 문제 파싱/검증/IndexedDB 저장 경로는
건드리지 않는다. 키워드 화면에 들어갈 때마다 Sheets API로 읽고 저장하지 않는다.
시험 중 키워드 보기는 범위 밖이다.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md` (§8.1 시트 양식 — Task 5에서 키워드 탭 추가)

## 시트 양식

탭 이름은 정확히 `키워드`.

| 영역 | 키워드 | 설명 |
|---|---|---|
| 네트워크 | TCP 3-way handshake | SYN → SYN-ACK → ACK |

- 첫 행은 헤더. `영역`, `키워드`는 필수, `설명`은 선택.
- `영역` 값은 문제 탭의 `분류`와 같은 표기를 권장한다(앱이 강제하지는 않는다).
- 키워드/영역이 빈 행은 무시한다.

## Global Constraints

- OAuth 토큰은 메모리에만 보관. 키워드 데이터를 IndexedDB에 저장하지 않는다.
- 런타임 AI 호출, 백엔드 추가 금지.
- 문제 탭의 `REQUIRED_HEADER_KEYS`와 `parseSheetRows`는 변경하지 않는다.
- `react-hooks/exhaustive-deps`를 suppress하지 않는다(CLAUDE.md).

---

### Task 1: 탭 선택에서 `키워드` 탭 제외

**Files:** `src/sheets/sheetsClient.ts`, 해당 테스트 파일

- [ ] `pickQuestionTab`이 `title === "키워드"`인 탭을 먼저 걸러낸 뒤 기존 로직을 적용한다.
  (필터 후 탭이 1개면 자동 선택되어야 한다. 예: `[Sheet1, 키워드]` → `Sheet1` 자동 선택)
- [ ] 테스트: `[문제은행, 키워드]` → 문제은행 자동 선택 / `[Sheet1, 키워드]` → Sheet1 자동 선택 /
  `[A, B, 키워드]` → candidates가 A, B / `[키워드]`만 있으면 autoSelected null, candidates 빈 배열.

### Task 2: 키워드 파서

**Files:** `src/sheets/parseKeywordRows.ts` (+ test)

- [ ] `parseKeywordRows(rows: string[][]): KeywordGroup[]` — 헤더로 `영역/키워드/설명` 열 위치를 찾고,
  영역별로 묶어 입력 순서를 유지한다. 필수 헤더가 없으면 빈 배열이 아니라 오류로 구분한다
  (`{ groups, error }` 형태 등 화면이 "헤더를 확인하세요"를 표시할 수 있게).
- [ ] 테스트: 정상 / 설명 열 없음 / 빈 행 무시 / 필수 헤더 누락 / 같은 영역이 떨어져 있어도 한 그룹.

### Task 3: 키워드 화면

**Files:** `src/pages/KeywordsPage.tsx`, 라우터 등록, `src/pages/SheetValidationPage.tsx`

- [ ] 라우트 `/sheets/:spreadsheetId/keywords` 추가. 진입 시 `getSheetValues(token, id, "키워드")`로 읽고
  `parseKeywordRows` 결과를 영역별 접이식 목록(`<details>`)으로 표시한다. 로딩/오류 처리는
  `SheetTabSelectPage`와 같은 패턴(`useLatestRequest`, 401 → `markExpired`)을 쓴다.
- [ ] 키워드 탭이 없어서 API가 400을 반환하면 "이 시트에 '키워드' 탭이 없습니다" 안내를 보여준다.
- [ ] `SheetValidationPage`(시험 시작 전 화면)에 "키워드 보기" 버튼을 추가한다.
  버튼은 항상 표시하고, 탭이 없으면 위 안내가 나온다(탭 존재 여부를 미리 조회하지 않는다).
- [ ] 테스트: 렌더링(영역별 그룹), 탭 없음 안내, 401 처리. e2e에는 mockGoogleApis에 키워드 탭을
  추가해 "시작 전 화면 → 키워드 보기 → 키워드 표시" 1건.

### Task 4: 문서 — 문제 작성 가이드

**Files:** `docs/ai-question-generation-prompt.md`, `README.md`

- [ ] `docs/ai-question-generation-prompt.md`에 키워드 탭 작성용 프롬프트 섹션을 추가한다.
  문제 생성 프롬프트와 같은 형식(TSV 출력, 헤더 `영역	키워드	설명`)이며, 변수는 `{자격증명}`,
  `{문제_탭의_분류_목록}`(문제 탭 `분류`와 표기를 맞추기 위해 사용자가 채운다).
  사용법에 "시트에 `키워드` 탭을 새로 만들고 A1에 붙여넣는다"를 명시한다.
- [ ] `README.md`의 시트 양식 섹션에 `키워드` 탭(선택) 설명과 "탭 이름은 정확히 `키워드`, 이 탭은 문제 탭
  선택 목록에서 제외된다"를 추가한다.

### Task 5: Architecture spec 갱신

**Files:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`

- [ ] §8.1에 키워드 탭 양식과 "문제 탭 후보에서 제외, IndexedDB 미저장"을 짧게 추가한다.

## 검증

`pnpm test && pnpm typecheck && pnpm lint && pnpm build`, 그리고 `pnpm e2e`를 직접 실행해 모두 통과해야 PASS.
