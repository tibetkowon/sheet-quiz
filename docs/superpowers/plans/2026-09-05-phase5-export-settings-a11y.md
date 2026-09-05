# Phase 5: 내보내기·설정·오류 처리·접근성 Implementation Plan

> **For agentic workers:** This plan follows the Claude-Codex 협업 프로세스 defined in
> the spec §14, not `superpowers:subagent-driven-development`. Claude Code dispatches
> each task's instructions to the `codex:codex-rescue` subagent (Codex writes files
> only — it cannot run `pnpm`/`git` in this environment), then Claude Code itself runs
> `pnpm test`/`typecheck`/`lint`/`build`/`e2e`, reviews the diff, and commits before
> moving to the next task. After all tasks, Claude Code dispatches an independent
> adversarial Codex review pass and triages/fixes findings the same way.

**Goal:** Add result export (Markdown/JSON), a history screen, a settings screen with
data deletion, a global error boundary, and a mobile/accessibility pass — closing out
roadmap item 5 of 6 (spec §15).

**Architecture:** Two new pure, unit-testable modules (`quiz/export.ts`,
`sheets/validationExport.ts`) generate text content; pages trigger browser downloads
via a shared `downloadTextFile` helper. Two new routed pages (`/history`, `/settings`)
reuse the existing `attemptRepo`/`topFolderRepo` IndexedDB layer, extended with
`listAttemptsByUser`/`deleteAttempt`. A class-based `ErrorBoundary` wraps the routed
app. Mobile/accessibility fixes are small, targeted edits to already-shipped
components (`ProgressBar`, `QuizPage`'s navigator column, `AppShell` nav).

**Tech Stack:** React 18, TypeScript strict, React Router v6, Tailwind CSS, `idb`,
Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`

## Global Constraints

- No backend, no external DB, no AI calls — everything runs client-side (spec §2).
- Access tokens never touch IndexedDB or any store (spec §9).
- `quiz/grading.ts`-adjacent modules stay pure functions with no side effects where
  the spec calls for it (spec §10) — `quiz/export.ts`'s content builders must not
  touch the DOM; only a separate `downloadTextFile` helper may.
- Dark mode via Tailwind `darkMode: 'class'`; every new element pairs a light class
  with a `dark:` class using the existing tokens (`bg`, `surface`, `sunken`, `border`,
  `text`, `accent`, `status.*`, `danger`) — do not invent new colors (spec §11).
- Follow the established "no `eslint-disable-next-line react-hooks/exhaustive-deps`"
  rule — `eslint-plugin-react-hooks@4.6.2` crashes under ESLint 9 even when the
  warning is suppressed. Always make dependency arrays genuinely exhaustive instead.
- Playwright button-name matchers must use `{ name: "...", exact: true }` once
  multiple buttons share a text prefix (recurring bug in this codebase).
- TDD every step: failing test → verify fail → implement → verify pass → commit.

---

### Task 1: Attempt repo — list by user and delete

**Files:**
- Modify: `src/storage/attemptRepo.ts`
- Modify: `src/storage/attemptRepo.test.ts`

**Interfaces:**
- Consumes: existing `getDb()` from `src/storage/db.ts` (already exposes the
  `attempts` store with a `googleUserId` index, keyPath `id`).
- Produces: `listAttemptsByUser(googleUserId: string): Promise<StudyAttempt[]>`,
  `deleteAttempt(id: string): Promise<void>` — both consumed by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

Add to `src/storage/attemptRepo.test.ts` (keep the existing `makeAttempt` helper and
`beforeEach` as-is):

```typescript
import { deleteAttempt, getAttempt, listAttemptsByUser, saveAttempt } from "./attemptRepo";

// ...inside the existing describe("attemptRepo", ...) block, add:

it("lists only attempts belonging to the given user, most-recent-first not required", async () => {
  await saveAttempt(makeAttempt({ id: "a1", googleUserId: "user-1" }));
  await saveAttempt(makeAttempt({ id: "a2", googleUserId: "user-1" }));
  await saveAttempt(makeAttempt({ id: "a3", googleUserId: "user-2" }));

  const found = await listAttemptsByUser("user-1");

  expect(found.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
});

it("returns an empty array when the user has no attempts", async () => {
  expect(await listAttemptsByUser("nobody")).toEqual([]);
});

it("deletes an attempt by id", async () => {
  await saveAttempt(makeAttempt({ id: "a1" }));
  await deleteAttempt("a1");
  expect(await getAttempt("a1")).toBeUndefined();
});

it("does not throw when deleting an id that does not exist", async () => {
  await expect(deleteAttempt("missing")).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/storage/attemptRepo.test.ts`
Expected: FAIL — `listAttemptsByUser`/`deleteAttempt` are not exported from
`./attemptRepo`.

- [ ] **Step 3: Implement**

Append to `src/storage/attemptRepo.ts`:

```typescript
export async function listAttemptsByUser(googleUserId: string): Promise<StudyAttempt[]> {
  const db = await getDb();
  return db.getAllFromIndex("attempts", "googleUserId", googleUserId);
}

export async function deleteAttempt(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("attempts", id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/storage/attemptRepo.test.ts`
Expected: PASS (8 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/storage/attemptRepo.ts src/storage/attemptRepo.test.ts
git commit -m "feat: add listAttemptsByUser and deleteAttempt to attemptRepo"
```

---

### Task 2: `quiz/export.ts` — Markdown/JSON result builders

**Files:**
- Create: `src/quiz/export.ts`
- Create: `src/quiz/export.test.ts`

**Interfaces:**
- Consumes: `StudyAttempt`, `Question` (`src/types/studyAttempt.ts`,
  `src/types/question.ts`), `computeStudyResult`, `gradeAttempt` (both from
  `src/quiz/grading.ts`, already implemented in Phase 4).
- Produces: `buildResultMarkdown(attempt: StudyAttempt, questions: Question[]): string`,
  `buildResultJson(attempt: StudyAttempt, questions: Question[]): string`,
  `downloadTextFile(filename: string, content: string, mimeType: string): void` — all
  three consumed by Task 3 (ResultsPage) and the first two reused conceptually
  (different builder) by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `src/quiz/export.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildResultJson, buildResultMarkdown } from "./export";
import type { Question } from "../types/question";
import type { StudyAttempt } from "../types/studyAttempt";

const questions: Question[] = [
  {
    id: "q1",
    sourceRow: 2,
    questionNumber: 1,
    category: "컴퓨팅",
    difficulty: "EASY",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: "가상서버 문제",
    options: [
      { key: "A", text: "EC2" },
      { key: "B", text: "S3" },
    ],
    correctAnswers: ["A"],
    explanation: "EC2가 정답입니다.",
  },
  {
    id: "q2",
    sourceRow: 3,
    questionNumber: 2,
    category: "스토리지",
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: "객체스토리지 문제",
    options: [
      { key: "A", text: "EBS" },
      { key: "B", text: "S3" },
    ],
    correctAnswers: ["B"],
    explanation: "S3가 정답입니다.",
  },
];

function makeAttempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "1회차",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    submittedAt: "2026-09-04T01:00:00.000Z",
    progress: [
      { questionId: "q1", selectedAnswers: ["A"], status: "ANSWERED", reviewMarked: false, updatedAt: "2026-09-04T00:30:00.000Z" },
      { questionId: "q2", selectedAnswers: ["A"], status: "ANSWERED", reviewMarked: false, updatedAt: "2026-09-04T00:31:00.000Z" },
    ],
    ...overrides,
  };
}

describe("buildResultMarkdown", () => {
  it("includes the score summary line", () => {
    const md = buildResultMarkdown(makeAttempt(), questions);
    expect(md).toContain("점수: 50% (1/2)");
  });

  it("marks the correct question as 정답 and the wrong one as 오답", () => {
    const md = buildResultMarkdown(makeAttempt(), questions);
    expect(md).toContain("1. 가상서버 문제 (정답)");
    expect(md).toContain("2. 객체스토리지 문제 (오답)");
  });

  it("includes each option's explanation-bearing question explanation text", () => {
    const md = buildResultMarkdown(makeAttempt(), questions);
    expect(md).toContain("EC2가 정답입니다.");
    expect(md).toContain("S3가 정답입니다.");
  });
});

describe("buildResultJson", () => {
  it("produces valid JSON with score and per-question grading", () => {
    const json = buildResultJson(makeAttempt(), questions);
    const parsed = JSON.parse(json);

    expect(parsed.result.scorePercent).toBe(50);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0]).toMatchObject({
      questionNumber: 1,
      isCorrect: true,
      selectedAnswers: ["A"],
      correctAnswers: ["A"],
    });
    expect(parsed.questions[1]).toMatchObject({
      questionNumber: 2,
      isCorrect: false,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/quiz/export.test.ts`
Expected: FAIL — `./export` module does not exist.

- [ ] **Step 3: Implement**

Create `src/quiz/export.ts`:

```typescript
import type { Question } from "../types/question";
import type { StudyAttempt } from "../types/studyAttempt";
import { computeStudyResult, gradeAttempt } from "./grading";

export function buildResultMarkdown(attempt: StudyAttempt, questions: Question[]): string {
  const result = computeStudyResult(questions, attempt.progress);
  const grades = gradeAttempt(questions, attempt.progress);
  const gradeByQuestionId = new Map(grades.map((g) => [g.questionId, g]));

  const lines: string[] = [];
  lines.push(`# ${attempt.certificationFolderName} · ${attempt.sheetTabName}`);
  lines.push("");
  lines.push(`- 점수: ${result.scorePercent}% (${result.correctCount}/${questions.length})`);
  lines.push(`- 오답: ${result.incorrectCount} · 미응답: ${result.unansweredCount}`);
  lines.push(`- 제출 시각: ${attempt.submittedAt ?? "미제출"}`);
  lines.push("");
  lines.push("## 분류별 정답률");
  result.categoryStats.forEach((stat) => lines.push(`- ${stat.name}: ${stat.correct}/${stat.total}`));
  lines.push("");
  lines.push("## 난이도별 정답률");
  result.difficultyStats.forEach((stat) => lines.push(`- ${stat.name}: ${stat.correct}/${stat.total}`));
  lines.push("");
  lines.push("## 문제별 결과");
  questions.forEach((question) => {
    const grade = gradeByQuestionId.get(question.id);
    const label = !grade?.isAnswered ? "미응답" : grade.isCorrect ? "정답" : "오답";
    lines.push(`### ${question.questionNumber}. ${question.text} (${label})`);
    question.options.forEach((option) => {
      const isCorrectOption = question.correctAnswers.includes(option.key);
      const isSelected = grade?.selectedAnswers.includes(option.key) ?? false;
      const marker = isCorrectOption ? "✔" : isSelected ? "✘" : "-";
      lines.push(`- ${marker} ${option.key}. ${option.text}`);
    });
    lines.push("");
    lines.push(question.explanation);
    lines.push("");
  });
  return lines.join("\n");
}

export function buildResultJson(attempt: StudyAttempt, questions: Question[]): string {
  const result = computeStudyResult(questions, attempt.progress);
  const grades = gradeAttempt(questions, attempt.progress);
  const gradeByQuestionId = new Map(grades.map((g) => [g.questionId, g]));

  const payload = {
    certificationFolderName: attempt.certificationFolderName,
    spreadsheetName: attempt.spreadsheetName,
    sheetTabName: attempt.sheetTabName,
    submittedAt: attempt.submittedAt ?? null,
    result,
    questions: questions.map((question) => {
      const grade = gradeByQuestionId.get(question.id);
      return {
        questionNumber: question.questionNumber,
        text: question.text,
        category: question.category ?? null,
        difficulty: question.difficulty,
        selectedAnswers: grade?.selectedAnswers ?? [],
        correctAnswers: question.correctAnswers,
        isCorrect: grade?.isCorrect ?? false,
        explanation: question.explanation,
      };
    }),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const anchor = document.createElement("a");
  anchor.href = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
```

Note: `downloadTextFile` is a browser-effect helper (creates and clicks an anchor) and
is intentionally not unit tested here — it is exercised by the Task 9 E2E test via
Playwright's download event. Do not add a unit test that mocks `document.createElement`
just to cover this function; that would test the DOM API, not our logic.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/quiz/export.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/quiz/export.ts src/quiz/export.test.ts
git commit -m "feat: add Markdown/JSON result export builders"
```

---

### Task 3: Wire export buttons into ResultsPage

**Files:**
- Modify: `src/pages/ResultsPage.tsx`
- Modify: `src/pages/ResultsPage.test.tsx`

**Interfaces:**
- Consumes: `buildResultMarkdown`, `buildResultJson`, `downloadTextFile` from
  `../quiz/export` (Task 2).
- Produces: two visible buttons, "Markdown 다운로드" and "JSON 다운로드", rendered in
  `ResultsPageContent` above the filter chips.

- [ ] **Step 1: Write the failing test**

Add to `src/pages/ResultsPage.test.tsx` (keep existing imports/fixtures; add a new
import and a mock for the export module so the assertion doesn't depend on jsdom's
anchor-click side effects):

```typescript
import * as exportModule from "../quiz/export";

// near the top of the test file, alongside other vi.mock calls if any exist —
// otherwise add this standalone:
vi.mock("../quiz/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../quiz/export")>();
  return { ...actual, downloadTextFile: vi.fn() };
});

// new test inside the existing describe block:
it("downloads a Markdown file with the score when Markdown 다운로드 is clicked", async () => {
  await renderResultsPage(); // use this test file's existing render helper / setup
  fireEvent.click(screen.getByRole("button", { name: "Markdown 다운로드" }));

  expect(exportModule.downloadTextFile).toHaveBeenCalledWith(
    expect.stringMatching(/\.md$/),
    expect.stringContaining("점수:"),
    "text/markdown",
  );
});

it("downloads a JSON file when JSON 다운로드 is clicked", async () => {
  await renderResultsPage();
  fireEvent.click(screen.getByRole("button", { name: "JSON 다운로드" }));

  expect(exportModule.downloadTextFile).toHaveBeenCalledWith(
    expect.stringMatching(/\.json$/),
    expect.stringContaining("\"scorePercent\""),
    "application/json",
  );
});
```

If this test file does not already have a `renderResultsPage` helper or `fireEvent`
import, adapt to whatever setup/render pattern the existing tests in this file use —
reuse the same attempt fixture and rendering call already present, do not introduce a
second unrelated rendering approach.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/pages/ResultsPage.test.tsx`
Expected: FAIL — no button named "Markdown 다운로드" / "JSON 다운로드" exists yet.

- [ ] **Step 3: Implement**

In `src/pages/ResultsPage.tsx`, add the import:

```typescript
import { buildResultJson, buildResultMarkdown, downloadTextFile } from "../quiz/export";
```

Inside `ResultsPageContent`, after computing `result` and before the `rows` filter
computation, add:

```typescript
const downloadMarkdown = () => {
  downloadTextFile(`${attempt.sheetTabName}-result.md`, buildResultMarkdown(attempt, questions), "text/markdown");
};

const downloadJson = () => {
  downloadTextFile(`${attempt.sheetTabName}-result.json`, buildResultJson(attempt, questions), "application/json");
};
```

In the JSX, immediately above the `<div className="mb-4 flex flex-wrap gap-2">` filter
chip row, add:

```tsx
<div className="mb-4 flex gap-2.5">
  <button
    type="button"
    onClick={downloadMarkdown}
    className="rounded border border-border px-3.5 py-2 text-xs dark:border-border-dark"
  >
    Markdown 다운로드
  </button>
  <button
    type="button"
    onClick={downloadJson}
    className="rounded border border-border px-3.5 py-2 text-xs dark:border-border-dark"
  >
    JSON 다운로드
  </button>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/pages/ResultsPage.test.tsx`
Expected: PASS (all existing tests + 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/pages/ResultsPage.tsx src/pages/ResultsPage.test.tsx
git commit -m "feat: add Markdown/JSON export buttons to results screen"
```

---

### Task 4: Validation issue export + copy/download buttons

**Files:**
- Create: `src/sheets/validationExport.ts`
- Create: `src/sheets/validationExport.test.ts`
- Modify: `src/pages/SheetValidationPage.tsx`
- Modify: `src/pages/SheetValidationPage.test.tsx`

**Interfaces:**
- Consumes: `ValidationIssue` (`src/sheets/types.ts`: `{ sheetName: string; rowNumber:
  number; questionNumber: number | null; field: string; message: string; severity:
  "error" | "warning" }`), `downloadTextFile` from `../quiz/export` (Task 2).
- Produces: `buildValidationIssuesMarkdown(issues: ValidationIssue[]): string`.

- [ ] **Step 1: Write the failing test**

Create `src/sheets/validationExport.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildValidationIssuesMarkdown } from "./validationExport";
import type { ValidationIssue } from "./types";

const issues: ValidationIssue[] = [
  { sheetName: "1회차", rowNumber: 4, questionNumber: 3, field: "correctAnswers", message: "정답이 없습니다.", severity: "error" },
  { sheetName: "1회차", rowNumber: 7, questionNumber: null, field: "options", message: "선택지가 비어 있습니다.", severity: "warning" },
];

describe("buildValidationIssuesMarkdown", () => {
  it("includes a header line", () => {
    expect(buildValidationIssuesMarkdown([])).toContain("# 시트 검증 결과");
  });

  it("includes severity, location, and message for each issue", () => {
    const md = buildValidationIssuesMarkdown(issues);
    expect(md).toContain("[error] 1회차 · 4행 · 문제 3번: 정답이 없습니다.");
    expect(md).toContain("[warning] 1회차 · 7행: 선택지가 비어 있습니다.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sheets/validationExport.test.ts`
Expected: FAIL — `./validationExport` module does not exist.

- [ ] **Step 3: Implement**

Create `src/sheets/validationExport.ts`:

```typescript
import type { ValidationIssue } from "./types";

export function buildValidationIssuesMarkdown(issues: ValidationIssue[]): string {
  const lines: string[] = ["# 시트 검증 결과", ""];
  issues.forEach((issue) => {
    const location = [issue.sheetName, `${issue.rowNumber}행`, issue.questionNumber != null ? `문제 ${issue.questionNumber}번` : null]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    lines.push(`- [${issue.severity}] ${location}: ${issue.message}`);
  });
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/sheets/validationExport.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the SheetValidationPage buttons — write the failing test**

Add to `src/pages/SheetValidationPage.test.tsx`, in the existing test block that
renders the page with error-severity issues present (reuse whatever fixture already
produces `errorIssues.length > 0`):

```typescript
it("copies the error list to the clipboard and shows confirmation", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  // render with the existing error-fixture setup used by this file's other
  // "고칠 부분이" tests

  await userEvent.click(screen.getByRole("button", { name: "오류 목록 복사" }));

  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# 시트 검증 결과"));
  await screen.findByText("복사됨");
});
```

Adapt the render call in this new test to match whichever existing helper in this
file renders the page with 1+ error-severity issues (do not duplicate a whole new
render setup if one already exists for the error-screen tests).

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run src/pages/SheetValidationPage.test.tsx`
Expected: FAIL — no button named "오류 목록 복사" exists yet.

- [ ] **Step 7: Implement the buttons**

In `src/pages/SheetValidationPage.tsx`, add imports:

```typescript
import { buildValidationIssuesMarkdown } from "../sheets/validationExport";
import { downloadTextFile } from "../quiz/export";
```

Add local state near the top of the component function:

```typescript
const [copied, setCopied] = useState(false);
```

(Add `useState` to the existing `import { useCallback, useEffect, useState } from
"react";` line — `useState` is not currently imported in this file, confirm and add it
if missing.)

Add handlers inside the component, above the `if (status === "loading")` guard:

```typescript
const copyIssuesList = async () => {
  await navigator.clipboard.writeText(buildValidationIssuesMarkdown(errorIssues.length > 0 ? errorIssues : issues));
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};

const downloadIssuesList = () => {
  downloadTextFile("sheet-validation-issues.md", buildValidationIssuesMarkdown(errorIssues.length > 0 ? errorIssues : issues), "text/markdown");
};
```

Note: `errorIssues`/`issues` are computed after the early-return guards in the current
file (`const errorIssues = issues.filter(...)` appears just before the `if
(errorIssues.length > 0)` block) — move the `copyIssuesList`/`downloadIssuesList`
handler definitions to just after that `errorIssues`/`warningIssues` computation, not
above the loading/error guards, since they close over `errorIssues`.

In the JSX inside the `if (errorIssues.length > 0)` return block, add two buttons next
to the existing "다시 검증"/"Google Sheet 원본 열기" ones:

```tsx
<div className="flex gap-2.5">
  <button type="button" onClick={load} className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark">
    다시 검증
  </button>
  <button type="button" onClick={() => void copyIssuesList()} className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark">
    {copied ? "복사됨" : "오류 목록 복사"}
  </button>
  <button type="button" onClick={downloadIssuesList} className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark">
    Markdown 다운로드
  </button>
  <a href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`} target="_blank" rel="noreferrer" className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark">
    Google Sheet 원본 열기
  </a>
</div>
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm vitest run src/pages/SheetValidationPage.test.tsx`
Expected: PASS (all existing tests + 1 new one)

- [ ] **Step 9: Commit**

```bash
git add src/sheets/validationExport.ts src/sheets/validationExport.test.ts \
  src/pages/SheetValidationPage.tsx src/pages/SheetValidationPage.test.tsx
git commit -m "feat: add copy/Markdown export for sheet validation issues"
```

---

### Task 5: History screen (`/history`)

**Files:**
- Create: `src/pages/HistoryPage.tsx`
- Create: `src/pages/HistoryPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app/AppShell.tsx`

**Interfaces:**
- Consumes: `listAttemptsByUser`, `deleteAttempt` (`../storage/attemptRepo`, Task 1),
  `summarizeProgress` (`../quiz/navigation`, already implemented — returns `{ total,
  answered, unseen, held, flagged }`), `useAuth()` (`googleUserId`).
- Produces: the `/history` route and an "기록" nav link, consumed only by end users
  (no downstream task consumes this page's internals).

- [ ] **Step 1: Write the failing tests**

Create `src/pages/HistoryPage.test.tsx`:

```typescript
import { Route, Routes } from "react-router-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as attemptRepo from "../storage/attemptRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import HistoryPage from "./HistoryPage";
import type { StudyAttempt } from "../types/studyAttempt";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

function makeAttempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "1회차",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: [],
    ...overrides,
  };
}

function renderPage() {
  return renderWithConnectedAuth(
    <Routes>
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/quiz/:attemptId" element={<div>퀴즈 화면</div>} />
      <Route path="/results/:attemptId" element={<div>결과 화면</div>} />
    </Routes>,
    ["/history"],
  );
}

describe("HistoryPage", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockAuthenticated();
    vi.spyOn(attemptRepo, "deleteAttempt").mockResolvedValue(undefined);
  });

  it("shows an in-progress attempt with a 이어서 풀기 action", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt()]);
    renderPage();

    await screen.findByText(/AWS · 1회차/);
    expect(screen.getByRole("button", { name: "이어서 풀기" })).toBeInTheDocument();
  });

  it("shows a submitted attempt with a 결과 보기 action and its score", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([
      makeAttempt({
        submittedAt: "2026-09-04T02:00:00.000Z",
        result: { scorePercent: 80, correctCount: 4, incorrectCount: 1, unansweredCount: 0, categoryStats: [], difficultyStats: [] },
      }),
    ]);
    renderPage();

    await screen.findByRole("button", { name: "결과 보기" });
    expect(screen.getByText(/80%/)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no saved attempts", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([]);
    renderPage();

    await screen.findByText("아직 저장된 풀이 기록이 없습니다.");
  });

  it("deletes an attempt after confirmation and refreshes the list", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser")
      .mockResolvedValueOnce([makeAttempt()])
      .mockResolvedValueOnce([]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await screen.findByText(/AWS · 1회차/);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("attempt-1"));
    await screen.findByText("아직 저장된 풀이 기록이 없습니다.");
  });

  it("does not delete when the user cancels the confirmation", async () => {
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt()]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();

    await screen.findByText(/AWS · 1회차/);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(attemptRepo.deleteAttempt).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/pages/HistoryPage.test.tsx`
Expected: FAIL — `./HistoryPage` does not exist.

- [ ] **Step 3: Implement the page**

Create `src/pages/HistoryPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { deleteAttempt, listAttemptsByUser } from "../storage/attemptRepo";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";

export default function HistoryPage() {
  const { googleUserId } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<StudyAttempt[] | null>(null);

  const load = useCallback(() => {
    if (!googleUserId) return;
    listAttemptsByUser(googleUserId).then((found) => {
      setAttempts(found.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    });
  }, [googleUserId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!googleUserId) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          Google 계정을 연결하면 저장된 풀이 기록을 볼 수 있습니다.
        </p>
        <Link to="/" className="text-sm font-semibold text-accent dark:text-accent-dark">
          시작 화면으로 이동
        </Link>
      </div>
    );
  }

  if (attempts === null) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 풀이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
    await deleteAttempt(id);
    load();
  };

  return (
    <div className="mx-auto max-w-2xl px-10 py-7">
      <h1 className="mb-5 font-display text-xl font-semibold">저장된 풀이 기록</h1>
      {attempts.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          아직 저장된 풀이 기록이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {attempts.map((attempt) => {
            const summary = summarizeProgress(attempt.progress);
            const isSubmitted = Boolean(attempt.result);
            return (
              <li
                key={attempt.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {attempt.certificationFolderName} · {attempt.sheetTabName}
                  </div>
                  <div className="text-xs text-text-secondary dark:text-text-dark-secondary">
                    {isSubmitted
                      ? `제출완료 · ${attempt.result!.scorePercent}%`
                      : `진행 중 · ${summary.answered}/${summary.total}`}
                    {" · "}
                    {new Date(attempt.updatedAt).toLocaleDateString("ko-KR")}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(isSubmitted ? `/results/${attempt.id}` : `/quiz/${attempt.id}`)}
                    className="rounded border border-border px-3 py-1.5 text-xs dark:border-border-dark"
                  >
                    {isSubmitted ? "결과 보기" : "이어서 풀기"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(attempt.id)}
                    className="rounded border border-danger px-3 py-1.5 text-xs text-danger"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/pages/HistoryPage.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire the route and nav link**

In `src/App.tsx`, add the import `import HistoryPage from "./pages/HistoryPage";` and
add `<Route path="/history" element={<HistoryPage />} />` after the
`/results/:attemptId` route.

In `src/app/AppShell.tsx`, add a nav link between the logo `Link` and the theme
toggle button:

```tsx
<nav className="flex items-center gap-4 text-[13px] font-semibold text-text-secondary dark:text-text-dark-secondary">
  <Link to="/history" className="hover:text-text dark:hover:text-text-dark">
    기록
  </Link>
</nav>
```

Place this `<nav>` between the existing logo `<Link>` and the theme-toggle `<button>`
inside the `<header>` (the header is currently `justify-between` with two children —
it becomes three: logo, nav, theme button — adjust to
`className="flex items-center justify-between gap-4 ..."` on the header if needed so
all three fit without wrapping oddly on narrow screens).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS / clean (AppShell has no dedicated test file today — confirm with `find
src/app -name "*.test.tsx"` before assuming; if one exists, update it for the new nav
link and re-run).

- [ ] **Step 7: Commit**

```bash
git add src/pages/HistoryPage.tsx src/pages/HistoryPage.test.tsx src/App.tsx src/app/AppShell.tsx
git commit -m "feat: add history screen listing saved attempts"
```

---

### Task 6: Settings screen (`/settings`)

**Files:**
- Create: `src/pages/SettingsPage.tsx`
- Create: `src/pages/SettingsPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app/AppShell.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`email`, `googleUserId`, `disconnect`), `clearTopFolder`
  (`../storage/topFolderRepo`, already implemented), `listAttemptsByUser`,
  `deleteAttempt` (`../storage/attemptRepo`, Task 1).
- Produces: the `/settings` route and a "설정" nav link.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/SettingsPage.test.tsx`:

```typescript
import { Route, Routes } from "react-router-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as attemptRepo from "../storage/attemptRepo";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import SettingsPage from "./SettingsPage";
import type { StudyAttempt } from "../types/studyAttempt";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

function makeAttempt(id: string): StudyAttempt {
  return {
    id,
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "1회차",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: [],
  };
}

function renderPage() {
  return renderWithConnectedAuth(
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={<div>시작 화면</div>} />
      <Route path="/folders/select" element={<div>최상위 폴더 선택 화면</div>} />
    </Routes>,
    ["/settings"],
  );
}

describe("SettingsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "clearTopFolder").mockResolvedValue(undefined);
    vi.spyOn(attemptRepo, "deleteAttempt").mockResolvedValue(undefined);
    vi.spyOn(attemptRepo, "listAttemptsByUser").mockResolvedValue([makeAttempt("a1"), makeAttempt("a2")]);
  });

  it("shows the connected account email", async () => {
    renderPage();
    await screen.findByText("user@example.com");
  });

  it("resets the top folder and navigates to folder selection", async () => {
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "폴더 다시 선택" }));

    await waitFor(() => expect(topFolderRepo.clearTopFolder).toHaveBeenCalledWith("user-1"));
    await screen.findByText("최상위 폴더 선택 화면");
  });

  it("deletes all attempts and clears the top folder after confirming, then returns to start", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    await waitFor(() => {
      expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a1");
      expect(attemptRepo.deleteAttempt).toHaveBeenCalledWith("a2");
      expect(topFolderRepo.clearTopFolder).toHaveBeenCalledWith("user-1");
    });
    await screen.findByText("시작 화면");
  });

  it("does not delete anything when the user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await screen.findByText("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));

    expect(attemptRepo.deleteAttempt).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/pages/SettingsPage.test.tsx`
Expected: FAIL — `./SettingsPage` does not exist.

- [ ] **Step 3: Implement the page**

Create `src/pages/SettingsPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { clearTopFolder } from "../storage/topFolderRepo";
import { deleteAttempt, listAttemptsByUser } from "../storage/attemptRepo";

export default function SettingsPage() {
  const { googleUserId, email, disconnect } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const resetTopFolder = async () => {
    if (!googleUserId) return;
    setBusy(true);
    try {
      await clearTopFolder(googleUserId);
      navigate("/folders/select");
    } finally {
      setBusy(false);
    }
  };

  const deleteAllData = async () => {
    if (!googleUserId) return;
    if (!window.confirm("저장된 모든 풀이 기록과 폴더 설정을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusy(true);
    try {
      const attempts = await listAttemptsByUser(googleUserId);
      await Promise.all(attempts.map((attempt) => deleteAttempt(attempt.id)));
      await clearTopFolder(googleUserId);
      disconnect();
      navigate("/");
    } finally {
      setBusy(false);
    }
  };

  if (!googleUserId) {
    return (
      <div className="px-10 py-7">
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          Google 계정을 연결하면 설정을 볼 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">설정</h1>
      <p className="mb-6 text-sm text-text-secondary dark:text-text-dark-secondary">{email}</p>

      <div className="mb-4 rounded-lg border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark">
        <div className="mb-1 text-sm font-semibold">최상위 폴더 재설정</div>
        <p className="mb-3 text-xs text-text-secondary dark:text-text-dark-secondary">
          문제은행으로 사용할 Drive 최상위 폴더를 다시 선택합니다.
        </p>
        <button
          type="button"
          onClick={() => void resetTopFolder()}
          disabled={busy}
          className="rounded border border-border px-3.5 py-2 text-xs disabled:opacity-60 dark:border-border-dark"
        >
          폴더 다시 선택
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-danger bg-surface p-5 dark:bg-surface-dark">
        <div className="mb-1 text-sm font-semibold text-danger">전체 데이터 삭제</div>
        <p className="mb-3 text-xs text-text-secondary dark:text-text-dark-secondary">
          저장된 모든 풀이 기록과 폴더 설정을 브라우저에서 삭제하고 연결을 해제합니다.
        </p>
        <button
          type="button"
          onClick={() => void deleteAllData()}
          disabled={busy}
          className="rounded border border-danger px-3.5 py-2 text-xs text-danger disabled:opacity-60"
        >
          모든 데이터 삭제
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/pages/SettingsPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the route and nav link**

In `src/App.tsx`, add `import SettingsPage from "./pages/SettingsPage";` and
`<Route path="/settings" element={<SettingsPage />} />` after the `/history` route
added in Task 5.

In `src/app/AppShell.tsx`, add a second link inside the `<nav>` added in Task 5:

```tsx
<Link to="/settings" className="hover:text-text dark:hover:text-text-dark">
  설정
</Link>
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS / clean

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx src/App.tsx src/app/AppShell.tsx
git commit -m "feat: add settings screen with top-folder reset and full data deletion"
```

---

### Task 7: Global error boundary

**Files:**
- Create: `src/app/ErrorBoundary.tsx`
- Create: `src/app/ErrorBoundary.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: nothing project-specific (standard React error boundary lifecycle).
- Produces: `ErrorBoundary` component wrapping the routed app in `src/App.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/ErrorBoundary.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>정상 화면</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상 화면")).toBeInTheDocument();
  });

  it("renders a fallback screen when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("문제가 발생했어요")).toBeInTheDocument();
  });

  it("navigates to the start screen when the reset button is clicked", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    });
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작 화면으로 돌아가기" }));
    expect(assignSpy).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/app/ErrorBoundary.test.tsx`
Expected: FAIL — `./ErrorBoundary` does not exist.

- [ ] **Step 3: Implement**

Create `src/app/ErrorBoundary.tsx`:

```tsx
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Unhandled error in 풀이장:", error);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
    window.location.assign("/");
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-10 text-center">
          <h1 className="font-display text-xl font-semibold">문제가 발생했어요</h1>
          <p className="max-w-sm text-sm text-text-secondary dark:text-text-dark-secondary">
            예기치 못한 오류로 화면을 표시할 수 없습니다. 시작 화면으로 돌아가 다시
            시도해주세요.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
          >
            시작 화면으로 돌아가기
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/app/ErrorBoundary.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into App.tsx**

In `src/App.tsx`, import `{ ErrorBoundary }` from `./app/ErrorBoundary` and wrap the
`<AppShell>` element with it, inside `<BrowserRouter>`:

```tsx
<BrowserRouter>
  <ErrorBoundary>
    <AppShell>
      <Routes>
        {/* ...unchanged... */}
      </Routes>
    </AppShell>
  </ErrorBoundary>
</BrowserRouter>
```

- [ ] **Step 6: Run the full suite, typecheck, lint, build**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean

- [ ] **Step 7: Commit**

```bash
git add src/app/ErrorBoundary.tsx src/app/ErrorBoundary.test.tsx src/App.tsx
git commit -m "feat: add a global error boundary with a recovery screen"
```

---

### Task 8: Mobile navigator collapse + ProgressBar accessibility

**Files:**
- Modify: `src/pages/QuizPage.tsx`
- Modify: `src/pages/QuizPage.test.tsx`
- Modify: `src/components/ProgressBar.tsx`
- Modify: `src/components/ProgressBar.test.tsx`

**Interfaces:**
- Consumes: nothing new — this task only rearranges JSX/adds ARIA attributes to
  already-implemented components.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing ProgressBar test**

Add to `src/components/ProgressBar.test.tsx`:

```typescript
it("exposes progressbar ARIA attributes for screen readers", () => {
  render(<ProgressBar percent={40} />);
  const bar = screen.getByRole("progressbar");
  expect(bar).toHaveAttribute("aria-valuenow", "40");
  expect(bar).toHaveAttribute("aria-valuemin", "0");
  expect(bar).toHaveAttribute("aria-valuemax", "100");
});
```

This file currently imports `render` from `@testing-library/react` but not `screen` —
add `screen` to that import.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/ProgressBar.test.tsx`
Expected: FAIL — no element with role `progressbar`.

- [ ] **Step 3: Implement**

Update `src/components/ProgressBar.tsx`:

```tsx
export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sunken dark:bg-sunken-dark"
    >
      <div className="h-full rounded-full bg-accent dark:bg-accent-dark" style={{ width: `${clamped}%` }} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/ProgressBar.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing QuizPage test for the mobile collapse toggle**

Add to `src/pages/QuizPage.test.tsx`, inside the existing describe block, reusing this
file's existing `makeQuestion`/`makeAttempt`/render setup:

```typescript
it("shows a collapse toggle for the question navigator that starts expanded", async () => {
  // render exactly as the file's other passing tests do (existing helper/setup)
  const toggle = await screen.findByRole("button", { name: "문제 네비게이터 접기" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");

  await userEvent.click(toggle);
  expect(await screen.findByRole("button", { name: "문제 네비게이터 펼치기" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
```

Adapt the render call to reuse this file's existing attempt-loading setup instead of
introducing a new one.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run src/pages/QuizPage.test.tsx`
Expected: FAIL — no button named "문제 네비게이터 접기" exists yet.

- [ ] **Step 7: Implement the collapse toggle**

In `src/pages/QuizPage.tsx`, inside `QuizPageContent`, add state next to the existing
`showExplanation` state:

```typescript
const [navigatorOpen, setNavigatorOpen] = useState(true);
```

Replace the current right-column `<div className="flex flex-col gap-3">...</div>`
block (containing `<QuestionNavigatorGrid .../>` and the quick-jump button group) with:

```tsx
<div className="flex flex-col gap-3">
  <button
    type="button"
    onClick={() => setNavigatorOpen((prev) => !prev)}
    aria-expanded={navigatorOpen}
    aria-controls="question-navigator-panel"
    className="rounded border border-border px-3 py-2 text-left text-xs lg:hidden dark:border-border-dark"
  >
    {navigatorOpen ? "문제 네비게이터 접기" : "문제 네비게이터 펼치기"}
  </button>
  <div id="question-navigator-panel" className={`flex-col gap-3 lg:flex ${navigatorOpen ? "flex" : "hidden"}`}>
    <QuestionNavigatorGrid items={navigatorItems} onJump={goToIndex} />
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 dark:border-border-dark dark:bg-surface-dark">
      <button
        type="button"
        onClick={goNextUnseen}
        disabled={progressSummary.unseen === 0}
        className="rounded border border-border px-3 py-2 text-left text-xs disabled:opacity-40 dark:border-border-dark"
      >
        다음 미응답 문제로 이동
      </button>
      <button
        type="button"
        onClick={goNextHeld}
        disabled={progressSummary.held === 0}
        className="rounded border border-border px-3 py-2 text-left text-xs disabled:opacity-40 dark:border-border-dark"
      >
        다음 보류 문제로 이동
      </button>
      <button
        type="button"
        onClick={goNextFlagged}
        disabled={progressSummary.flagged === 0}
        className="rounded border border-border px-3 py-2 text-left text-xs disabled:opacity-40 dark:border-border-dark"
      >
        다음 다시 볼 문제로 이동
      </button>
    </div>
  </div>
</div>
```

On screens at or above the `lg` breakpoint, `lg:flex` always shows the panel
regardless of `navigatorOpen` (the toggle button itself is hidden there via
`lg:hidden`, so desktop users never see a collapsed navigator). Below `lg`, the panel
visibility follows `navigatorOpen`, defaulting to expanded.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm vitest run src/pages/QuizPage.test.tsx`
Expected: PASS (all existing tests + 1 new one)

- [ ] **Step 9: Run the full suite, typecheck, lint, build**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean

- [ ] **Step 10: Commit**

```bash
git add src/pages/QuizPage.tsx src/pages/QuizPage.test.tsx \
  src/components/ProgressBar.tsx src/components/ProgressBar.test.tsx
git commit -m "feat: add mobile navigator collapse toggle and progressbar ARIA attributes"
```

---

### Task 9: E2E coverage for export, history, and settings

**Files:**
- Create: `e2e/history-settings-flow.spec.ts`

**Interfaces:**
- Consumes: `mockGoogleApis` from `./support/googleApiMock` (existing helper reused by
  every prior E2E spec in this repo).

- [ ] **Step 1: Write the test**

Create `e2e/history-settings-flow.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("결과 내보내기, 기록 목록, 설정에서 데이터 삭제", async ({ page }) => {
  await mockGoogleApis(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Google Drive 연결" }).click();
  await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();
  await page.getByText("자격증 문제은행").click();
  await page.getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" }).click();
  await page.getByText("AWS").click();
  await page.getByText("실전 모의고사 1").click();

  await expect(page.getByText("검증 완료")).toBeVisible();
  await page.getByRole("button", { name: "풀이 시작" }).click();

  await expect(page.getByText("문제 1 / 2")).toBeVisible();
  await page.getByText("가상서버").click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("문제 2 / 2")).toBeVisible();
  await page.getByText("객체스토리지").click();
  await expect(page.getByText("저장됨")).toBeVisible();

  await page.getByRole("button", { name: "제출하기" }).click();
  await expect(page.getByText("제출하기 전에 확인하세요")).toBeVisible();
  await page.getByRole("button", { name: "제출하기" }).click();
  await expect(page.getByText("100%")).toBeVisible();

  const [mdDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Markdown 다운로드" }).click(),
  ]);
  expect(mdDownload.suggestedFilename()).toMatch(/\.md$/);

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON 다운로드" }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/);

  await page.getByRole("link", { name: "기록" }).click();
  await expect(page.getByText(/AWS · 문제은행/)).toBeVisible();
  await expect(page.getByText(/100%/)).toBeVisible();

  await page.getByRole("link", { name: "설정" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "모든 데이터 삭제" }).click();
  await expect(page.getByText("Google Drive 연결")).toBeVisible();
});
```

Before writing this file, run `cat e2e/support/googleApiMock.ts` to confirm the fixed
folder/spreadsheet/tab names still match what the mock returns — the earlier
`quiz-flow.spec.ts`/`results-flow.spec.ts` specs already depend on these same names,
so this is only a sanity check, not new fixture work. Note the mock's spreadsheet
*file* name is "실전 모의고사 1" but its sheet *tab* title is "문제은행" — the
history entry format is `${certificationFolderName} · ${sheetTabName}`, i.e. `AWS ·
문제은행`, not `AWS · 실전 모의고사 1` (that would be the file name, which
`HistoryPage` does not display).

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm e2e e2e/history-settings-flow.spec.ts`
Expected: PASS

- [ ] **Step 3: Run the entire E2E suite to confirm no regressions**

Run: `pnpm e2e`
Expected: all specs PASS (drive-connect, sheet-select, quiz-flow, results-flow,
history-settings-flow)

- [ ] **Step 4: Commit**

```bash
git add e2e/history-settings-flow.spec.ts
git commit -m "test: add E2E coverage for export, history, and settings deletion"
```

---

## Self-Review

**Spec coverage:**
- Markdown/JSON 내보내기 → Tasks 2, 3 (results screen), 4 (validation issues, using
  the same `downloadTextFile` helper — spec §11 lists "검증 오류 화면의 부가 버튼
  (오류 목록 복사/Markdown 다운로드/원본 열기)" and "결과 화면의 내보내기 버튼" as
  explicitly uncovered-by-design items to build in this phase).
- 설정/데이터 삭제 → Task 6 (`/settings`), backed by Task 1's `deleteAttempt`/
  `listAttemptsByUser`.
- 오류 처리 → Task 7 (global `ErrorBoundary` for uncaught render errors — the
  narrowest real gap remaining, since API-call error handling was already built in
  Phases 1-4 via `ErrorBanner`/`SheetsApiError`/`GoogleAuthError`).
- 모바일/접근성 → Task 8 (mobile navigator collapse — spec §11's explicitly-listed
  "모바일 네비게이터 접기" gap — plus `ProgressBar` ARIA attributes; global
  focus-visible ring and `prefers-reduced-motion` handling already exist in
  `src/index.css` from an earlier phase, so this task does not re-do that work).
- `/history` route (spec §6 routing table) → Task 5, added because Task 6's data
  deletion needs a way to see and act on individual saved attempts, and the route was
  already reserved in the spec's routing table without an owning phase.

**Placeholder scan:** No TBD/TODO markers; every step has runnable code and an exact
command.

**Type consistency:** `listAttemptsByUser`/`deleteAttempt` (Task 1) match the exact
names/signatures used in Tasks 5 and 6. `buildResultMarkdown`/`buildResultJson`/
`downloadTextFile` (Task 2) match the exact names/signatures used in Task 3.
`buildValidationIssuesMarkdown` (Task 4) is self-contained to that task. `StudyResult`/
`CategoryStat`/`DifficultyStat` fixtures in Tasks 2, 5, and 6 match the real shape in
`src/types/studyAttempt.ts` (`scorePercent`, `correctCount`, `incorrectCount`,
`unansweredCount`, `categoryStats`, `difficultyStats`).

**Scope check:** All 9 tasks are additive to already-shipped Phase 1-4 code; no task
depends on unimplemented future-phase work. Phase 6 (test hardening, independent
review, README, production build verification) is intentionally left untouched.
