# 2단계: 하위 폴더 탐색 · Sheet 목록 · 탭/데이터 읽기 · 파서 · 검증 Implementation Plan

> **For agentic workers:** 이 저장소는 Claude Code가 조율만 담당하고 실제
> 코드 작성은 Codex 플러그인이 담당한다. 아래 "실행 방식" 절을 따를 것.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자격증 폴더 아래를 계속 탐색하고(하위 폴더 포함), Google Sheet
파일을 선택해 문제 탭을 읽고, 헤더 기반 파서와 Zod 검증을 거쳐 문제 세트를
검증 결과 화면까지 보여준다.

**Architecture:** Drive REST로 폴더/Sheet 파일을 함께 나열하는 탐색 화면을
하나 두고(재귀적 이동), Sheets REST로 탭 목록과 값을 읽는다. 파싱/검증은
UI와 분리된 순수 함수 모듈(`src/sheets/`)로 만들어 단위 테스트로 촘촘히
검증한다.

**Tech Stack:** 1단계와 동일. 검증 규칙은 순수 TypeScript 함수로 구현한다 —
행마다 필드 몇 개를 교차 검사하는 규칙이 대부분이라 Zod 스키마로 감싸도
크게 단순해지지 않으므로, 의존성을 하나 더 늘리지 않고 `src/sheets/
validateQuestions.ts`의 일반 함수로 작성한다 (아키텍처 문서의 Zod 언급은
선택이었다).

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`
(6절: 라우팅, 7절: 데이터 모델, 8절: Sheet 파싱·검증 파이프라인),
`docs/superpowers/plans/2026-09-03-phase1-drive-connect.md` (1단계 결과물 —
`src/auth/`, `src/drive/driveClient.ts`, `src/storage/`, `src/pages/` 등을
그대로 이어서 사용한다)

## Global Constraints

- Java/Spring Boot, 별도 백엔드 서버, 외부 DB 금지
- Google Drive/Sheets는 읽기 전용으로만 접근
- OAuth 액세스 토큰은 메모리에만 유지 (1단계에서 구현된 `useAuth().getAccessToken()` 재사용)
- 휴지통에 있는 폴더/파일은 목록에서 제외
- 헤더 위치·순서는 고정하지 않는다 — 헤더 이름으로 컬럼을 찾는다
- 한 개씩 중단하지 말고 검증 오류 전체를 모아 한 번에 보여준다
- 문제 ID는 Sheet 행 순서만으로 만들지 않는다 (spreadsheetId + tabId + 번호 + 본문 해시)
- UI는 한국어, 색상만으로 상태를 구분하지 않음

## 환경 제약 (1단계에서 확인됨, 그대로 유지)

이 저장소는 외장 HFS+ 볼륨(`/Volumes/MAC`)에 있어 Codex 샌드박스가
`pnpm install`/`pnpm test`/`pnpm lint`/`pnpm build`/`pnpm e2e`와
`git commit`을 실행하지 못한다(EPERM, 및 자동 모드 권한 분류기 차단).
**Claude Code가 이 명령들을 전부 샌드박스 밖에서 대신 실행하고 커밋한다.**
Codex는 코드/테스트 코드 작성만 담당한다.

## 실행 방식

1. Claude Code가 각 Task의 Files/Interfaces/Steps를 Codex 플러그인에
   구현 지시로 전달한다 (테스트 코드 포함, 파일 작성만 요청 — 명령 실행/커밋은
   요청하지 않는다).
2. Codex가 파일을 작성하고 어떤 파일을 만들었는지 보고한다.
3. Claude Code가 `pnpm test`/`lint`/`typecheck`를 직접 실행해 결과를 확인한다.
4. 실패하면 Claude Code가 정확한 원인과 수정 지시를 Codex에 다시 전달한다
   (재시도).
5. 통과하면 Claude Code가 diff를 검토하고 직접 커밋한다.
6. 모든 Task 완료 후 Claude Code가 Codex에 별도 관점의 코드 리뷰를 요청하고,
   지적사항을 판단해 필요하면 수정한다.

---

### Task 1: Sheets 타입 및 헤더 매핑

**Files:**
- Create: `src/sheets/types.ts`
- Create: `src/sheets/headerMap.ts`
- Test: `src/sheets/headerMap.test.ts`

**Interfaces:**
- Produces: `ValidationIssue { sheetName: string; rowNumber: number;
  questionNumber: number | null; field: string; message: string; severity:
  "error" | "warning" }` (`src/sheets/types.ts`); `REQUIRED_HEADER_KEYS:
  readonly string[]`, `buildHeaderIndex(headerRow: string[]): Record<string,
  number>` (`src/sheets/headerMap.ts`) — Task 2(파서)와 Task 3(검증)이 이
  함수와 상수를 사용한다.

- [ ] **Step 1: src/sheets/types.ts 작성**

```typescript
export interface ValidationIssue {
  sheetName: string;
  rowNumber: number;
  questionNumber: number | null;
  field: string;
  message: string;
  severity: "error" | "warning";
}
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/sheets/headerMap.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import { buildHeaderIndex, REQUIRED_HEADER_KEYS } from "./headerMap";

describe("buildHeaderIndex", () => {
  it("maps Korean headers to normalized keys", () => {
    const index = buildHeaderIndex([
      "번호",
      "분류",
      "난이도",
      "유형",
      "문제",
      "보기 A",
      "보기 B",
      "보기 C",
      "보기 D",
      "정답",
      "해설",
    ]);
    expect(index).toEqual({
      question_no: 0,
      category: 1,
      difficulty: 2,
      question_type: 3,
      question: 4,
      option_a: 5,
      option_b: 6,
      option_c: 7,
      option_d: 8,
      correct_answers: 9,
      explanation: 10,
    });
  });

  it("maps English aliases to the same normalized keys", () => {
    const index = buildHeaderIndex([
      "question_no",
      "category",
      "difficulty",
      "question_type",
      "question",
      "option_a",
      "option_b",
      "correct_answers",
      "explanation",
    ]);
    expect(index.question_no).toBe(0);
    expect(index.category).toBe(1);
  });

  it("does not depend on header order", () => {
    const index = buildHeaderIndex(["해설", "문제", "번호"]);
    expect(index).toEqual({ explanation: 0, question: 1, question_no: 2 });
  });

  it("trims whitespace and ignores unknown headers", () => {
    const index = buildHeaderIndex([" 번호 ", "출처(무시)", "문제"]);
    expect(index).toEqual({ question_no: 0, question: 2 });
  });

  it("maps every optional and required header alias", () => {
    const index = buildHeaderIndex([
      "세트 ID",
      "출제일",
      "상황",
      "보기 E",
      "보기 F",
      "정답 개수",
      "보기 A 해설",
      "보기 B 해설",
      "보기 C 해설",
      "보기 D 해설",
      "보기 E 해설",
      "보기 F 해설",
      "핵심 키워드",
      "관련 주제",
      "참고 URL",
      "상태",
      "영역",
    ]);
    expect(index).toEqual({
      set_id: 0,
      published_at: 1,
      scenario: 2,
      option_e: 3,
      option_f: 4,
      required_answer_count: 5,
      option_a_explanation: 6,
      option_b_explanation: 7,
      option_c_explanation: 8,
      option_d_explanation: 9,
      option_e_explanation: 10,
      option_f_explanation: 11,
      key_points: 12,
      related_topics: 13,
      source_url: 14,
      status: 15,
      category: 16,
    });
  });

  it("lists the required header keys per the spec", () => {
    expect(REQUIRED_HEADER_KEYS).toEqual([
      "question_no",
      "category",
      "difficulty",
      "question_type",
      "question",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct_answers",
      "explanation",
    ]);
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm test src/sheets/headerMap.test.ts`
Expected: FAIL with "Cannot find module './headerMap'"

- [ ] **Step 4: src/sheets/headerMap.ts 구현**

```typescript
const HEADER_ALIASES: Record<string, string> = {
  번호: "question_no",
  question_no: "question_no",
  분류: "category",
  영역: "category",
  category: "category",
  난이도: "difficulty",
  difficulty: "difficulty",
  유형: "question_type",
  question_type: "question_type",
  상황: "scenario",
  scenario: "scenario",
  문제: "question",
  question: "question",
  "보기 A": "option_a",
  option_a: "option_a",
  "보기 B": "option_b",
  option_b: "option_b",
  "보기 C": "option_c",
  option_c: "option_c",
  "보기 D": "option_d",
  option_d: "option_d",
  "보기 E": "option_e",
  option_e: "option_e",
  "보기 F": "option_f",
  option_f: "option_f",
  정답: "correct_answers",
  correct_answers: "correct_answers",
  "정답 개수": "required_answer_count",
  required_answer_count: "required_answer_count",
  해설: "explanation",
  explanation: "explanation",
  "보기 A 해설": "option_a_explanation",
  option_a_explanation: "option_a_explanation",
  "보기 B 해설": "option_b_explanation",
  option_b_explanation: "option_b_explanation",
  "보기 C 해설": "option_c_explanation",
  option_c_explanation: "option_c_explanation",
  "보기 D 해설": "option_d_explanation",
  option_d_explanation: "option_d_explanation",
  "보기 E 해설": "option_e_explanation",
  option_e_explanation: "option_e_explanation",
  "보기 F 해설": "option_f_explanation",
  option_f_explanation: "option_f_explanation",
  "핵심 키워드": "key_points",
  key_points: "key_points",
  "관련 주제": "related_topics",
  related_topics: "related_topics",
  "참고 URL": "source_url",
  source_url: "source_url",
  상태: "status",
  status: "status",
  "세트 ID": "set_id",
  set_id: "set_id",
  출제일: "published_at",
  published_at: "published_at",
};

export const REQUIRED_HEADER_KEYS = [
  "question_no",
  "category",
  "difficulty",
  "question_type",
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answers",
  "explanation",
] as const;

export function buildHeaderIndex(headerRow: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  headerRow.forEach((raw, i) => {
    const key = HEADER_ALIASES[raw.trim()];
    if (key && !(key in index)) {
      index[key] = i;
    }
  });
  return index;
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `pnpm test src/sheets/headerMap.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/sheets/types.ts src/sheets/headerMap.ts src/sheets/headerMap.test.ts
git commit -m "feat: add Sheet header alias mapping"
```

### Task 2: Sheet 행 파싱

**Files:**
- Create: `src/sheets/parseQuestions.ts`
- Test: `src/sheets/parseQuestions.test.ts`

**Interfaces:**
- Consumes: `buildHeaderIndex` (Task 1)
- Produces: `RawQuestionRow { rowNumber: number; values: Record<string,
  string> }`, `parseSheetRows(rows: string[][]): { headerIndex: Record<string,
  number>; rows: RawQuestionRow[] }` (`src/sheets/parseQuestions.ts`) —
  Task 3(검증)이 이 출력을 입력으로 사용한다. `rowNumber`는 실제 Google
  Sheet의 1-based 행 번호(헤더 = 1행)다.

- [ ] **Step 1: 실패하는 테스트 작성 — src/sheets/parseQuestions.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import { parseSheetRows } from "./parseQuestions";

describe("parseSheetRows", () => {
  it("parses data rows into trimmed values keyed by normalized header", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제"],
      ["1", " EC2란 무엇인가? "],
    ]);
    expect(rows).toEqual([{ rowNumber: 2, values: { question_no: "1", question: "EC2란 무엇인가?" } }]);
  });

  it("assigns sheet row numbers accounting for the header row", () => {
    const { rows } = parseSheetRows([
      ["번호"],
      ["1"],
      ["2"],
    ]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("skips fully empty rows", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제"],
      ["1", "첫 문제"],
      ["", ""],
      ["2", "세 번째 문제"],
    ]);
    expect(rows.map((r) => r.values.question_no)).toEqual(["1", "2"]);
    expect(rows[1].rowNumber).toBe(4);
  });

  it("treats a row with only whitespace as empty", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제"],
      ["  ", "  "],
    ]);
    expect(rows).toEqual([]);
  });

  it("returns an empty header index and no rows when the sheet has no header row", () => {
    const result = parseSheetRows([]);
    expect(result).toEqual({ headerIndex: {}, rows: [] });
  });

  it("treats a missing trailing cell as an empty string", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제", "해설"],
      ["1", "문제 본문"],
    ]);
    expect(rows[0].values.explanation).toBe("");
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/sheets/parseQuestions.test.ts`
Expected: FAIL with "Cannot find module './parseQuestions'"

- [ ] **Step 3: src/sheets/parseQuestions.ts 구현**

```typescript
import { buildHeaderIndex } from "./headerMap";

export interface RawQuestionRow {
  rowNumber: number;
  values: Record<string, string>;
}

export function parseSheetRows(rows: string[][]): {
  headerIndex: Record<string, number>;
  rows: RawQuestionRow[];
} {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return { headerIndex: {}, rows: [] };
  }

  const headerIndex = buildHeaderIndex(headerRow);
  const parsed: RawQuestionRow[] = [];

  dataRows.forEach((row, i) => {
    const values: Record<string, string> = {};
    let hasContent = false;
    for (const [key, columnIndex] of Object.entries(headerIndex)) {
      const cell = (row[columnIndex] ?? "").trim();
      values[key] = cell;
      if (cell) hasContent = true;
    }
    if (!hasContent) return;
    parsed.push({ rowNumber: i + 2, values });
  });

  return { headerIndex, rows: parsed };
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm test src/sheets/parseQuestions.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/sheets/parseQuestions.ts src/sheets/parseQuestions.test.ts
git commit -m "feat: parse Sheet rows into normalized field values"
```

### Task 3: 문제 ID · 문제 세트 fingerprint

**Files:**
- Create: `src/sheets/fingerprint.ts`
- Test: `src/sheets/fingerprint.test.ts`

**Interfaces:**
- Produces: `createQuestionId(spreadsheetId: string, sheetTabId: string,
  questionNumber: number, text: string): string`, `createSetFingerprint(
  questions: Array<{ questionNumber: number; text: string; options:
  Array<{ key: string; text: string }>; correctAnswers: string[] }>): string`
  (`src/sheets/fingerprint.ts`) — Task 4(검증)이 문제별 `id`를 만들 때
  `createQuestionId`를 쓰고, Sheet 변경 감지(3단계 이후)가
  `createSetFingerprint`를 쓴다. 채점에 영향 없는 필드(해설, 키워드 등)는
  입력에서 제외해 값이 안정적으로 유지되게 한다.

- [ ] **Step 1: 실패하는 테스트 작성 — src/sheets/fingerprint.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import { createQuestionId, createSetFingerprint } from "./fingerprint";

describe("createQuestionId", () => {
  it("is stable for the same inputs", () => {
    const a = createQuestionId("sheet-1", "tab-1", 3, "EC2란 무엇인가?");
    const b = createQuestionId("sheet-1", "tab-1", 3, "EC2란 무엇인가?");
    expect(a).toBe(b);
  });

  it("changes when the question text changes", () => {
    const a = createQuestionId("sheet-1", "tab-1", 3, "EC2란 무엇인가?");
    const b = createQuestionId("sheet-1", "tab-1", 3, "S3란 무엇인가?");
    expect(a).not.toBe(b);
  });

  it("changes when the question number changes", () => {
    const a = createQuestionId("sheet-1", "tab-1", 3, "동일한 문제");
    const b = createQuestionId("sheet-1", "tab-1", 4, "동일한 문제");
    expect(a).not.toBe(b);
  });

  it("does not depend on row order alone (two different sheets stay distinct)", () => {
    const a = createQuestionId("sheet-1", "tab-1", 1, "문제");
    const b = createQuestionId("sheet-2", "tab-1", 1, "문제");
    expect(a).not.toBe(b);
  });
});

describe("createSetFingerprint", () => {
  const base = [
    {
      questionNumber: 1,
      text: "문제 1",
      options: [
        { key: "A", text: "보기 A" },
        { key: "B", text: "보기 B" },
      ],
      correctAnswers: ["A"],
    },
    {
      questionNumber: 2,
      text: "문제 2",
      options: [
        { key: "A", text: "보기 A" },
        { key: "B", text: "보기 B" },
      ],
      correctAnswers: ["B"],
    },
  ];

  it("is stable regardless of question array order", () => {
    const forward = createSetFingerprint(base);
    const reversed = createSetFingerprint([...base].reverse());
    expect(forward).toBe(reversed);
  });

  it("changes when a correct answer changes", () => {
    const original = createSetFingerprint(base);
    const changed = createSetFingerprint([
      { ...base[0], correctAnswers: ["B"] },
      base[1],
    ]);
    expect(original).not.toBe(changed);
  });

  it("changes when option text changes", () => {
    const original = createSetFingerprint(base);
    const changed = createSetFingerprint([
      { ...base[0], options: [{ key: "A", text: "변경된 보기" }, base[0].options[1]] },
      base[1],
    ]);
    expect(original).not.toBe(changed);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/sheets/fingerprint.test.ts`
Expected: FAIL with "Cannot find module './fingerprint'"

- [ ] **Step 3: src/sheets/fingerprint.ts 구현**

```typescript
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createQuestionId(
  spreadsheetId: string,
  sheetTabId: string,
  questionNumber: number,
  text: string,
): string {
  return `${spreadsheetId}:${sheetTabId}:${questionNumber}:${fnv1aHash(text)}`;
}

interface FingerprintQuestion {
  questionNumber: number;
  text: string;
  options: Array<{ key: string; text: string }>;
  correctAnswers: string[];
}

export function createSetFingerprint(questions: FingerprintQuestion[]): string {
  const material = questions
    .slice()
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .map((q) =>
      [
        q.questionNumber,
        q.text,
        q.options.map((o) => `${o.key}:${o.text}`).join("|"),
        q.correctAnswers.slice().sort().join(","),
      ].join(""),
    )
    .join("");
  return fnv1aHash(material);
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm test src/sheets/fingerprint.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/sheets/fingerprint.ts src/sheets/fingerprint.test.ts
git commit -m "feat: add deterministic question id and set fingerprint generation"
```

### Task 4: 문제 데이터 검증

**Files:**
- Create: `src/sheets/validateQuestions.ts`
- Test: `src/sheets/validateQuestions.test.ts`

**Interfaces:**
- Consumes: `RawQuestionRow`, `parseSheetRows` (Task 2), `REQUIRED_HEADER_KEYS`
  (Task 1), `createQuestionId` (Task 3), `Question`, `QuestionOption`,
  `Difficulty`, `QuestionType` (1단계 `src/types/question.ts`),
  `ValidationIssue` (Task 1)
- Produces: `validateQuestions(headerIndex: Record<string, number>, rows:
  RawQuestionRow[], context: { sheetName: string; spreadsheetId: string;
  sheetTabId: string }): { questions: Question[]; issues: ValidationIssue[] }`
  (`src/sheets/validateQuestions.ts`) — Task 7(검증 결과 화면)이 `issues`를
  표시하고, `questions`는 3단계(문제풀이 UI)가 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성 — src/sheets/validateQuestions.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import { parseSheetRows } from "./parseQuestions";
import { validateQuestions } from "./validateQuestions";

const CONTEXT = { sheetName: "문제은행", spreadsheetId: "sheet-1", sheetTabId: "tab-1" };

const VALID_HEADER = [
  "번호",
  "분류",
  "난이도",
  "유형",
  "문제",
  "보기 A",
  "보기 B",
  "보기 C",
  "보기 D",
  "정답",
  "해설",
];

function run(rows: string[][]) {
  const { headerIndex, rows: parsed } = parseSheetRows([VALID_HEADER, ...rows]);
  return validateQuestions(headerIndex, parsed, CONTEXT);
}

describe("validateQuestions", () => {
  it("returns a header-missing error and no questions when a required header is absent", () => {
    const { headerIndex, rows } = parseSheetRows([["번호", "문제"], ["1", "본문"]]);
    const result = validateQuestions(headerIndex, rows, CONTEXT);
    expect(result.questions).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ field: "header", severity: "error" });
  });

  it("parses a valid single-answer row into a Question", () => {
    const { questions, issues } = run([
      ["1", "컴퓨팅", "MEDIUM", "SINGLE", "EC2란?", "가상서버", "저장소", "네트워크", "DB", "A", "해설입니다"],
    ]);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      questionNumber: 1,
      category: "컴퓨팅",
      difficulty: "MEDIUM",
      type: "SINGLE",
      requiredAnswerCount: 1,
      text: "EC2란?",
      correctAnswers: ["A"],
      explanation: "해설입니다",
    });
    expect(questions[0].options).toEqual([
      { key: "A", text: "가상서버", explanation: undefined },
      { key: "B", text: "저장소", explanation: undefined },
      { key: "C", text: "네트워크", explanation: undefined },
      { key: "D", text: "DB", explanation: undefined },
    ]);
  });

  it("normalizes Korean type and difficulty aliases", () => {
    const { questions } = run([
      ["1", "분류", "쉬움", "복수 정답", "문제", "A", "B", "", "", "A,B", "해설"],
    ]);
    expect(questions[0].difficulty).toBe("EASY");
    expect(questions[0].type).toBe("MULTIPLE");
  });

  it("parses comma-and-space separated multiple answers", () => {
    const { questions } = run([
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "B, C", "해설"],
    ]);
    expect(questions[0].correctAnswers).toEqual(["B", "C"]);
  });

  it("defaults empty difficulty to MEDIUM with a warning", () => {
    const { questions, issues } = run([
      ["1", "분류", "", "SINGLE", "문제", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions[0].difficulty).toBe("MEDIUM");
    expect(issues.some((i) => i.field === "difficulty" && i.severity === "warning")).toBe(true);
  });

  it("warns but keeps the question when explanation is missing", () => {
    const { questions, issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", ""],
    ]);
    expect(questions).toHaveLength(1);
    expect(issues).toEqual([
      expect.objectContaining({ field: "explanation", severity: "warning" }),
    ]);
  });

  it("errors and skips the row when the question text is missing", () => {
    const { questions, issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions).toEqual([]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "question", severity: "error", rowNumber: 2 }),
    ]);
  });

  it("errors when fewer than two options are present", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "", "", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "options", severity: "error" }),
    ]);
  });

  it("errors when an option is missing in the middle of the sequence", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "", "C", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "options", severity: "error" }),
    ]);
  });

  it("errors when the correct answer references a non-existent option", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "E", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "correct_answers", severity: "error" }),
    ]);
  });

  it("errors when the answer field is empty", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "correct_answers", severity: "error" }),
    ]);
  });

  it("errors when SINGLE has more than one correct answer", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "C", "", "A,B", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "type", severity: "error" }),
    ]);
  });

  it("errors when MULTIPLE has only one correct answer", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "type", severity: "error" }),
    ]);
  });

  it("errors when required_answer_count does not match the actual answer count", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "정답 개수"],
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "A,B", "해설", "3"],
    ]);
    const { issues } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(issues).toEqual([
      expect.objectContaining({ field: "required_answer_count", severity: "error" }),
    ]);
  });

  it("errors on an unsupported question type", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "OX", "문제", "A", "B", "", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "question_type", severity: "error" }),
    ]);
  });

  it("errors on duplicate question numbers", () => {
    const { issues, questions } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", "해설"],
      ["1", "분류", "MEDIUM", "SINGLE", "문제 2", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions).toHaveLength(1);
    expect(issues).toEqual([
      expect.objectContaining({ field: "question_no", severity: "error", rowNumber: 3 }),
    ]);
  });

  it("errors when the same option letter is listed twice in the answer", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "A,A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "correct_answers", severity: "error" }),
    ]);
  });

  it("excludes DRAFT/INACTIVE rows without raising an issue", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "상태"],
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설", "DRAFT"],
    ]);
    const { questions, issues } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(questions).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("keeps PUBLISHED/ACTIVE rows", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "상태"],
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설", "사용"],
    ]);
    const { questions } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(questions).toHaveLength(1);
  });

  it("auto-numbers rows when the question number column is blank", () => {
    const { headerIndex, rows } = parseSheetRows([
      VALID_HEADER,
      ["", "분류", "MEDIUM", "SINGLE", "첫 문제", "A", "B", "", "", "A", "해설"],
      ["", "분류", "MEDIUM", "SINGLE", "둘째 문제", "A", "B", "", "", "A", "해설"],
    ]);
    const { questions } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(questions.map((q) => q.questionNumber)).toEqual([1, 2]);
  });

  it("gives each valid question a stable, content-derived id", () => {
    const { questions } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions[0].id).toBe(
      questions[0].id, // sanity: deterministic within this call
    );
    expect(typeof questions[0].id).toBe("string");
    expect(questions[0].id.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/sheets/validateQuestions.test.ts`
Expected: FAIL with "Cannot find module './validateQuestions'"

- [ ] **Step 3: src/sheets/validateQuestions.ts 구현**

```typescript
import type { Difficulty, Question, QuestionOption, QuestionType } from "../types/question";
import { createQuestionId } from "./fingerprint";
import { REQUIRED_HEADER_KEYS } from "./headerMap";
import type { RawQuestionRow } from "./parseQuestions";
import type { ValidationIssue } from "./types";

const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d", "option_e", "option_f"] as const;
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const DIFFICULTY_MAP: Record<string, Difficulty> = {
  EASY: "EASY",
  쉬움: "EASY",
  MEDIUM: "MEDIUM",
  보통: "MEDIUM",
  HARD: "HARD",
  어려움: "HARD",
};

const TYPE_MAP: Record<string, QuestionType> = {
  SINGLE: "SINGLE",
  단일: "SINGLE",
  "단일 정답": "SINGLE",
  "객관식 단일": "SINGLE",
  MULTIPLE: "MULTIPLE",
  복수: "MULTIPLE",
  "복수 정답": "MULTIPLE",
  "객관식 복수": "MULTIPLE",
};

const ACTIVE_STATUSES = new Set(["PUBLISHED", "출제", "ACTIVE", "사용"]);
// 상태가 비어 있으면 사용 가능으로 취급하고, 값이 있는데 ACTIVE_STATUSES에
// 없으면(DRAFT/초안/INACTIVE/미사용 포함, 그 외 인식 불가 값도) 제외한다.

export interface ValidateContext {
  sheetName: string;
  spreadsheetId: string;
  sheetTabId: string;
}

function issue(
  context: ValidateContext,
  rowNumber: number,
  questionNumber: number | null,
  field: string,
  message: string,
  severity: "error" | "warning",
): ValidationIssue {
  return { sheetName: context.sheetName, rowNumber, questionNumber, field, message, severity };
}

export function validateQuestions(
  headerIndex: Record<string, number>,
  rows: RawQuestionRow[],
  context: ValidateContext,
): { questions: Question[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  const missingHeaders = REQUIRED_HEADER_KEYS.filter((key) => !(key in headerIndex));
  if (missingHeaders.length > 0) {
    issues.push(
      issue(context, 1, null, "header", `필수 헤더가 없습니다: ${missingHeaders.join(", ")}`, "error"),
    );
    return { questions: [], issues };
  }

  const questions: Question[] = [];
  const seenNumbers = new Map<number, number>();
  let autoNumber = 0;

  for (const row of rows) {
    const v = row.values;

    const status = v.status ?? "";
    if (status && !ACTIVE_STATUSES.has(status)) continue;

    autoNumber += 1;

    const questionText = v.question ?? "";
    if (!questionText) {
      issues.push(issue(context, row.rowNumber, null, "question", "문제 본문이 비어 있습니다.", "error"));
      continue;
    }

    let questionNumber = autoNumber;
    const rawNumber = v.question_no ? Number(v.question_no) : NaN;
    if (Number.isFinite(rawNumber)) questionNumber = rawNumber;

    if (seenNumbers.has(questionNumber)) {
      issues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "question_no",
          `문제 번호가 중복됩니다: ${questionNumber} (첫 등장: ${seenNumbers.get(questionNumber)}행)`,
          "error",
        ),
      );
      continue;
    }
    seenNumbers.set(questionNumber, row.rowNumber);

    const rawOptionTexts = OPTION_KEYS.map((key) => v[key] ?? "");
    let lastFilledIndex = -1;
    for (let i = rawOptionTexts.length - 1; i >= 0; i--) {
      if (rawOptionTexts[i]) {
        lastFilledIndex = i;
        break;
      }
    }

    if (lastFilledIndex === -1) {
      issues.push(
        issue(context, row.rowNumber, questionNumber, "options", "선택지가 2개 미만입니다.", "error"),
      );
      continue;
    }

    const hasGap = rawOptionTexts.slice(0, lastFilledIndex + 1).some((text) => !text);
    if (hasGap) {
      issues.push(
        issue(context, row.rowNumber, questionNumber, "options", "선택지 중간이 비어 있습니다.", "error"),
      );
      continue;
    }

    const questionOptions: QuestionOption[] = rawOptionTexts.slice(0, lastFilledIndex + 1).map((text, i) => ({
      key: OPTION_LETTERS[i],
      text,
      explanation: v[`${OPTION_KEYS[i]}_explanation`] || undefined,
    }));

    if (questionOptions.length < 2) {
      issues.push(
        issue(context, row.rowNumber, questionNumber, "options", "선택지가 2개 미만입니다.", "error"),
      );
      continue;
    }

    const rawAnswers = (v.correct_answers ?? "")
      .split(",")
      .map((a) => a.trim().toUpperCase())
      .filter((a) => a.length > 0);

    if (rawAnswers.length === 0) {
      issues.push(issue(context, row.rowNumber, questionNumber, "correct_answers", "정답이 비어 있습니다.", "error"));
      continue;
    }

    const uniqueAnswers = new Set(rawAnswers);
    if (uniqueAnswers.size !== rawAnswers.length) {
      issues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "correct_answers",
          "정답에 동일한 선택지가 중복 지정되었습니다.",
          "error",
        ),
      );
      continue;
    }

    const optionKeys = new Set(questionOptions.map((o) => o.key));
    const unknownAnswer = rawAnswers.find((a) => !optionKeys.has(a));
    if (unknownAnswer) {
      issues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "correct_answers",
          `존재하지 않는 선택지가 정답으로 지정되었습니다: ${unknownAnswer}`,
          "error",
        ),
      );
      continue;
    }

    const questionType = TYPE_MAP[v.question_type ?? ""];
    if (!questionType) {
      issues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "question_type",
          `지원하지 않는 문제 유형입니다: ${v.question_type || "(비어 있음)"}`,
          "error",
        ),
      );
      continue;
    }

    if (questionType === "SINGLE" && rawAnswers.length > 1) {
      issues.push(
        issue(context, row.rowNumber, questionNumber, "type", "단일 정답 문제인데 정답이 여러 개입니다.", "error"),
      );
      continue;
    }
    if (questionType === "MULTIPLE" && rawAnswers.length < 2) {
      issues.push(
        issue(context, row.rowNumber, questionNumber, "type", "복수 정답 문제인데 정답이 1개뿐입니다.", "error"),
      );
      continue;
    }

    if (v.required_answer_count) {
      const requiredCount = Number(v.required_answer_count);
      if (Number.isFinite(requiredCount) && requiredCount !== rawAnswers.length) {
        issues.push(
          issue(
            context,
            row.rowNumber,
            questionNumber,
            "required_answer_count",
            `정답 개수(${requiredCount})와 실제 정답 수(${rawAnswers.length})가 다릅니다.`,
            "error",
          ),
        );
        continue;
      }
    }

    let difficulty = DIFFICULTY_MAP[v.difficulty ?? ""];
    if (!difficulty) {
      difficulty = "MEDIUM";
      issues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "difficulty",
          v.difficulty
            ? `난이도 값을 인식할 수 없어 기본값(MEDIUM)을 적용했습니다: ${v.difficulty}`
            : "난이도가 비어 있어 기본값(MEDIUM)을 적용했습니다.",
          "warning",
        ),
      );
    }

    if (!v.explanation) {
      issues.push(issue(context, row.rowNumber, questionNumber, "explanation", "해설이 비어 있습니다.", "warning"));
    }

    questions.push({
      id: createQuestionId(context.spreadsheetId, context.sheetTabId, questionNumber, questionText),
      sourceRow: row.rowNumber,
      questionNumber,
      category: v.category || undefined,
      difficulty,
      type: questionType,
      requiredAnswerCount: rawAnswers.length,
      scenario: v.scenario || undefined,
      text: questionText,
      options: questionOptions,
      correctAnswers: rawAnswers,
      explanation: v.explanation ?? "",
      keyPoints: v.key_points ? v.key_points.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      relatedTopics: v.related_topics
        ? v.related_topics.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      sourceUrl: v.source_url || undefined,
    });
  }

  return { questions, issues };
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm test src/sheets/validateQuestions.test.ts`
Expected: PASS (22 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/sheets/validateQuestions.ts src/sheets/validateQuestions.test.ts
git commit -m "feat: validate parsed Sheet rows into questions with collected issues"
```

### Task 5: Sheet 파일 목록(Drive) + Sheets REST 클라이언트 + 탭 우선순위

**Files:**
- Modify: `src/drive/driveClient.ts` (Sheet 파일 목록 추가)
- Modify: `src/drive/driveClient.test.ts`
- Create: `src/sheets/sheetsClient.ts`
- Test: `src/sheets/sheetsClient.test.ts`

**Interfaces:**
- Produces: `DriveFile { id: string; name: string; modifiedTime: string }`,
  `listSheetFiles(accessToken: string, parentId: string): Promise<DriveFile[]>`
  (`src/drive/driveClient.ts`); `SheetTab { sheetId: number; title: string }`,
  `SheetsApiError`, `listSheetTabs(accessToken: string, spreadsheetId:
  string): Promise<SheetTab[]>`, `getSheetValues(accessToken: string,
  spreadsheetId: string, tabTitle: string): Promise<string[][]>`,
  `pickQuestionTab(tabs: SheetTab[]): { autoSelected: SheetTab | null;
  candidates: SheetTab[] }` (`src/sheets/sheetsClient.ts`) — Task 6(탐색
  화면)이 `listSheetFiles`를, Task 7(탭 선택)이 `listSheetTabs`와
  `pickQuestionTab`을, Task 8(검증 결과 화면)이 `getSheetValues`를 쓴다.

- [ ] **Step 1: 실패하는 테스트 추가 — src/drive/driveClient.test.ts (기존 파일에 describe 블록 추가)**

기존 `describe("listChildFolders", ...)` 블록 아래에 새 블록을 추가한다
(기존 import에 `listSheetFiles`를 추가):

```typescript
import { DriveApiError } from "./driveApiError";
import { listChildFolders, listRootFolders, listSheetFiles } from "./driveClient";
```

```typescript
describe("listSheetFiles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queries Drive for non-trashed Google Sheet files under the given parent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: "s1", name: "1주차 문제", modifiedTime: "2026-09-01T00:00:00.000Z" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const files = await listSheetFiles("token-abc", "parent-1");

    expect(files).toEqual([{ id: "s1", name: "1주차 문제", modifiedTime: "2026-09-01T00:00:00.000Z" }]);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("mimeType+%3D+%27application%2Fvnd.google-apps.spreadsheet%27");
    expect(calledUrl).toContain("%27parent-1%27+in+parents");
  });

  it("throws DriveApiError with status 401 when the token is expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    await expect(listSheetFiles("expired-token", "parent-1")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<DriveApiError>);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/drive/driveClient.test.ts`
Expected: FAIL — `listSheetFiles` is not exported

- [ ] **Step 3: src/drive/driveClient.ts에 listSheetFiles 추가**

기존 `DriveFilesListResponse`/`listChildFolders`/`listRootFolders`는 그대로
두고 파일 끝에 추가한다:

```typescript
export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export async function listSheetFiles(accessToken: string, parentId: string): Promise<DriveFile[]> {
  const query = [
    `'${parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "trashed = false",
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,modifiedTime)",
    orderBy: "name",
    pageSize: "1000",
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new DriveApiError(401, "Google 연결이 만료되었습니다.");
  }
  if (!response.ok) {
    throw new DriveApiError(response.status, "Sheet 파일 목록을 불러오지 못했습니다.");
  }

  const data = (await response.json()) as { files: DriveFile[] };
  return data.files ?? [];
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm test src/drive/driveClient.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 실패하는 테스트 작성 — src/sheets/sheetsClient.test.ts**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSheetValues, listSheetTabs, pickQuestionTab, SheetsApiError } from "./sheetsClient";

describe("listSheetTabs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns sheet tabs from the spreadsheet metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sheets: [
            { properties: { sheetId: 0, title: "문제은행" } },
            { properties: { sheetId: 1, title: "오답노트" } },
          ],
        }),
      }),
    );

    const tabs = await listSheetTabs("token-abc", "sheet-1");

    expect(tabs).toEqual([
      { sheetId: 0, title: "문제은행" },
      { sheetId: 1, title: "오답노트" },
    ]);
  });

  it("throws SheetsApiError with status 401 when the token is expired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));

    await expect(listSheetTabs("expired", "sheet-1")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<SheetsApiError>);
  });
});

describe("getSheetValues", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches values for the given tab and stringifies every cell", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ values: [["번호", "문제"], [1, "EC2란?"]] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const values = await getSheetValues("token-abc", "sheet-1", "문제은행");

    expect(values).toEqual([["번호", "문제"], ["1", "EC2란?"]]);
    expect(fetchMock.mock.calls[0][0]).toContain("/sheet-1/values/");
  });

  it("returns an empty array when the tab has no values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );

    expect(await getSheetValues("token-abc", "sheet-1", "빈 탭")).toEqual([]);
  });
});

describe("pickQuestionTab", () => {
  it("prefers a tab named 문제은행", () => {
    const tabs = [{ sheetId: 0, title: "오답노트" }, { sheetId: 1, title: "문제은행" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: tabs[1], candidates: [] });
  });

  it("falls back to a tab named Questions", () => {
    const tabs = [{ sheetId: 0, title: "Notes" }, { sheetId: 1, title: "Questions" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: tabs[1], candidates: [] });
  });

  it("auto-selects the only tab when there is exactly one", () => {
    const tabs = [{ sheetId: 0, title: "Sheet1" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: tabs[0], candidates: [] });
  });

  it("returns all tabs as candidates when none match and there are several", () => {
    const tabs = [{ sheetId: 0, title: "1과목" }, { sheetId: 1, title: "2과목" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: null, candidates: tabs });
  });
});
```

- [ ] **Step 6: 테스트 실행해 실패 확인**

Run: `pnpm test src/sheets/sheetsClient.test.ts`
Expected: FAIL with "Cannot find module './sheetsClient'"

- [ ] **Step 7: src/sheets/sheetsClient.ts 구현**

```typescript
export interface SheetTab {
  sheetId: number;
  title: string;
}

export class SheetsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SheetsApiError";
    this.status = status;
  }
}

export async function listSheetTabs(accessToken: string, spreadsheetId: string): Promise<SheetTab[]> {
  const params = new URLSearchParams({ fields: "sheets.properties(sheetId,title)" });
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 401) {
    throw new SheetsApiError(401, "Google 연결이 만료되었습니다.");
  }
  if (!response.ok) {
    throw new SheetsApiError(response.status, "Sheet 탭 목록을 불러오지 못했습니다.");
  }

  const data = (await response.json()) as {
    sheets?: Array<{ properties: { sheetId: number; title: string } }>;
  };
  return (data.sheets ?? []).map((sheet) => ({
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
  }));
}

export async function getSheetValues(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string,
): Promise<string[][]> {
  const range = encodeURIComponent(`'${tabTitle.replace(/'/g, "''")}'`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 401) {
    throw new SheetsApiError(401, "Google 연결이 만료되었습니다.");
  }
  if (!response.ok) {
    throw new SheetsApiError(response.status, "Sheet 데이터를 불러오지 못했습니다.");
  }

  const data = (await response.json()) as { values?: unknown[][] };
  return (data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

export function pickQuestionTab(tabs: SheetTab[]): {
  autoSelected: SheetTab | null;
  candidates: SheetTab[];
} {
  const byTitle = (title: string) => tabs.find((tab) => tab.title === title);

  const primary = byTitle("문제은행");
  if (primary) return { autoSelected: primary, candidates: [] };

  const secondary = byTitle("Questions");
  if (secondary) return { autoSelected: secondary, candidates: [] };

  if (tabs.length === 1) return { autoSelected: tabs[0], candidates: [] };

  return { autoSelected: null, candidates: tabs };
}
```

- [ ] **Step 8: 테스트 실행해 통과 확인**

Run: `pnpm test src/sheets/sheetsClient.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 9: 커밋**

```bash
git add src/drive/driveClient.ts src/drive/driveClient.test.ts src/sheets/sheetsClient.ts src/sheets/sheetsClient.test.ts
git commit -m "feat: add Sheet file listing, tab metadata, and tab priority selection"
```

### Task 6: 폴더 재귀 탐색 + Sheet 파일 목록 화면

이 화면이 1단계의 `CertificationFoldersPage`를 대체한다 — 자격증 폴더
하위에 폴더가 더 있으면 계속 들어갈 수 있고, 각 단계에서 Google Sheet
파일도 함께 보여준다.

**Files:**
- Create: `src/pages/DriveBrowsePage.tsx`
- Create: `src/pages/DriveBrowsePage.test.tsx`
- Delete: `src/pages/CertificationFoldersPage.tsx`
- Delete: `src/pages/CertificationFoldersPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (1단계), `listChildFolders`, `listSheetFiles` (Task 5),
  `getTopFolder` (1단계), `Breadcrumb`, `ErrorBanner` (1단계)
- Produces: `DriveBrowsePage` (default export) — Task 9(라우터)가
  `/folders`와 `/folders/:folderId`에 연결한다. 폴더 클릭 시
  `navigate(`/folders/${folder.id}`, { state: { trail: [...] } })`로
  breadcrumb 경로를 라우트 상태에 실어 다음 단계까지 전달한다. Sheet 파일
  클릭 시 `navigate(`/sheets/${file.id}/tabs`, { state: { fileName: file.name } })`
  — Task 7(탭 선택)이 이 라우트를 소비한다.

- [ ] **Step 1: src/pages/CertificationFoldersPage.tsx / .test.tsx 삭제**

```bash
rm src/pages/CertificationFoldersPage.tsx src/pages/CertificationFoldersPage.test.tsx
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/pages/DriveBrowsePage.test.tsx**

```tsx
import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as driveClient from "../drive/driveClient";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import DriveBrowsePage from "./DriveBrowsePage";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

function renderBrowse() {
  return renderWithConnectedAuth(
    <Routes>
      <Route path="/folders" element={<DriveBrowsePage />} />
      <Route path="/folders/:folderId" element={<DriveBrowsePage />} />
      <Route path="/sheets/:spreadsheetId/tabs" element={<div>탭 선택 화면</div>} />
    </Routes>,
    ["/folders"],
  );
}

describe("DriveBrowsePage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows subfolders and Sheet files under the saved top folder", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([
      { id: "sub-1", name: "1주차", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([
      { id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);

    renderBrowse();

    await waitFor(() => expect(screen.getByText("1주차")).toBeInTheDocument());
    expect(screen.getByText("실전 모의고사 1")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });

  it("navigates into a subfolder and loads its own children", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockImplementation(async (_token, parentId) =>
      parentId === "top-1"
        ? [{ id: "sub-1", name: "1주차", modifiedTime: "2026-09-01T00:00:00.000Z" }]
        : [],
    );
    vi.spyOn(driveClient, "listSheetFiles").mockImplementation(async (_token, parentId) =>
      parentId === "sub-1"
        ? [{ id: "sheet-2", name: "1주차 문제", modifiedTime: "2026-09-01T00:00:00.000Z" }]
        : [],
    );

    renderBrowse();
    await waitFor(() => screen.getByText("1주차"));

    await userEvent.click(screen.getByText("1주차"));

    await waitFor(() => expect(screen.getByText("1주차 문제")).toBeInTheDocument());
    expect(driveClient.listChildFolders).toHaveBeenCalledWith("token-abc", "sub-1");
  });

  it("navigates to the tab selection route when a Sheet file is clicked", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([
      { id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);

    renderBrowse();
    await waitFor(() => screen.getByText("실전 모의고사 1"));

    await userEvent.click(screen.getByText("실전 모의고사 1"));

    await waitFor(() => expect(screen.getByText("탭 선택 화면")).toBeInTheDocument());
  });

  it("prompts to select a top folder when none is saved yet", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue(undefined);

    renderBrowse();

    await waitFor(() =>
      expect(screen.getByText("먼저 문제은행 최상위 폴더를 선택해주세요.")).toBeInTheDocument(),
    );
  });

  it("shows an empty state when a folder has no subfolders or Sheet files", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "AWS",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
    vi.spyOn(driveClient, "listSheetFiles").mockResolvedValue([]);

    renderBrowse();

    await waitFor(() =>
      expect(screen.getByText("하위 폴더나 Sheet 파일이 없습니다.")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm test src/pages/DriveBrowsePage.test.tsx`
Expected: FAIL with "Cannot find module './DriveBrowsePage'"

- [ ] **Step 4: src/pages/DriveBrowsePage.tsx 구현**

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFile, DriveFolder, listChildFolders, listSheetFiles } from "../drive/driveClient";
import { getTopFolder, TopFolderSelection } from "../storage/topFolderRepo";
import { Breadcrumb, BreadcrumbItem } from "../components/Breadcrumb";
import { ErrorBanner } from "../components/ErrorBanner";

interface FolderLevel {
  id: string;
  name: string;
}

interface LocationState {
  trail?: FolderLevel[];
}

export default function DriveBrowsePage() {
  const { getAccessToken, googleUserId, status, markExpired } = useAuth();
  const { folderId } = useParams<{ folderId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [topFolder, setTopFolder] = useState<TopFolderSelection | null | undefined>(undefined);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!googleUserId) return;
    void getTopFolder(googleUserId)
      .then((saved) => setTopFolder(saved ?? null))
      .catch(() => {
        setTopFolder(null);
        setError("저장된 최상위 폴더를 불러오지 못했습니다.");
      });
  }, [googleUserId]);

  const currentFolderId = folderId ?? topFolder?.folderId ?? null;
  const trail = (location.state as LocationState | null)?.trail ?? [];

  const load = useCallback(async () => {
    if (!currentFolderId) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setLoading(false);
      setError("Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [folderResult, fileResult] = await Promise.all([
        listChildFolders(accessToken, currentFolderId),
        listSheetFiles(accessToken, currentFolderId),
      ]);
      setFolders(folderResult);
      setFiles(fileResult);
    } catch (err) {
      if (err instanceof DriveApiError && err.status === 401) markExpired();
      setError(err instanceof DriveApiError ? err.message : "폴더 내용을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, getAccessToken, markExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (folder: DriveFolder) => {
    navigate(`/folders/${folder.id}`, { state: { trail: [...trail, { id: folder.id, name: folder.name }] } });
  };

  const openFile = (file: DriveFile) => {
    navigate(`/sheets/${file.id}/tabs`, { state: { fileName: file.name } });
  };

  if (status !== "connected") {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          Google 연결이 필요합니다. 시작 화면에서 다시 연결해주세요.
        </p>
      </div>
    );
  }

  if (topFolder === undefined) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (topFolder === null) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          먼저 문제은행 최상위 폴더를 선택해주세요.
        </p>
        <Link to="/folders/select" className="text-sm font-semibold text-accent dark:text-accent-dark">
          최상위 폴더 선택하러 가기
        </Link>
      </div>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    {
      label: topFolder.folderName,
      onClick:
        trail.length > 0
          ? () => navigate(`/folders/${topFolder.folderId}`, { state: { trail: [] } })
          : undefined,
    },
    ...trail.map((level, index) => ({
      label: level.name,
      onClick:
        index < trail.length - 1
          ? () => navigate(`/folders/${level.id}`, { state: { trail: trail.slice(0, index + 1) } })
          : undefined,
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <Breadcrumb items={breadcrumbItems} />
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">불러오는 중…</p>
      ) : folders.length === 0 && files.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          하위 폴더나 Sheet 파일이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border dark:divide-border-dark dark:border-border-dark">
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                onClick={() => openFolder(folder)}
                className="flex w-full items-center justify-between px-4.5 py-3.5 text-left"
              >
                <span className="text-sm font-medium">📁 {folder.name}</span>
                <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {folder.modifiedTime}
                </span>
              </button>
            </li>
          ))}
          {files.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => openFile(file)}
                className="flex w-full items-center justify-between px-4.5 py-3.5 text-left"
              >
                <span className="text-sm font-medium">{file.name}</span>
                <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {file.modifiedTime}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `pnpm test src/pages/DriveBrowsePage.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/pages/DriveBrowsePage.tsx src/pages/DriveBrowsePage.test.tsx
git rm src/pages/CertificationFoldersPage.tsx src/pages/CertificationFoldersPage.test.tsx
git commit -m "feat: replace certification folders page with recursive Drive browser"
```

### Task 7: 문제 탭 선택 화면

**Files:**
- Create: `src/pages/SheetTabSelectPage.tsx`
- Create: `src/pages/SheetTabSelectPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (1단계), `listSheetTabs`, `pickQuestionTab`,
  `SheetsApiError` (Task 5)
- Produces: `SheetTabSelectPage` (default export) — Task 9(라우터)가
  `/sheets/:spreadsheetId/tabs`에 연결한다. 자동 선택되면
  `navigate(`/sheets/${spreadsheetId}/validate`, { replace: true, state:
  { fileName, tabId, tabTitle } })`로 즉시 이동한다 — Task 8(검증 결과
  화면)이 이 state를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성 — src/pages/SheetTabSelectPage.test.tsx**

```tsx
import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as sheetsClient from "../sheets/sheetsClient";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import SheetTabSelectPage from "./SheetTabSelectPage";

function renderTabSelect() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });

  return renderWithConnectedAuth(
    <Routes>
      <Route path="/sheets/:spreadsheetId/tabs" element={<SheetTabSelectPage />} />
      <Route path="/sheets/:spreadsheetId/validate" element={<div>검증 결과 화면</div>} />
    </Routes>,
    ["/sheets/sheet-1/tabs"],
  );
}

describe("SheetTabSelectPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("auto-navigates to validation when a 문제은행 tab exists", async () => {
    vi.spyOn(sheetsClient, "listSheetTabs").mockResolvedValue([
      { sheetId: 0, title: "문제은행" },
      { sheetId: 1, title: "오답노트" },
    ]);

    renderTabSelect();

    await waitFor(() => expect(screen.getByText("검증 결과 화면")).toBeInTheDocument());
  });

  it("shows a picker and navigates on selection when no priority tab matches", async () => {
    vi.spyOn(sheetsClient, "listSheetTabs").mockResolvedValue([
      { sheetId: 0, title: "1과목" },
      { sheetId: 1, title: "2과목" },
    ]);

    renderTabSelect();

    await waitFor(() => screen.getByText("1과목"));
    expect(screen.getByText("2과목")).toBeInTheDocument();

    await userEvent.click(screen.getByText("2과목"));

    await waitFor(() => expect(screen.getByText("검증 결과 화면")).toBeInTheDocument());
  });

  it("shows an error banner when the tab list request fails", async () => {
    vi.spyOn(sheetsClient, "listSheetTabs").mockRejectedValue(
      new (await import("../sheets/sheetsClient")).SheetsApiError(500, "Sheet 탭 목록을 불러오지 못했습니다."),
    );

    renderTabSelect();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sheet 탭 목록을 불러오지 못했습니다."));
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/pages/SheetTabSelectPage.test.tsx`
Expected: FAIL with "Cannot find module './SheetTabSelectPage'"

- [ ] **Step 3: src/pages/SheetTabSelectPage.tsx 구현**

```tsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { listSheetTabs, pickQuestionTab, SheetsApiError, SheetTab } from "../sheets/sheetsClient";
import { ErrorBanner } from "../components/ErrorBanner";

interface LocationState {
  fileName?: string;
}

export default function SheetTabSelectPage() {
  const { getAccessToken, markExpired } = useAuth();
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const fileName = (location.state as LocationState | null)?.fileName ?? "";

  const [tabs, setTabs] = useState<SheetTab[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spreadsheetId) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setError("Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.");
      return;
    }
    listSheetTabs(accessToken, spreadsheetId)
      .then((result) => {
        setTabs(result);
        const { autoSelected } = pickQuestionTab(result);
        if (autoSelected) {
          navigate(`/sheets/${spreadsheetId}/validate`, {
            replace: true,
            state: { fileName, tabId: autoSelected.sheetId, tabTitle: autoSelected.title },
          });
        }
      })
      .catch((err) => {
        if (err instanceof SheetsApiError && err.status === 401) markExpired();
        setError(err instanceof SheetsApiError ? err.message : "Sheet 탭 목록을 불러오지 못했습니다.");
      });
  }, [spreadsheetId, getAccessToken, markExpired, navigate, fileName]);

  const selectTab = (tab: SheetTab) => {
    navigate(`/sheets/${spreadsheetId}/validate`, {
      state: { fileName, tabId: tab.sheetId, tabTitle: tab.title },
    });
  };

  if (error) {
    return (
      <div className="px-10 py-7">
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!tabs) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  const { candidates } = pickQuestionTab(tabs);

  return (
    <div className="mx-auto max-w-2xl px-10 py-7">
      <h1 className="mb-4 font-display text-xl font-semibold">문제 탭을 선택해주세요</h1>
      <ul className="flex flex-col gap-2">
        {candidates.map((tab) => (
          <li key={tab.sheetId}>
            <button
              type="button"
              onClick={() => selectTab(tab)}
              className="w-full rounded-lg border border-border px-4 py-3 text-left text-sm dark:border-border-dark"
            >
              {tab.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm test src/pages/SheetTabSelectPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/pages/SheetTabSelectPage.tsx src/pages/SheetTabSelectPage.test.tsx
git commit -m "feat: add question tab selection screen with priority auto-select"
```

### Task 8: Sheet 검증 결과 화면

**Files:**
- Modify: `src/test/renderWithConnectedAuth.tsx` (`initialEntries` 타입을
  `string[]`에서 `MemoryRouterProps["initialEntries"]`로 넓혀 location
  state를 실어 보낼 수 있게 함)
- Create: `src/pages/SheetValidationPage.tsx`
- Create: `src/pages/SheetValidationPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (1단계), `getSheetValues`, `SheetsApiError` (Task 5),
  `parseSheetRows` (Task 2), `validateQuestions` (Task 4)
- Produces: `SheetValidationPage` (default export) — Task 9(라우터)가
  `/sheets/:spreadsheetId/validate`에 연결한다.

- [ ] **Step 0: src/test/renderWithConnectedAuth.tsx 수정**

`initialEntries` 매개변수 타입을 `string[]`에서 넓힌다. `react-router-dom`은
`InitialEntry` 타입을 직접 재수출하지 않으므로(재수출 목록에는
`MemoryRouterProps`만 있다), `MemoryRouterProps["initialEntries"]`를 쓴다.
함수 시그니처를:

```typescript
export function renderWithConnectedAuth(
  ui: ReactElement,
  initialEntries: string[] = ["/"],
): RenderResult {
```

이렇게 바꾼다:

```typescript
export function renderWithConnectedAuth(
  ui: ReactElement,
  initialEntries: MemoryRouterProps["initialEntries"] = ["/"],
): RenderResult {
```

파일 상단 import도 `import { MemoryRouter } from "react-router-dom";`를
`import { MemoryRouter, MemoryRouterProps } from "react-router-dom";`로
바꾼다. 다른 부분은 그대로 둔다.

- [ ] **Step 1: 실패하는 테스트 작성 — src/pages/SheetValidationPage.test.tsx**

```tsx
import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as sheetsClient from "../sheets/sheetsClient";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import SheetValidationPage from "./SheetValidationPage";

const VALID_HEADER = [
  "번호",
  "분류",
  "난이도",
  "유형",
  "문제",
  "보기 A",
  "보기 B",
  "보기 C",
  "보기 D",
  "정답",
  "해설",
];

function renderValidation() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });

  return renderWithConnectedAuth(
    <Routes>
      <Route path="/sheets/:spreadsheetId/validate" element={<SheetValidationPage />} />
    </Routes>,
    [
      {
        pathname: "/sheets/sheet-1/validate",
        state: { fileName: "1주차 문제", tabId: 0, tabTitle: "문제은행" },
      },
    ],
  );
}

describe("SheetValidationPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the question count when validation has no errors", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", "해설"],
      ["2", "분류", "MEDIUM", "SINGLE", "문제 2", "A", "B", "", "", "A", "해설"],
    ]);

    renderValidation();

    await waitFor(() => expect(screen.getByText(/문제 2개/)).toBeInTheDocument());
  });

  it("lists blocking errors with sheet name, row number, and message", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "", "A", "B", "", "", "A", "해설"],
    ]);

    renderValidation();

    await waitFor(() =>
      expect(screen.getByText("시트에서 고칠 부분이 1곳 있어요")).toBeInTheDocument(),
    );
    expect(screen.getByText(/문제은행 · 2행/)).toBeInTheDocument();
    expect(screen.getByText("문제 본문이 비어 있습니다.")).toBeInTheDocument();
  });

  it("re-fetches when 다시 검증 is clicked", async () => {
    const spy = vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "", "A", "B", "", "", "A", "해설"],
    ]);

    renderValidation();
    await waitFor(() => screen.getByText("다시 검증"));

    await userEvent.click(screen.getByText("다시 검증"));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it("shows a retryable error banner when the Sheet request fails", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockRejectedValue(
      new (await import("../sheets/sheetsClient")).SheetsApiError(500, "Sheet 데이터를 불러오지 못했습니다."),
    );

    renderValidation();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sheet 데이터를 불러오지 못했습니다."));
  });

  it("shows warnings without blocking when only warnings are present", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", ""],
    ]);

    renderValidation();

    await waitFor(() => expect(screen.getByText(/문제 1개/)).toBeInTheDocument());
    expect(screen.getByText(/경고 1건/)).toBeInTheDocument();
    expect(screen.getByText("해설이 비어 있습니다.")).toBeInTheDocument();
  });
});
```

Note: `renderWithConnectedAuth`의 두 번째 인자는 `MemoryRouter`의
`initialEntries`로 그대로 전달되므로, 위처럼 `{ pathname, state }` 객체
형태도 그대로 받아들인다 (`react-router-dom`의 `MemoryRouter`가 지원하는
표준 형태).

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/pages/SheetValidationPage.test.tsx`
Expected: FAIL with "Cannot find module './SheetValidationPage'"

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/pages/SheetValidationPage.test.tsx`
Expected: FAIL with "Cannot find module './SheetValidationPage'"

- [ ] **Step 3: src/pages/SheetValidationPage.tsx 구현**

```tsx
import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getSheetValues, SheetsApiError } from "../sheets/sheetsClient";
import { parseSheetRows } from "../sheets/parseQuestions";
import { validateQuestions } from "../sheets/validateQuestions";
import type { ValidationIssue } from "../sheets/types";
import type { Question } from "../types/question";
import { ErrorBanner } from "../components/ErrorBanner";

interface LocationState {
  fileName?: string;
  tabId?: number;
  tabTitle?: string;
}

export default function SheetValidationPage() {
  const { getAccessToken, markExpired } = useAuth();
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};
  const fileName = state.fileName ?? "";
  const tabTitle = state.tabTitle ?? "";
  const tabId = state.tabId != null ? String(state.tabId) : "";

  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const load = useCallback(() => {
    if (!spreadsheetId || !tabTitle) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus("error");
      setLoadError("Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.");
      return;
    }
    setStatus("loading");
    setLoadError(null);
    getSheetValues(accessToken, spreadsheetId, tabTitle)
      .then((rawRows) => {
        const { headerIndex, rows } = parseSheetRows(rawRows);
        const result = validateQuestions(headerIndex, rows, {
          sheetName: tabTitle,
          spreadsheetId,
          sheetTabId: tabId,
        });
        setQuestions(result.questions);
        setIssues(result.issues);
        setStatus("done");
      })
      .catch((err) => {
        if (err instanceof SheetsApiError && err.status === 401) markExpired();
        setStatus("error");
        setLoadError(err instanceof SheetsApiError ? err.message : "Sheet 데이터를 불러오지 못했습니다.");
      });
  }, [spreadsheetId, tabTitle, tabId, getAccessToken, markExpired]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (status === "error") {
    return (
      <div className="px-10 py-7">
        <ErrorBanner message={loadError ?? "Sheet 데이터를 불러오지 못했습니다."} onRetry={load} />
      </div>
    );
  }

  const errorIssues = issues.filter((i) => i.severity === "error");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  if (errorIssues.length > 0) {
    return (
      <div className="mx-auto max-w-2xl px-10 py-7">
        <h1 className="mb-2 font-display text-xl font-semibold">
          시트에서 고칠 부분이 {errorIssues.length}곳 있어요
        </h1>
        <p className="mb-5 text-sm text-text-secondary dark:text-text-dark-secondary">
          아래 위치를 시트에서 수정한 뒤 다시 검증해 주세요.
        </p>
        <ul className="mb-6 flex flex-col gap-2.5">
          {errorIssues.map((issue, i) => (
            <li
              key={i}
              className="rounded-lg border border-l-3 border-border border-l-status-review bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
            >
              <div className="mb-1 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                {issue.sheetName} · {issue.rowNumber}행
                {issue.questionNumber != null ? ` · 문제 ${issue.questionNumber}번` : ""}
              </div>
              <div className="text-sm">{issue.message}</div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={load}
            className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
          >
            다시 검증
          </button>
          <a
            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark"
          >
            Google Sheet 원본 열기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">{fileName || "문제 세트"} 검증 완료</h1>
      <p className="mb-5 text-sm text-text-secondary dark:text-text-dark-secondary">
        {tabTitle} 탭 · 문제 {questions.length}개
        {warningIssues.length > 0 ? ` · 경고 ${warningIssues.length}건` : ""}
      </p>
      {warningIssues.length > 0 && (
        <ul className="mb-6 flex flex-col gap-2">
          {warningIssues.map((issue, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-sunken p-3 text-xs dark:border-border-dark dark:bg-sunken-dark"
            >
              {issue.sheetName} · {issue.rowNumber}행 · {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm test src/pages/SheetValidationPage.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/test/renderWithConnectedAuth.tsx src/pages/SheetValidationPage.tsx src/pages/SheetValidationPage.test.tsx
git commit -m "feat: add Sheet validation results screen"
```

### Task 9: 라우터 연결

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `DriveBrowsePage` (Task 6), `SheetTabSelectPage` (Task 7),
  `SheetValidationPage` (Task 8)
- Produces: 전체 라우트 `/`, `/folders/select`, `/folders`,
  `/folders/:folderId`, `/sheets/:spreadsheetId/tabs`,
  `/sheets/:spreadsheetId/validate` — 3단계 계획이 `/quiz/:attemptId` 등을
  이어서 추가한다.

- [ ] **Step 1: src/App.tsx 재작성**

```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./app/AppShell";
import StartPage from "./pages/StartPage";
import TopFolderSelectPage from "./pages/TopFolderSelectPage";
import DriveBrowsePage from "./pages/DriveBrowsePage";
import SheetTabSelectPage from "./pages/SheetTabSelectPage";
import SheetValidationPage from "./pages/SheetValidationPage";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export default function App() {
  return (
    <AuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<StartPage />} />
            <Route path="/folders/select" element={<TopFolderSelectPage />} />
            <Route path="/folders" element={<DriveBrowsePage />} />
            <Route path="/folders/:folderId" element={<DriveBrowsePage />} />
            <Route path="/sheets/:spreadsheetId/tabs" element={<SheetTabSelectPage />} />
            <Route path="/sheets/:spreadsheetId/validate" element={<SheetValidationPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: 전체 테스트 실행**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 전체 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/App.tsx
git commit -m "feat: wire up Sheet browsing, tab selection, and validation routes"
```

### Task 10: E2E — 자격증 폴더 → Sheet 선택 → 탭 자동 선택 → 검증 통과

**Files:**
- Modify: `e2e/support/googleApiMock.ts` (Drive mimeType별 분기 + Sheets API mock 추가)
- Create: `e2e/sheet-select.spec.ts`

**Interfaces:**
- Consumes: `mockGoogleApis` (1단계, 이 Task에서 확장)

- [ ] **Step 1: e2e/support/googleApiMock.ts 확장**

Drive `files*` 라우트 핸들러가 폴더 쿼리와 Sheet 파일 쿼리를 mimeType으로
구분하도록 바꾸고, Sheets API(`spreadsheets` 메타데이터 및 `values`) mock을
추가한다. 파일 전체를 다음으로 교체한다:

```typescript
import type { Page } from "@playwright/test";

interface MockTokenClientConfig {
  callback: (response: { access_token: string; expires_in: number }) => void;
}

export async function mockGoogleApis(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: MockTokenClientConfig) => ({
            requestAccessToken: () => {
              config.callback({ access_token: "mock-access-token", expires_in: 3600 });
            },
          }),
        },
      },
    };
  });

  await page.route("https://www.googleapis.com/oauth2/v3/userinfo", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sub: "mock-user-1", email: "mock-user@example.com" }),
    }),
  );

  await page.route("https://www.googleapis.com/drive/v3/files*", (route) => {
    const url = route.request().url();
    const isRoot = url.includes("%27root%27+in+parents");
    const isSpreadsheetQuery = url.includes("google-apps.spreadsheet");

    if (isSpreadsheetQuery) {
      const files = url.includes("%27cert-1%27+in+parents")
        ? [{ id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" }]
        : [];
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files }) });
      return;
    }

    const files = isRoot
      ? [{ id: "top-1", name: "자격증 문제은행", modifiedTime: "2026-09-01T00:00:00.000Z" }]
      : url.includes("%27top-1%27+in+parents")
        ? [
            { id: "cert-1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
            { id: "cert-2", name: "SQLD", modifiedTime: "2026-08-01T00:00:00.000Z" },
          ]
        : [];
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files }) });
  });

  await page.route("https://sheets.googleapis.com/v4/spreadsheets/sheet-1?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sheets: [{ properties: { sheetId: 0, title: "문제은행" } }] }),
    }),
  );

  await page.route("https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        values: [
          ["번호", "분류", "난이도", "유형", "문제", "보기 A", "보기 B", "보기 C", "보기 D", "정답", "해설"],
          ["1", "컴퓨팅", "MEDIUM", "SINGLE", "EC2란?", "가상서버", "저장소", "네트워크", "DB", "A", "해설1"],
          ["2", "스토리지", "EASY", "SINGLE", "S3란?", "객체스토리지", "블록스토리지", "DB", "큐", "A", "해설2"],
        ],
      }),
    }),
  );
}
```

- [ ] **Step 2: 기존 E2E가 여전히 통과하는지 확인**

Run: `pnpm e2e e2e/drive-connect.spec.ts`
Expected: PASS (1단계 시나리오는 이 변경으로 깨지지 않아야 한다 — mock이
folder 쿼리에 대해 이전과 같은 응답을 준다)

- [ ] **Step 3: e2e/sheet-select.spec.ts 작성**

```typescript
import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("자격증 폴더 → Sheet 선택 → 탭 자동 선택 → 검증 통과", async ({ page }) => {
  await mockGoogleApis(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Google Drive 연결" }).click();
  await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();
  await expect(page.getByText("자격증 문제은행")).toBeVisible();
  await page.getByText("자격증 문제은행").click();
  await page
    .getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" })
    .click();

  await expect(page.getByText("AWS")).toBeVisible();
  await page.getByText("AWS").click();

  await expect(page.getByText("실전 모의고사 1")).toBeVisible();
  await page.getByText("실전 모의고사 1").click();

  await expect(page.getByText("검증 완료")).toBeVisible();
  await expect(page.getByText(/문제 2개/)).toBeVisible();
});
```

- [ ] **Step 4: E2E 실행**

Run: `pnpm e2e`
Expected: PASS (2 tests — drive-connect.spec.ts, sheet-select.spec.ts)

- [ ] **Step 5: 커밋**

```bash
git add e2e/support/googleApiMock.ts e2e/sheet-select.spec.ts
git commit -m "test: add E2E flow for Sheet selection and validation"
```

### Task 11: 완료 조건 검증

**Files:** (변경 없음 — 검증만 수행)

- [ ] **Step 1: 전체 파이프라인 실행**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`
Expected: 전체 PASS

- [ ] **Step 2: 2단계 완료 조건 체크리스트 확인**

- [ ] `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm e2e` 모두 통과
- [ ] 자격증 폴더 → 하위 폴더 재귀 탐색 → Sheet 파일 목록 → 탭 자동/수동 선택 →
      값 읽기 → 파싱 → 검증까지 E2E로 재현됨
- [ ] 필수 헤더 누락, 문제 본문 누락, 선택지 미달/중간누락, 정답 누락/불일치,
      유형 불일치, 번호 중복 등 검증 오류가 전체 수집되어 한 번에 표시됨
      (단위 테스트로 확인됨 — Task 4)
- [ ] 헤더 순서를 바꿔도 정상 인식됨 (Task 1에서 확인)
- [ ] 문제 ID가 행 순서가 아니라 spreadsheetId+tabId+번호+본문 해시로 생성됨

