# Phase 3: 문제풀이 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a connected user start a quiz from a validated Sheet, answer single/multiple-choice questions, track per-question status (안 봄/답변완료/보류/다시 볼 문제) and navigate between questions, with progress autosaved to IndexedDB and resumable on return.

**Architecture:** A `StudyAttempt` record (already typed in `src/types/studyAttempt.ts`) is created the first time a user starts a validated question set and stored in a new IndexedDB `attempts` object store. `SheetValidationPage` gains a "풀이 시작" action that computes a deterministic `attemptId`, creates or looks up the attempt, and routes to `/quiz/:attemptId` (fresh/no-progress attempts) or `/quiz/:attemptId/resume` (attempts with existing progress). `QuizPage` loads the attempt straight from IndexedDB by route param (never from router state, so direct navigation and refresh both work) and mounts a `QuizProvider` that owns the in-memory `StudyAttempt` state, exposes pure navigation/answer-mutation helpers, and autosaves to IndexedDB on a debounce. All state-mutation and navigation logic is implemented as pure, independently-tested functions in `src/quiz/`; React components stay thin renderers over that state.

**Tech Stack:** React 18 + TypeScript (strict), React Router v6, `idb`, Tailwind CSS (existing design tokens from `docs/design/handoff/design-tokens.md`), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md` (sections 5 "QuizContext", 7 "핵심 데이터 모델", 9 "IndexedDB 스키마", 10 "채점 엔진" — grading itself is Phase 4, not built here — and 15 item 3 "문제풀이 UI, 단일/복수 정답, 문제 상태, IndexedDB 자동저장, 이어풀기").

## Global Constraints

- No global state library — Context + hooks only (spec §5).
- Access tokens never touch IndexedDB or any persisted store (spec §2, §9).
- `StudyAttempt.id` is a stable key derived from `googleUserId + spreadsheetId + sheetTabId + fingerprint` (spec §6, §7).
- Grading, submission, and the confirm/results screens are **out of scope** for this phase — they are Phase 4 per the roadmap (spec §15 items 3 vs 4). The "제출하기" button from the design mockup is intentionally **not** built yet; do not add it.
- Design tokens (`tailwind.config.js`) are already wired up — reuse `bg`, `surface`, `sunken`, `border`, `text`, `accent`, `status.*`, `danger`, `font-display`/`font-mono`, `shadow-card`. Do not invent new colors.
- The 5-question-state visual coding must combine color + icon + border (not color alone) per spec §11's accessibility note.
- Every new pure-logic module goes in `src/quiz/` (per spec §4 folder structure) and is unit-tested with Vitest; page components go in `src/pages/`; small reusable visual pieces go in `src/components/`.
- Follow existing repo conventions exactly: `renderWithConnectedAuth` test harness, `vi.spyOn` module mocking (not `vi.mock`), Tailwind utility classes inline (no CSS modules), `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm e2e` must all stay green.

## Design decisions worth flagging up front

These fill gaps the spec and design mockup leave open. They are deliberate, not oversights — call them out in the completion report.

1. **`questionSnapshot` is populated at attempt *creation*, not only at submission.** The spec's comment on `StudyAttempt.questionSnapshot` says "제출 시점 스냅샷" (submit-time snapshot), written with Phase 4 in mind. But `/quiz/:attemptId` must be enterable by URL alone (refresh, resume later) without a live Sheet re-fetch, so the full `Question[]` array is saved into `questionSnapshot` as soon as the attempt is created. Phase 4's submission step can simply leave this field as-is (it already holds the snapshot).
2. **Reused instead of duplicated fingerprint code.** Spec §8 mentions `quiz/fingerprint.ts`; Phase 2 already implemented equivalent logic in `src/sheets/fingerprint.ts` (`createQuestionId`, `createSetFingerprint`). This phase adds `createAttemptId` to that same file rather than starting a parallel `quiz/fingerprint.ts`.
3. **Navigator display status is derived, not stored.** `QuestionProgress` has an independent `status` (`UNSEEN`/`ANSWERED`/`SKIPPED`) and `reviewMarked` boolean. The design mockup's navigator only shows one glyph per cell, so a priority order is used: `reviewMarked` (flagged) beats `SKIPPED` (held) beats `ANSWERED` beats `UNSEEN`. A flagged-but-answered question shows as "다시 볼 문제" — the deliberate flag should stay visible.
4. **`parentFolderId` / `certificationFolderName` / `sourceModifiedTime` are threaded through router state** from `DriveBrowsePage` → `SheetTabSelectPage` → `SheetValidationPage`, since `StudyAttempt` needs them and no page currently carries them that far.

---

### Task 1: `attempts` IndexedDB store and repository

**Files:**
- Modify: `src/storage/db.ts`
- Create: `src/storage/attemptRepo.ts`
- Create: `src/storage/attemptRepo.test.ts`

**Interfaces:**
- Consumes: `StudyAttempt` from `src/types/studyAttempt.ts` (already exists, no changes needed).
- Produces: `saveAttempt(attempt: StudyAttempt): Promise<void>`, `getAttempt(id: string): Promise<StudyAttempt | undefined>` — used by Task 5 (autosave), Task 7 (`QuizPage` load), Task 8 (`ResumeSelectPage`), Task 9 (`SheetValidationPage` start-quiz flow).

- [ ] **Step 1: Write the failing test**

```typescript
// src/storage/attemptRepo.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "./attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";

function makeAttempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "문제은행",
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

describe("attemptRepo", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("returns undefined when no attempt is saved", async () => {
    expect(await getAttempt("missing")).toBeUndefined();
  });

  it("saves and retrieves an attempt by id", async () => {
    const attempt = makeAttempt();
    await saveAttempt(attempt);
    expect(await getAttempt("attempt-1")).toEqual(attempt);
  });

  it("overwrites the same attempt id on repeated saves", async () => {
    await saveAttempt(makeAttempt({ lastViewedIndex: 0 }));
    await saveAttempt(makeAttempt({ lastViewedIndex: 3 }));
    expect((await getAttempt("attempt-1"))?.lastViewedIndex).toBe(3);
  });

  it("keeps attempts for different ids separate", async () => {
    await saveAttempt(makeAttempt({ id: "attempt-1" }));
    await saveAttempt(makeAttempt({ id: "attempt-2", sheetTabName: "다른 탭" }));
    expect((await getAttempt("attempt-1"))?.sheetTabName).toBe("문제은행");
    expect((await getAttempt("attempt-2"))?.sheetTabName).toBe("다른 탭");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/storage/attemptRepo.test.ts`
Expected: FAIL — `Cannot find module './attemptRepo'`

- [ ] **Step 3: Extend the IndexedDB schema**

Modify `src/storage/db.ts` to add the `attempts` store, bump `DB_VERSION`, and register the two indexes from spec §9:

```typescript
import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { TopFolderSelection } from "./topFolderRepo";
import type { StudyAttempt } from "../types/studyAttempt";

export interface SheetQuizDB extends DBSchema {
  topFolder: {
    key: string;
    value: TopFolderSelection;
  };
  attempts: {
    key: string;
    value: StudyAttempt;
    indexes: {
      googleUserId: string;
      bySheetTab: [string, string];
    };
  };
}

const DB_NAME = "sheet-quiz";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SheetQuizDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SheetQuizDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SheetQuizDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("topFolder")) {
          db.createObjectStore("topFolder", { keyPath: "googleUserId" });
        }
        if (!db.objectStoreNames.contains("attempts")) {
          const store = db.createObjectStore("attempts", { keyPath: "id" });
          store.createIndex("googleUserId", "googleUserId");
          store.createIndex("bySheetTab", ["spreadsheetId", "sheetTabId"]);
        }
      },
    });
  }
  return dbPromise;
}
```

- [ ] **Step 4: Implement the repository**

```typescript
// src/storage/attemptRepo.ts
import { getDb } from "./db";
import type { StudyAttempt } from "../types/studyAttempt";

export async function saveAttempt(attempt: StudyAttempt): Promise<void> {
  const db = await getDb();
  await db.put("attempts", attempt);
}

export async function getAttempt(id: string): Promise<StudyAttempt | undefined> {
  const db = await getDb();
  return db.get("attempts", id);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/storage/attemptRepo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full test suite to confirm the schema bump didn't break existing storage tests**

Run: `pnpm test src/storage`
Expected: PASS (all `topFolderRepo.test.ts` and `attemptRepo.test.ts` tests)

- [ ] **Step 7: Commit**

```bash
git add src/storage/db.ts src/storage/attemptRepo.ts src/storage/attemptRepo.test.ts
git commit -m "feat: add IndexedDB attempts store and repository"
```

---

### Task 2: Deterministic attempt id

**Files:**
- Modify: `src/sheets/fingerprint.ts`
- Modify: `src/sheets/fingerprint.test.ts`

**Interfaces:**
- Consumes: nothing new (plain strings).
- Produces: `createAttemptId(googleUserId: string, spreadsheetId: string, sheetTabId: string, fingerprint: string): string` — used by Task 9 (`SheetValidationPage` start-quiz flow).

- [ ] **Step 1: Write the failing test**

Add to `src/sheets/fingerprint.test.ts`:

```typescript
import { createAttemptId, createQuestionId, createSetFingerprint } from "./fingerprint";

describe("createAttemptId", () => {
  it("is stable for the same inputs", () => {
    const a = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    const b = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    expect(a).toBe(b);
  });

  it("changes when the fingerprint changes", () => {
    const a = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    const b = createAttemptId("user-1", "sheet-1", "0", "fp-2");
    expect(a).not.toBe(b);
  });

  it("keeps different users' attempts on the same sheet separate", () => {
    const a = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    const b = createAttemptId("user-2", "sheet-1", "0", "fp-1");
    expect(a).not.toBe(b);
  });
});
```

(Replace the existing `import { createQuestionId, createSetFingerprint } from "./fingerprint";` line at the top of the file with the one above, which adds `createAttemptId` to the same import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/sheets/fingerprint.test.ts`
Expected: FAIL — `createAttemptId` is not exported

- [ ] **Step 3: Implement**

Add to `src/sheets/fingerprint.ts` (after `createSetFingerprint`):

```typescript
export function createAttemptId(
  googleUserId: string,
  spreadsheetId: string,
  sheetTabId: string,
  fingerprint: string,
): string {
  return `${googleUserId}:${spreadsheetId}:${sheetTabId}:${fingerprint}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/sheets/fingerprint.test.ts`
Expected: PASS (all `createQuestionId`, `createSetFingerprint`, `createAttemptId` tests)

- [ ] **Step 5: Commit**

```bash
git add src/sheets/fingerprint.ts src/sheets/fingerprint.test.ts
git commit -m "feat: add deterministic study attempt id generation"
```

---

### Task 3: Pure navigation helpers

**Files:**
- Create: `src/quiz/navigation.ts`
- Create: `src/quiz/navigation.test.ts`

**Interfaces:**
- Consumes: `Question` from `../types/question`, `QuestionProgress`/`QuestionAnswerStatus` from `../types/progress`.
- Produces:
  - `interface NavigatorItem { index: number; questionId: string; questionNumber: number; status: QuestionAnswerStatus; reviewMarked: boolean; isCurrent: boolean }`
  - `interface ProgressSummary { total: number; answered: number; held: number; unseen: number; flagged: number }`
  - `buildProgressByQuestionId(progress: QuestionProgress[]): Map<string, QuestionProgress>`
  - `buildNavigatorItems(questions: Question[], progressByQuestionId: Map<string, QuestionProgress>, currentIndex: number): NavigatorItem[]`
  - `summarizeProgress(progress: QuestionProgress[]): ProgressSummary`
  - `findNextIndexByStatus(questions: Question[], progressByQuestionId: Map<string, QuestionProgress>, fromIndex: number, status: QuestionAnswerStatus): number | null`
  - `findNextFlaggedIndex(questions: Question[], progressByQuestionId: Map<string, QuestionProgress>, fromIndex: number): number | null`
  - All used by Task 5 (`QuizContext`) and Task 8 (`ResumeSelectPage` uses `summarizeProgress`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/quiz/navigation.test.ts
import { describe, expect, it } from "vitest";
import {
  buildNavigatorItems,
  buildProgressByQuestionId,
  findNextFlaggedIndex,
  findNextIndexByStatus,
  summarizeProgress,
} from "./navigation";
import type { Question } from "../types/question";
import type { QuestionProgress } from "../types/progress";

function makeQuestion(id: string, questionNumber: number): Question {
  return {
    id,
    sourceRow: questionNumber + 1,
    questionNumber,
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: `문제 ${questionNumber}`,
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
    ],
    correctAnswers: ["A"],
    explanation: "해설",
  };
}

function makeProgress(questionId: string, overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    questionId,
    selectedAnswers: [],
    status: "UNSEEN",
    reviewMarked: false,
    updatedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

const questions = [makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)];

describe("buildNavigatorItems", () => {
  it("marks the current index and carries each question's status/flag", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2", { status: "SKIPPED", reviewMarked: true }),
      makeProgress("q3"),
    ]);

    const items = buildNavigatorItems(questions, progress, 1);

    expect(items).toEqual([
      { index: 0, questionId: "q1", questionNumber: 1, status: "ANSWERED", reviewMarked: false, isCurrent: false },
      { index: 1, questionId: "q2", questionNumber: 2, status: "SKIPPED", reviewMarked: true, isCurrent: true },
      { index: 2, questionId: "q3", questionNumber: 3, status: "UNSEEN", reviewMarked: false, isCurrent: false },
    ]);
  });
});

describe("summarizeProgress", () => {
  it("counts answered, held, unseen, and flagged independently", () => {
    const summary = summarizeProgress([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2", { status: "SKIPPED", reviewMarked: true }),
      makeProgress("q3", { reviewMarked: true }),
    ]);

    expect(summary).toEqual({ total: 3, answered: 1, held: 1, unseen: 1, flagged: 2 });
  });
});

describe("findNextIndexByStatus", () => {
  it("finds the next question with a given status, wrapping around", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2"),
      makeProgress("q3"),
    ]);

    expect(findNextIndexByStatus(questions, progress, 0, "UNSEEN")).toBe(1);
    expect(findNextIndexByStatus(questions, progress, 1, "UNSEEN")).toBe(2);
    expect(findNextIndexByStatus(questions, progress, 2, "UNSEEN")).toBe(1);
  });

  it("returns null when no question has the target status", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1", { status: "ANSWERED" }),
      makeProgress("q2", { status: "ANSWERED" }),
      makeProgress("q3", { status: "ANSWERED" }),
    ]);

    expect(findNextIndexByStatus(questions, progress, 0, "UNSEEN")).toBeNull();
  });
});

describe("findNextFlaggedIndex", () => {
  it("finds the next flagged question, wrapping around", () => {
    const progress = buildProgressByQuestionId([
      makeProgress("q1"),
      makeProgress("q2", { reviewMarked: true }),
      makeProgress("q3"),
    ]);

    expect(findNextFlaggedIndex(questions, progress, 0)).toBe(1);
    expect(findNextFlaggedIndex(questions, progress, 1)).toBe(1);
  });

  it("returns null when nothing is flagged", () => {
    const progress = buildProgressByQuestionId([makeProgress("q1"), makeProgress("q2"), makeProgress("q3")]);
    expect(findNextFlaggedIndex(questions, progress, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/quiz/navigation.test.ts`
Expected: FAIL — `Cannot find module './navigation'`

- [ ] **Step 3: Implement**

```typescript
// src/quiz/navigation.ts
import type { Question } from "../types/question";
import type { QuestionAnswerStatus, QuestionProgress } from "../types/progress";

export interface NavigatorItem {
  index: number;
  questionId: string;
  questionNumber: number;
  status: QuestionAnswerStatus;
  reviewMarked: boolean;
  isCurrent: boolean;
}

export interface ProgressSummary {
  total: number;
  answered: number;
  held: number;
  unseen: number;
  flagged: number;
}

export function buildProgressByQuestionId(progress: QuestionProgress[]): Map<string, QuestionProgress> {
  return new Map(progress.map((p) => [p.questionId, p]));
}

export function buildNavigatorItems(
  questions: Question[],
  progressByQuestionId: Map<string, QuestionProgress>,
  currentIndex: number,
): NavigatorItem[] {
  return questions.map((question, index) => {
    const progress = progressByQuestionId.get(question.id);
    return {
      index,
      questionId: question.id,
      questionNumber: question.questionNumber,
      status: progress?.status ?? "UNSEEN",
      reviewMarked: progress?.reviewMarked ?? false,
      isCurrent: index === currentIndex,
    };
  });
}

export function summarizeProgress(progress: QuestionProgress[]): ProgressSummary {
  const summary: ProgressSummary = { total: progress.length, answered: 0, held: 0, unseen: 0, flagged: 0 };
  for (const p of progress) {
    if (p.status === "ANSWERED") summary.answered += 1;
    else if (p.status === "SKIPPED") summary.held += 1;
    else summary.unseen += 1;
    if (p.reviewMarked) summary.flagged += 1;
  }
  return summary;
}

export function findNextIndexByStatus(
  questions: Question[],
  progressByQuestionId: Map<string, QuestionProgress>,
  fromIndex: number,
  status: QuestionAnswerStatus,
): number | null {
  for (let offset = 1; offset <= questions.length; offset++) {
    const index = (fromIndex + offset) % questions.length;
    if (progressByQuestionId.get(questions[index].id)?.status === status) return index;
  }
  return null;
}

export function findNextFlaggedIndex(
  questions: Question[],
  progressByQuestionId: Map<string, QuestionProgress>,
  fromIndex: number,
): number | null {
  for (let offset = 1; offset <= questions.length; offset++) {
    const index = (fromIndex + offset) % questions.length;
    if (progressByQuestionId.get(questions[index].id)?.reviewMarked) return index;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/quiz/navigation.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/quiz/navigation.ts src/quiz/navigation.test.ts
git commit -m "feat: add pure quiz navigation and progress summary helpers"
```

---

### Task 4: Pure attempt-mutation helpers

**Files:**
- Create: `src/quiz/attemptActions.ts`
- Create: `src/quiz/attemptActions.test.ts`

**Interfaces:**
- Consumes: `StudyAttempt` from `../types/studyAttempt`, `QuestionProgress` from `../types/progress`.
- Produces: `selectSingleAnswer`, `toggleMultipleAnswer`, `markHeld`, `toggleReviewMarked`, `markFirstViewed`, `moveToIndex`, `restartAttempt` — all `(attempt: StudyAttempt, ...) => StudyAttempt`, pure and immutable. Used by Task 5 (`QuizContext`) and Task 8 (`ResumeSelectPage` uses `restartAttempt`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/quiz/attemptActions.test.ts
import { describe, expect, it } from "vitest";
import {
  markFirstViewed,
  markHeld,
  moveToIndex,
  restartAttempt,
  selectSingleAnswer,
  toggleMultipleAnswer,
  toggleReviewMarked,
} from "./attemptActions";
import type { StudyAttempt } from "../types/studyAttempt";

function makeAttempt(): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "문제은행",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: [
      {
        questionId: "q1",
        selectedAnswers: [],
        status: "UNSEEN",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
      {
        questionId: "q2",
        selectedAnswers: ["A"],
        status: "ANSWERED",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
    ],
  };
}

describe("selectSingleAnswer", () => {
  it("replaces the selection and marks the question answered", () => {
    const result = selectSingleAnswer(makeAttempt(), "q1", "B");
    const progress = result.progress.find((p) => p.questionId === "q1")!;
    expect(progress.selectedAnswers).toEqual(["B"]);
    expect(progress.status).toBe("ANSWERED");
    expect(progress.answeredAt).toBeDefined();
  });

  it("does not mutate the original attempt", () => {
    const original = makeAttempt();
    selectSingleAnswer(original, "q1", "B");
    expect(original.progress.find((p) => p.questionId === "q1")!.selectedAnswers).toEqual([]);
  });
});

describe("toggleMultipleAnswer", () => {
  it("adds an option not yet selected", () => {
    const result = toggleMultipleAnswer(makeAttempt(), "q1", "A");
    const progress = result.progress.find((p) => p.questionId === "q1")!;
    expect(progress.selectedAnswers).toEqual(["A"]);
    expect(progress.status).toBe("ANSWERED");
  });

  it("removes an option already selected, reverting to UNSEEN when empty", () => {
    const result = toggleMultipleAnswer(makeAttempt(), "q2", "A");
    const progress = result.progress.find((p) => p.questionId === "q2")!;
    expect(progress.selectedAnswers).toEqual([]);
    expect(progress.status).toBe("UNSEEN");
  });
});

describe("markHeld", () => {
  it("sets status to SKIPPED without touching selected answers", () => {
    const result = markHeld(makeAttempt(), "q2");
    const progress = result.progress.find((p) => p.questionId === "q2")!;
    expect(progress.status).toBe("SKIPPED");
    expect(progress.selectedAnswers).toEqual(["A"]);
  });
});

describe("toggleReviewMarked", () => {
  it("flips reviewMarked on and back off", () => {
    const once = toggleReviewMarked(makeAttempt(), "q1");
    expect(once.progress.find((p) => p.questionId === "q1")!.reviewMarked).toBe(true);
    const twice = toggleReviewMarked(once, "q1");
    expect(twice.progress.find((p) => p.questionId === "q1")!.reviewMarked).toBe(false);
  });
});

describe("markFirstViewed", () => {
  it("sets firstViewedAt only the first time", () => {
    const once = markFirstViewed(makeAttempt(), "q1");
    const firstTimestamp = once.progress.find((p) => p.questionId === "q1")!.firstViewedAt;
    expect(firstTimestamp).toBeDefined();

    const twice = markFirstViewed(once, "q1");
    expect(twice.progress.find((p) => p.questionId === "q1")!.firstViewedAt).toBe(firstTimestamp);
  });
});

describe("moveToIndex", () => {
  it("updates lastViewedIndex", () => {
    const result = moveToIndex(makeAttempt(), 1);
    expect(result.lastViewedIndex).toBe(1);
  });
});

describe("restartAttempt", () => {
  it("resets every question's progress and lastViewedIndex", () => {
    const result = restartAttempt(makeAttempt());
    expect(result.lastViewedIndex).toBe(0);
    for (const p of result.progress) {
      expect(p.selectedAnswers).toEqual([]);
      expect(p.status).toBe("UNSEEN");
      expect(p.reviewMarked).toBe(false);
      expect(p.firstViewedAt).toBeUndefined();
      expect(p.answeredAt).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/quiz/attemptActions.test.ts`
Expected: FAIL — `Cannot find module './attemptActions'`

- [ ] **Step 3: Implement**

```typescript
// src/quiz/attemptActions.ts
import type { StudyAttempt } from "../types/studyAttempt";
import type { QuestionProgress } from "../types/progress";

function nowIso(): string {
  return new Date().toISOString();
}

function updateProgress(
  attempt: StudyAttempt,
  questionId: string,
  updater: (progress: QuestionProgress) => QuestionProgress,
): StudyAttempt {
  return {
    ...attempt,
    progress: attempt.progress.map((p) => (p.questionId === questionId ? updater(p) : p)),
    updatedAt: nowIso(),
  };
}

export function selectSingleAnswer(attempt: StudyAttempt, questionId: string, optionKey: string): StudyAttempt {
  return updateProgress(attempt, questionId, (p) => ({
    ...p,
    selectedAnswers: [optionKey],
    status: "ANSWERED",
    answeredAt: nowIso(),
  }));
}

export function toggleMultipleAnswer(attempt: StudyAttempt, questionId: string, optionKey: string): StudyAttempt {
  return updateProgress(attempt, questionId, (p) => {
    const alreadySelected = p.selectedAnswers.includes(optionKey);
    const selectedAnswers = alreadySelected
      ? p.selectedAnswers.filter((key) => key !== optionKey)
      : [...p.selectedAnswers, optionKey];
    return {
      ...p,
      selectedAnswers,
      status: selectedAnswers.length > 0 ? "ANSWERED" : "UNSEEN",
      answeredAt: selectedAnswers.length > 0 ? nowIso() : p.answeredAt,
    };
  });
}

export function markHeld(attempt: StudyAttempt, questionId: string): StudyAttempt {
  return updateProgress(attempt, questionId, (p) => ({ ...p, status: "SKIPPED" }));
}

export function toggleReviewMarked(attempt: StudyAttempt, questionId: string): StudyAttempt {
  return updateProgress(attempt, questionId, (p) => ({ ...p, reviewMarked: !p.reviewMarked }));
}

export function markFirstViewed(attempt: StudyAttempt, questionId: string): StudyAttempt {
  return updateProgress(attempt, questionId, (p) => (p.firstViewedAt ? p : { ...p, firstViewedAt: nowIso() }));
}

export function moveToIndex(attempt: StudyAttempt, index: number): StudyAttempt {
  return { ...attempt, lastViewedIndex: index, updatedAt: nowIso() };
}

export function restartAttempt(attempt: StudyAttempt): StudyAttempt {
  return {
    ...attempt,
    progress: attempt.progress.map((p) => ({
      questionId: p.questionId,
      selectedAnswers: [],
      status: "UNSEEN",
      reviewMarked: false,
      updatedAt: nowIso(),
    })),
    lastViewedIndex: 0,
    updatedAt: nowIso(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/quiz/attemptActions.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/quiz/attemptActions.ts src/quiz/attemptActions.test.ts
git commit -m "feat: add pure study attempt mutation helpers"
```

---

### Task 5: `QuizContext` — in-memory quiz state with autosave

**Files:**
- Create: `src/quiz/QuizContext.tsx`
- Create: `src/quiz/QuizContext.test.tsx`

**Interfaces:**
- Consumes: `StudyAttempt` (`../types/studyAttempt`), `Question` (`../types/question`), `QuestionProgress` (`../types/progress`), everything from `./navigation` (Task 3), everything from `./attemptActions` (Task 4), `saveAttempt` from `../storage/attemptRepo` (Task 1), `createInitialProgress` from `../types/progress`.
- Produces: `QuizProvider({ initialAttempt: StudyAttempt, children: ReactNode })`, `useQuiz(): QuizContextValue` where:

```typescript
type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface QuizContextValue {
  attempt: StudyAttempt;
  questions: Question[];
  currentIndex: number;
  currentQuestion: Question;
  currentProgress: QuestionProgress;
  navigatorItems: NavigatorItem[];
  progressSummary: ProgressSummary;
  autosaveStatus: AutosaveStatus;
  selectAnswer: (optionKey: string) => void;
  setHeld: () => void;
  toggleReviewMarked: () => void;
  goToIndex: (index: number) => void;
  goPrev: () => void;
  goNext: () => void;
  goNextUnseen: () => void;
  goNextHeld: () => void;
  goNextFlagged: () => void;
}
```

Used by Task 7 (`QuizPage`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/quiz/QuizContext.test.tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as attemptRepo from "../storage/attemptRepo";
import { QuizProvider, useQuiz } from "./QuizContext";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";

function makeQuestion(id: string, questionNumber: number, type: Question["type"] = "SINGLE"): Question {
  return {
    id,
    sourceRow: questionNumber + 1,
    questionNumber,
    difficulty: "MEDIUM",
    type,
    requiredAnswerCount: type === "SINGLE" ? 1 : 2,
    text: `문제 ${questionNumber}`,
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
      { key: "C", text: "보기 C" },
    ],
    correctAnswers: type === "SINGLE" ? ["A"] : ["A", "B"],
    explanation: "해설",
  };
}

function makeAttempt(questions: Question[]): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "문제은행",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: questions.map((q) => ({
      questionId: q.id,
      selectedAnswers: [],
      status: "UNSEEN" as const,
      reviewMarked: false,
      updatedAt: "2026-09-04T00:00:00.000Z",
    })),
    questionSnapshot: questions,
  };
}

function Probe() {
  const quiz = useQuiz();
  return (
    <div>
      <span data-testid="current-number">{quiz.currentQuestion.questionNumber}</span>
      <span data-testid="answered-count">{quiz.progressSummary.answered}</span>
      <span data-testid="autosave-status">{quiz.autosaveStatus}</span>
      <button onClick={() => quiz.selectAnswer("A")}>select-A</button>
      <button onClick={() => quiz.selectAnswer("B")}>select-B</button>
      <button onClick={quiz.setHeld}>hold</button>
      <button onClick={quiz.toggleReviewMarked}>flag</button>
      <button onClick={quiz.goNext}>next</button>
      <button onClick={quiz.goPrev}>prev</button>
    </div>
  );
}

describe("QuizContext", () => {
  afterEach(() => vi.restoreAllMocks());

  it("selects a single answer and updates the answered count", async () => {
    vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1), makeQuestion("q2", 2)];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    await userEvent.click(screen.getByText("select-A"));

    expect(screen.getByTestId("answered-count")).toHaveTextContent("1");
  });

  it("toggles a multiple-choice answer on and off", async () => {
    vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1, "MULTIPLE")];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    await userEvent.click(screen.getByText("select-A"));
    await userEvent.click(screen.getByText("select-B"));
    expect(screen.getByTestId("answered-count")).toHaveTextContent("1");

    await userEvent.click(screen.getByText("select-A"));
    await userEvent.click(screen.getByText("select-B"));
    expect(screen.getByTestId("answered-count")).toHaveTextContent("0");
  });

  it("moves between questions with goNext/goPrev", async () => {
    vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1), makeQuestion("q2", 2)];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    expect(screen.getByTestId("current-number")).toHaveTextContent("1");
    await userEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("current-number")).toHaveTextContent("2");
    await userEvent.click(screen.getByText("prev"));
    expect(screen.getByTestId("current-number")).toHaveTextContent("1");
  });

  it("autosaves to IndexedDB after a change, reporting saving then saved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saveSpy = vi.spyOn(attemptRepo, "saveAttempt").mockResolvedValue();
    const questions = [makeQuestion("q1", 1)];
    render(
      <QuizProvider initialAttempt={makeAttempt(questions)}>
        <Probe />
      </QuizProvider>,
    );

    await act(async () => {
      screen.getByText("select-A").click();
    });
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("saving");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(saveSpy).toHaveBeenCalled();
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("saved");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/quiz/QuizContext.test.tsx`
Expected: FAIL — `Cannot find module './QuizContext'`

- [ ] **Step 3: Implement**

```tsx
// src/quiz/QuizContext.tsx
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import { createInitialProgress, QuestionProgress } from "../types/progress";
import { saveAttempt } from "../storage/attemptRepo";
import {
  buildNavigatorItems,
  buildProgressByQuestionId,
  findNextFlaggedIndex,
  findNextIndexByStatus,
  NavigatorItem,
  ProgressSummary,
  summarizeProgress,
} from "./navigation";
import {
  markFirstViewed,
  markHeld,
  moveToIndex,
  selectSingleAnswer,
  toggleMultipleAnswer,
  toggleReviewMarked as toggleReviewMarkedAction,
} from "./attemptActions";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface QuizContextValue {
  attempt: StudyAttempt;
  questions: Question[];
  currentIndex: number;
  currentQuestion: Question;
  currentProgress: QuestionProgress;
  navigatorItems: NavigatorItem[];
  progressSummary: ProgressSummary;
  autosaveStatus: AutosaveStatus;
  selectAnswer: (optionKey: string) => void;
  setHeld: () => void;
  toggleReviewMarked: () => void;
  goToIndex: (index: number) => void;
  goPrev: () => void;
  goNext: () => void;
  goNextUnseen: () => void;
  goNextHeld: () => void;
  goNextFlagged: () => void;
}

const QuizContext = createContext<QuizContextValue | null>(null);
const AUTOSAVE_DEBOUNCE_MS = 600;

export function QuizProvider({
  initialAttempt,
  children,
}: {
  initialAttempt: StudyAttempt;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

  const questions = attempt.questionSnapshot ?? [];
  const currentIndex = attempt.lastViewedIndex;
  const progressByQuestionId = useMemo(() => buildProgressByQuestionId(attempt.progress), [attempt.progress]);
  const currentQuestion = questions[currentIndex];
  const currentProgress =
    progressByQuestionId.get(currentQuestion.id) ?? createInitialProgress(currentQuestion.id);

  useEffect(() => {
    setAttempt((prev) => {
      const qs = prev.questionSnapshot ?? [];
      const q = qs[prev.lastViewedIndex];
      return q ? markFirstViewed(prev, q.id) : prev;
    });
  }, [currentIndex]);

  useEffect(() => {
    setAutosaveStatus("saving");
    const timer = setTimeout(() => {
      saveAttempt(attempt)
        .then(() => setAutosaveStatus("saved"))
        .catch(() => setAutosaveStatus("error"));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [attempt]);

  const value: QuizContextValue = {
    attempt,
    questions,
    currentIndex,
    currentQuestion,
    currentProgress,
    navigatorItems: buildNavigatorItems(questions, progressByQuestionId, currentIndex),
    progressSummary: summarizeProgress(attempt.progress),
    autosaveStatus,
    selectAnswer: (optionKey) => {
      setAttempt((prev) =>
        currentQuestion.type === "SINGLE"
          ? selectSingleAnswer(prev, currentQuestion.id, optionKey)
          : toggleMultipleAnswer(prev, currentQuestion.id, optionKey),
      );
    },
    setHeld: () => setAttempt((prev) => markHeld(prev, currentQuestion.id)),
    toggleReviewMarked: () => setAttempt((prev) => toggleReviewMarkedAction(prev, currentQuestion.id)),
    goToIndex: (index) => setAttempt((prev) => moveToIndex(prev, index)),
    goPrev: () => setAttempt((prev) => moveToIndex(prev, Math.max(0, prev.lastViewedIndex - 1))),
    goNext: () =>
      setAttempt((prev) => moveToIndex(prev, Math.min(questions.length - 1, prev.lastViewedIndex + 1))),
    goNextUnseen: () => {
      const next = findNextIndexByStatus(questions, progressByQuestionId, currentIndex, "UNSEEN");
      if (next != null) setAttempt((prev) => moveToIndex(prev, next));
    },
    goNextHeld: () => {
      const next = findNextIndexByStatus(questions, progressByQuestionId, currentIndex, "SKIPPED");
      if (next != null) setAttempt((prev) => moveToIndex(prev, next));
    },
    goNextFlagged: () => {
      const next = findNextFlaggedIndex(questions, progressByQuestionId, currentIndex);
      if (next != null) setAttempt((prev) => moveToIndex(prev, next));
    },
  };

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz(): QuizContextValue {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error("useQuiz must be used within a QuizProvider");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/quiz/QuizContext.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/quiz/QuizContext.tsx src/quiz/QuizContext.test.tsx
git commit -m "feat: add QuizContext with debounced IndexedDB autosave"
```

---

### Task 6: Reusable quiz UI pieces

**Files:**
- Create: `src/components/AutosaveIndicator.tsx`
- Create: `src/components/AutosaveIndicator.test.tsx`
- Create: `src/components/ProgressBar.tsx`
- Create: `src/components/ProgressBar.test.tsx`
- Create: `src/components/QuestionNavigatorGrid.tsx`
- Create: `src/components/QuestionNavigatorGrid.test.tsx`

**Interfaces:**
- Consumes: `NavigatorItem` from `../quiz/navigation` (Task 3).
- Produces: `AutosaveIndicator({ status: AutosaveStatus })`, `ProgressBar({ percent: number })`, `QuestionNavigatorGrid({ items: NavigatorItem[], onJump: (index: number) => void })`. Used by Task 7 (`QuizPage`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/AutosaveIndicator.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AutosaveIndicator } from "./AutosaveIndicator";

describe("AutosaveIndicator", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<AutosaveIndicator status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 저장 중… while saving", () => {
    render(<AutosaveIndicator status="saving" />);
    expect(screen.getByText("저장 중…")).toBeInTheDocument();
  });

  it("shows 저장됨 once saved", () => {
    render(<AutosaveIndicator status="saved" />);
    expect(screen.getByText("저장됨")).toBeInTheDocument();
  });

  it("shows 저장 실패 on error", () => {
    render(<AutosaveIndicator status="error" />);
    expect(screen.getByText("저장 실패")).toBeInTheDocument();
  });
});
```

```tsx
// src/components/ProgressBar.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders a fill width matching the percent prop", () => {
    const { container } = render(<ProgressBar percent={40} />);
    const fill = container.querySelector("div > div") as HTMLElement;
    expect(fill.style.width).toBe("40%");
  });

  it("clamps out-of-range percentages", () => {
    const { container } = render(<ProgressBar percent={150} />);
    const fill = container.querySelector("div > div") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("falls back to 0% for non-finite input", () => {
    const { container } = render(<ProgressBar percent={NaN} />);
    const fill = container.querySelector("div > div") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });
});
```

```tsx
// src/components/QuestionNavigatorGrid.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionNavigatorGrid } from "./QuestionNavigatorGrid";
import type { NavigatorItem } from "../quiz/navigation";

const items: NavigatorItem[] = [
  { index: 0, questionId: "q1", questionNumber: 1, status: "ANSWERED", reviewMarked: false, isCurrent: false },
  { index: 1, questionId: "q2", questionNumber: 2, status: "SKIPPED", reviewMarked: false, isCurrent: true },
  { index: 2, questionId: "q3", questionNumber: 3, status: "UNSEEN", reviewMarked: true, isCurrent: false },
];

describe("QuestionNavigatorGrid", () => {
  it("renders one button per question labelled with its status", () => {
    render(<QuestionNavigatorGrid items={items} onJump={() => {}} />);
    expect(screen.getByLabelText("문제 1, 답변 완료")).toBeInTheDocument();
    expect(screen.getByLabelText("문제 2, 보류")).toBeInTheDocument();
    expect(screen.getByLabelText("문제 3, 다시 볼 문제")).toBeInTheDocument();
  });

  it("calls onJump with the clicked item's index", async () => {
    const onJump = vi.fn();
    render(<QuestionNavigatorGrid items={items} onJump={onJump} />);
    await userEvent.click(screen.getByLabelText("문제 1, 답변 완료"));
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it("marks the current question for assistive tech", () => {
    render(<QuestionNavigatorGrid items={items} onJump={() => {}} />);
    expect(screen.getByLabelText("문제 2, 보류")).toHaveAttribute("aria-current", "true");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/components/AutosaveIndicator.test.tsx src/components/ProgressBar.test.tsx src/components/QuestionNavigatorGrid.test.tsx`
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Implement `AutosaveIndicator`**

```tsx
// src/components/AutosaveIndicator.tsx
import type { AutosaveStatus } from "../quiz/QuizContext";

const LABELS: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패",
};

const DOT_CLASS: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "bg-accent motion-safe:animate-pulse dark:bg-accent-dark",
  saved: "bg-status-answered dark:bg-status-answered-dark",
  error: "bg-danger",
};

export function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;
  return (
    <span className="flex flex-shrink-0 items-center gap-1.5 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 4: Implement `ProgressBar`**

```tsx
// src/components/ProgressBar.tsx
export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sunken dark:bg-sunken-dark">
      <div className="h-full rounded-full bg-accent dark:bg-accent-dark" style={{ width: `${clamped}%` }} />
    </div>
  );
}
```

- [ ] **Step 5: Implement `QuestionNavigatorGrid`**

```tsx
// src/components/QuestionNavigatorGrid.tsx
import type { NavigatorItem } from "../quiz/navigation";

type DisplayStatus = "unseen" | "answered" | "held" | "flagged";

const STATUS_STYLES: Record<DisplayStatus, { border: string; text: string; glyph: string; label: string }> = {
  unseen: {
    border: "border-2 border-dashed border-status-unseen",
    text: "text-status-unseen",
    glyph: "○",
    label: "아직 안 봄",
  },
  answered: {
    border: "border-2 border-status-answered dark:border-status-answered-dark",
    text: "text-status-answered dark:text-status-answered-dark",
    glyph: "✓",
    label: "답변 완료",
  },
  held: {
    border: "border-2 border-status-held dark:border-status-held-dark",
    text: "text-status-held dark:text-status-held-dark",
    glyph: "‖",
    label: "보류",
  },
  flagged: {
    border: "border-2 border-status-review dark:border-status-review-dark",
    text: "text-status-review dark:text-status-review-dark",
    glyph: "⚑",
    label: "다시 볼 문제",
  },
};

function resolveDisplayStatus(status: NavigatorItem["status"], reviewMarked: boolean): DisplayStatus {
  if (reviewMarked) return "flagged";
  if (status === "SKIPPED") return "held";
  if (status === "ANSWERED") return "answered";
  return "unseen";
}

export function QuestionNavigatorGrid({
  items,
  onJump,
}: {
  items: NavigatorItem[];
  onJump: (index: number) => void;
}) {
  return (
    <div className="sticky top-5 self-start rounded-lg border border-border bg-surface p-4.5 dark:border-border-dark dark:bg-surface-dark">
      <div className="mb-3 text-xs font-semibold text-text-secondary dark:text-text-dark-secondary">
        문제 네비게이터
      </div>
      <div className="mb-4 grid grid-cols-5 gap-2">
        {items.map((item) => {
          const display = STATUS_STYLES[resolveDisplayStatus(item.status, item.reviewMarked)];
          return (
            <button
              key={item.questionId}
              type="button"
              onClick={() => onJump(item.index)}
              aria-current={item.isCurrent ? "true" : undefined}
              aria-label={`문제 ${item.questionNumber}, ${display.label}`}
              className={`relative aspect-square rounded-lg font-mono text-[13px] font-semibold ${display.border} ${display.text} ${
                item.isCurrent ? "ring-2 ring-accent ring-offset-1 dark:ring-accent-dark" : ""
              }`}
            >
              {item.questionNumber}
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current bg-surface text-[8px] dark:bg-surface-dark">
                {display.glyph}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-[11.5px] text-text-secondary dark:border-border-dark dark:text-text-dark-secondary">
        <div>○ 점선 = 아직 안 봄</div>
        <div>✓ 초록 = 답변 완료</div>
        <div>‖ 황토 = 보류</div>
        <div>⚑ 로즈 = 다시 볼 문제</div>
        <div>인디고 테두리 = 현재 문제</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test src/components/AutosaveIndicator.test.tsx src/components/ProgressBar.test.tsx src/components/QuestionNavigatorGrid.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/AutosaveIndicator.tsx src/components/AutosaveIndicator.test.tsx \
  src/components/ProgressBar.tsx src/components/ProgressBar.test.tsx \
  src/components/QuestionNavigatorGrid.tsx src/components/QuestionNavigatorGrid.test.tsx
git commit -m "feat: add autosave indicator, progress bar, and question navigator grid"
```

---

### Task 7: `QuizPage` — the quiz-taking screen

**Files:**
- Create: `src/pages/QuizPage.tsx`
- Create: `src/pages/QuizPage.test.tsx`

**Interfaces:**
- Consumes: `getAttempt` (Task 1), `QuizProvider`/`useQuiz` (Task 5), `AutosaveIndicator`/`ProgressBar`/`QuestionNavigatorGrid` (Task 6).
- Produces: `export default function QuizPage()`, mounted at `/quiz/:attemptId` in Task 9.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/QuizPage.test.tsx
import { Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import QuizPage from "./QuizPage";

function makeQuestion(id: string, questionNumber: number): Question {
  return {
    id,
    sourceRow: questionNumber + 1,
    questionNumber,
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: `문제 ${questionNumber}`,
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
    ],
    correctAnswers: ["A"],
    explanation: `해설 ${questionNumber}`,
  };
}

function makeAttempt(questions: Question[]): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "문제은행",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 0,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: questions.map((q) => ({
      questionId: q.id,
      selectedAnswers: [],
      status: "UNSEEN" as const,
      reviewMarked: false,
      updatedAt: "2026-09-04T00:00:00.000Z",
    })),
    questionSnapshot: questions,
  };
}

function renderQuiz(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/quiz/${id}`]}>
      <Routes>
        <Route path="/quiz/:attemptId" element={<QuizPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("QuizPage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("loads the attempt from IndexedDB and shows the current question", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");

    await waitFor(() => expect(screen.getByText("문제 1")).toBeInTheDocument());
    expect(screen.getByText("보기 A")).toBeInTheDocument();
  });

  it("selects an option and advances with 다음", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByText("보기 A"));
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() => expect(screen.getByText("문제 2")).toBeInTheDocument());
  });

  it("disables 이전 on the first question and 다음 on the last", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1)]));

    renderQuiz("attempt-1");
    await waitFor(() => screen.getByText("문제 1"));

    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("shows a not-found message when the attempt id doesn't exist", async () => {
    renderQuiz("missing-attempt");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/pages/QuizPage.test.tsx`
Expected: FAIL — `Cannot find module './QuizPage'`

- [ ] **Step 3: Implement**

```tsx
// src/pages/QuizPage.tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import { QuizProvider, useQuiz } from "../quiz/QuizContext";
import { AutosaveIndicator } from "../components/AutosaveIndicator";
import { ProgressBar } from "../components/ProgressBar";
import { QuestionNavigatorGrid } from "../components/QuestionNavigatorGrid";

export default function QuizPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    setState("loading");
    getAttempt(attemptId).then((found) => {
      if (!found || !found.questionSnapshot || found.questionSnapshot.length === 0) {
        setState("not-found");
        return;
      }
      setAttempt(found);
      setState("ready");
    });
  }, [attemptId]);

  if (state === "loading") {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (state === "not-found" || !attempt) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          풀이 기록을 찾을 수 없습니다. Sheet 파일을 다시 선택해주세요.
        </p>
        <Link to="/folders" className="text-sm font-semibold text-accent dark:text-accent-dark">
          Drive 폴더로 이동
        </Link>
      </div>
    );
  }

  return (
    <QuizProvider initialAttempt={attempt}>
      <QuizPageContent />
    </QuizProvider>
  );
}

function QuizPageContent() {
  const {
    currentQuestion,
    currentProgress,
    currentIndex,
    questions,
    navigatorItems,
    progressSummary,
    autosaveStatus,
    selectAnswer,
    setHeld,
    toggleReviewMarked,
    goToIndex,
    goPrev,
    goNext,
  } = useQuiz();
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => setShowExplanation(false), [currentIndex]);

  const isSingle = currentQuestion.type === "SINGLE";
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;
  const answeredPercent =
    progressSummary.total > 0 ? (progressSummary.answered / progressSummary.total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-6 border-b border-border px-8 py-3.5 dark:border-border-dark">
        <div className="min-w-0 flex-1">
          <ProgressBar percent={answeredPercent} />
        </div>
        <span className="flex-shrink-0 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
          {progressSummary.answered}/{progressSummary.total} 답변
        </span>
        <AutosaveIndicator status={autosaveStatus} />
      </div>

      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-7 px-8 py-7 pb-28 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <span className="font-mono text-[13px] text-text-secondary dark:text-text-dark-secondary">
              문제 {currentQuestion.questionNumber} / {questions.length}
            </span>
            {currentQuestion.category && (
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] text-text-secondary dark:bg-sunken-dark dark:text-text-dark-secondary">
                {currentQuestion.category}
              </span>
            )}
            <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] text-text-secondary dark:bg-sunken-dark dark:text-text-dark-secondary">
              난이도 {currentQuestion.difficulty}
            </span>
          </div>

          {currentQuestion.scenario && (
            <div className="mb-4.5 rounded-lg bg-sunken p-5 dark:bg-sunken-dark">
              <div className="mb-2 font-mono text-xs font-semibold text-text-secondary dark:text-text-dark-secondary">
                상황
              </div>
              <p className="m-0 text-[15px] leading-[1.75]">{currentQuestion.scenario}</p>
            </div>
          )}

          <p className="mb-1.5 text-base font-semibold leading-[1.6]">{currentQuestion.text}</p>
          {!isSingle && (
            <p className="mb-4 text-[13px] font-semibold text-status-review dark:text-status-review-dark">
              정답 {currentQuestion.requiredAnswerCount}개를 선택하세요 · 현재{" "}
              {currentProgress.selectedAnswers.length}개 선택됨
            </p>
          )}

          <fieldset className="flex flex-col gap-2.5 border-0 p-0">
            <legend className="sr-only">보기 선택</legend>
            {currentQuestion.options.map((option) => {
              const checked = currentProgress.selectedAnswers.includes(option.key);
              return (
                <label
                  key={option.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                    checked
                      ? "border-accent bg-accent-soft dark:border-accent-dark dark:bg-accent-dark-soft"
                      : "border-border dark:border-border-dark"
                  }`}
                >
                  <input
                    type={isSingle ? "radio" : "checkbox"}
                    name={`question-${currentQuestion.id}`}
                    checked={checked}
                    onChange={() => selectAnswer(option.key)}
                    className="mt-0.5"
                  />
                  <span className="text-[14.5px] leading-[1.55]">{option.text}</span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-6 rounded-lg border border-border bg-surface shadow-card dark:border-border-dark dark:bg-surface-dark">
            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className="w-full rounded-lg px-5 py-3.5 text-left text-[13.5px] font-semibold text-accent dark:text-accent-dark"
            >
              {showExplanation ? "해설 숨기기" : "해설 보기"}
            </button>
            {showExplanation && (
              <p className="m-0 px-5 pb-4.5 text-sm leading-[1.7] text-text-secondary dark:text-text-dark-secondary">
                {currentQuestion.explanation}
              </p>
            )}
          </div>
        </div>

        <QuestionNavigatorGrid items={navigatorItems} onJump={goToIndex} />
      </div>

      <div className="fixed inset-x-0 bottom-0 flex justify-center gap-2.5 border-t border-border bg-surface px-8 py-3.5 dark:border-border-dark dark:bg-surface-dark">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          className="rounded border border-border px-4.5 py-2.5 text-sm disabled:opacity-40 dark:border-border-dark"
        >
          이전
        </button>
        <button
          type="button"
          onClick={setHeld}
          className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark"
        >
          나중에 풀기
        </button>
        <button
          type="button"
          onClick={toggleReviewMarked}
          className={`rounded border px-4.5 py-2.5 text-sm ${
            currentProgress.reviewMarked
              ? "border-status-review bg-status-review text-white dark:border-status-review-dark dark:bg-status-review-dark"
              : "border-border dark:border-border-dark"
          }`}
        >
          다시 볼 문제로 표시
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={isLast}
          className="rounded border border-border px-4.5 py-2.5 text-sm disabled:opacity-40 dark:border-border-dark"
        >
          다음
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/pages/QuizPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizPage.tsx src/pages/QuizPage.test.tsx
git commit -m "feat: add quiz-taking screen with navigator and autosave"
```

---

### Task 8: `ResumeSelectPage` — continue vs. restart

**Files:**
- Create: `src/pages/ResumeSelectPage.tsx`
- Create: `src/pages/ResumeSelectPage.test.tsx`

**Interfaces:**
- Consumes: `getAttempt`/`saveAttempt` (Task 1), `restartAttempt` (Task 4), `summarizeProgress` (Task 3).
- Produces: `export default function ResumeSelectPage()`, mounted at `/quiz/:attemptId/resume` in Task 9.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ResumeSelectPage.test.tsx
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import ResumeSelectPage from "./ResumeSelectPage";

function makeAttempt(): StudyAttempt {
  return {
    id: "attempt-1",
    googleUserId: "user-1",
    spreadsheetId: "sheet-1",
    spreadsheetName: "실전 모의고사 1",
    sheetTabId: "0",
    sheetTabName: "문제은행",
    parentFolderId: "cert-1",
    certificationFolderName: "AWS",
    questionSetFingerprint: "fp-1",
    sourceModifiedTime: "2026-09-01T00:00:00.000Z",
    lastViewedIndex: 1,
    startedAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    progress: [
      {
        questionId: "q1",
        selectedAnswers: ["A"],
        status: "ANSWERED",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
      {
        questionId: "q2",
        selectedAnswers: [],
        status: "UNSEEN",
        reviewMarked: false,
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
    ],
  };
}

function renderResume(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/quiz/${id}/resume`]}>
      <Routes>
        <Route path="/quiz/:attemptId/resume" element={<ResumeSelectPage />} />
        <Route path="/quiz/:attemptId" element={<div>퀴즈 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResumeSelectPage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("shows progress so far and navigates to the quiz on 이어서 풀기", async () => {
    await saveAttempt(makeAttempt());
    renderResume("attempt-1");

    await waitFor(() => expect(screen.getByText(/1\/2 답변 완료/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "이어서 풀기" }));

    await waitFor(() => expect(screen.getByText("퀴즈 화면")).toBeInTheDocument());
  });

  it("resets progress and navigates to the quiz on 처음부터 다시 풀기", async () => {
    await saveAttempt(makeAttempt());
    renderResume("attempt-1");

    await waitFor(() => screen.getByRole("button", { name: "처음부터 다시 풀기" }));
    await userEvent.click(screen.getByRole("button", { name: "처음부터 다시 풀기" }));

    await waitFor(() => expect(screen.getByText("퀴즈 화면")).toBeInTheDocument());
    const reset = await getAttempt("attempt-1");
    expect(reset?.progress.every((p) => p.status === "UNSEEN")).toBe(true);
    expect(reset?.lastViewedIndex).toBe(0);
  });

  it("shows a not-found message when the attempt id doesn't exist", async () => {
    renderResume("missing-attempt");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/pages/ResumeSelectPage.test.tsx`
Expected: FAIL — `Cannot find module './ResumeSelectPage'`

- [ ] **Step 3: Implement**

```tsx
// src/pages/ResumeSelectPage.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { restartAttempt } from "../quiz/attemptActions";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";

export default function ResumeSelectPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!attemptId) return;
    getAttempt(attemptId).then((found) => {
      if (!found) {
        setState("not-found");
        return;
      }
      setAttempt(found);
      setState("ready");
    });
  }, [attemptId]);

  if (state === "loading") {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (state === "not-found" || !attempt) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          풀이 기록을 찾을 수 없습니다. Sheet 파일을 다시 선택해주세요.
        </p>
        <Link to="/folders" className="text-sm font-semibold text-accent dark:text-accent-dark">
          Drive 폴더로 이동
        </Link>
      </div>
    );
  }

  const summary = summarizeProgress(attempt.progress);

  const restart = async () => {
    if (!attemptId) return;
    setRestarting(true);
    await saveAttempt(restartAttempt(attempt));
    navigate(`/quiz/${attemptId}`);
  };

  return (
    <div className="mx-auto max-w-md px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">이어서 풀어볼까요?</h1>
      <p className="mb-5 text-sm text-text-secondary dark:text-text-dark-secondary">
        {attempt.spreadsheetName} · {attempt.sheetTabName} · {summary.answered}/{summary.total} 답변 완료
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => navigate(`/quiz/${attemptId}`)}
          className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
        >
          이어서 풀기
        </button>
        <button
          type="button"
          onClick={() => void restart()}
          disabled={restarting}
          className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark"
        >
          {restarting ? "초기화 중…" : "처음부터 다시 풀기"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/pages/ResumeSelectPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/ResumeSelectPage.tsx src/pages/ResumeSelectPage.test.tsx
git commit -m "feat: add resume-or-restart screen for existing attempts"
```

---

### Task 9: Wire attempt creation into the validation success screen, and add routes

This task threads the folder/file context `StudyAttempt` needs through router state, adds the "풀이 시작" action to `SheetValidationPage`, and registers the two new routes.

**Files:**
- Modify: `src/pages/DriveBrowsePage.tsx`
- Modify: `src/pages/DriveBrowsePage.test.tsx`
- Modify: `src/pages/SheetTabSelectPage.tsx`
- Modify: `src/pages/SheetTabSelectPage.test.tsx`
- Modify: `src/pages/SheetValidationPage.tsx`
- Modify: `src/pages/SheetValidationPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `createSetFingerprint` (existing, `../sheets/fingerprint`), `createAttemptId` (Task 2), `getAttempt`/`saveAttempt` (Task 1), `createInitialProgress` (existing, `../types/progress`), `QuizPage` (Task 7), `ResumeSelectPage` (Task 8).
- Produces: nothing new consumed elsewhere — this is the final wiring task for the phase.

- [ ] **Step 1: Write the failing tests**

Add a new test to `src/pages/DriveBrowsePage.test.tsx` (append inside the existing `describe("DriveBrowsePage", ...)` block, after the "navigates to the tab selection route" test):

```typescript
  it("carries folder context and source modifiedTime when a Sheet file is clicked", async () => {
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
```

This test only exercises the click path already covered by the existing "navigates to the tab selection route" test — the state contents are verified end-to-end via the `SheetTabSelectPage` and `SheetValidationPage` tests below, since `MemoryRouter` location state isn't directly inspectable from rendered output at this layer. Add it anyway to document the expectation; it will pass once Step 3 lands (it doesn't fail first, which is fine for a documentation-style regression test — skip the red step for this one file only and move on).

Add a new test to `src/pages/SheetTabSelectPage.test.tsx`, replacing the `renderTabSelect` helper to accept optional initial state and adding a forwarding assertion:

```typescript
function renderTabSelect(initialState: Record<string, unknown> = {}) {
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
      <Route
        path="/sheets/:spreadsheetId/validate"
        element={<CaptureState />}
      />
    </Routes>,
    [{ pathname: "/sheets/sheet-1/tabs", state: initialState }],
  );
}

function CaptureState() {
  const location = useLocation();
  return <div>검증 결과 화면:{JSON.stringify(location.state)}</div>;
}
```

Add `import { useLocation } from "react-router-dom";` to the top-of-file import list (it already imports `Route, Routes` from `react-router-dom`; extend that import line).

Add this test inside `describe("SheetTabSelectPage", ...)`:

```typescript
  it("forwards folder context and modifiedTime through to the validate route", async () => {
    vi.spyOn(sheetsClient, "listSheetTabs").mockResolvedValue([{ sheetId: 0, title: "문제은행" }]);

    renderTabSelect({
      fileName: "실전 모의고사 1",
      sourceModifiedTime: "2026-09-01T00:00:00.000Z",
      parentFolderId: "cert-1",
      certificationFolderName: "AWS",
    });

    await waitFor(() => screen.getByText(/검증 결과 화면/));
    expect(screen.getByText(/"parentFolderId":"cert-1"/)).toBeInTheDocument();
    expect(screen.getByText(/"certificationFolderName":"AWS"/)).toBeInTheDocument();
    expect(screen.getByText(/"sourceModifiedTime":"2026-09-01T00:00:00.000Z"/)).toBeInTheDocument();
  });
```

Add a new test to `src/pages/SheetValidationPage.test.tsx`:

```typescript
  it("creates a new attempt and navigates to the quiz when 풀이 시작 is clicked", async () => {
    vi.spyOn(sheetsClient, "getSheetValues").mockResolvedValue([
      VALID_HEADER,
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", "해설"],
    ]);

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/sheets/sheet-1/validate",
            state: {
              fileName: "1주차 문제",
              tabId: 0,
              tabTitle: "문제은행",
              parentFolderId: "cert-1",
              certificationFolderName: "AWS",
              sourceModifiedTime: "2026-09-01T00:00:00.000Z",
            },
          },
        ]}
      >
        <AuthProvider clientId="client-id">
          <ConnectGate>
            <Routes>
              <Route path="/sheets/:spreadsheetId/validate" element={<SheetValidationPage />} />
              <Route path="/quiz/:attemptId" element={<div>퀴즈 화면</div>} />
            </Routes>
          </ConnectGate>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByRole("button", { name: "풀이 시작" }));
    await userEvent.click(screen.getByRole("button", { name: "풀이 시작" }));

    await waitFor(() => expect(screen.getByText("퀴즈 화면")).toBeInTheDocument());
  });
```

This test needs `AuthProvider`/`ConnectGate`-equivalent wiring inline because it must assert on the real `googleUserId` used to build the attempt id — reuse the same pattern as `renderWithConnectedAuth` but inline so the test can add extra routes. Add these imports to the top of `SheetValidationPage.test.tsx`:

```typescript
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
```

and reuse the existing `ConnectGate` implementation by importing it — since it currently lives only inside `src/test/renderWithConnectedAuth.tsx` and isn't exported, export it from there instead of duplicating it:

Modify `src/test/renderWithConnectedAuth.tsx` to export `ConnectGate`:

```tsx
export function ConnectGate({ children }: { children: ReactNode }) {
```

(change `function ConnectGate` to `export function ConnectGate` — the rest of the file is unchanged).

Then in `SheetValidationPage.test.tsx`, import it: `import { ConnectGate } from "../test/renderWithConnectedAuth";` and add a `beforeEach` that clears IndexedDB:

```typescript
  beforeEach(() => {
    indexedDB.deleteDatabase("sheet-quiz");
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test src/pages/DriveBrowsePage.test.tsx src/pages/SheetTabSelectPage.test.tsx src/pages/SheetValidationPage.test.tsx`
Expected: FAIL — `SheetTabSelectPage` doesn't forward the new state fields yet, and `SheetValidationPage` has no "풀이 시작" button yet

- [ ] **Step 3: Thread folder context through `DriveBrowsePage`**

In `src/pages/DriveBrowsePage.tsx`, modify `openFile`:

```typescript
  const openFile = (file: DriveFile) => {
    const certificationFolderName = trail.length > 0 ? trail[trail.length - 1].name : topFolder?.folderName ?? "";
    navigate(`/sheets/${file.id}/tabs`, {
      state: {
        fileName: file.name,
        sourceModifiedTime: file.modifiedTime,
        parentFolderId: currentFolderId ?? "",
        certificationFolderName,
      },
    });
  };
```

(`topFolder` is guaranteed non-null by the time this component reaches the point where `openFile` can be called — the `topFolder === null` branch returns earlier — but the `?.` guard keeps this line type-safe without a non-null assertion.)

- [ ] **Step 4: Forward folder context through `SheetTabSelectPage`**

In `src/pages/SheetTabSelectPage.tsx`, extend `LocationState` and both `navigate` calls:

```typescript
interface LocationState {
  fileName?: string;
  sourceModifiedTime?: string;
  parentFolderId?: string;
  certificationFolderName?: string;
}
```

```typescript
export default function SheetTabSelectPage() {
  const { getAccessToken, markExpired } = useAuth();
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState | null) ?? {};
  const fileName = state.fileName ?? "";

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
            state: { ...state, tabId: autoSelected.sheetId, tabTitle: autoSelected.title },
          });
        }
      })
      .catch((err) => {
        if (err instanceof SheetsApiError && err.status === 401) markExpired();
        setError(err instanceof SheetsApiError ? err.message : "Sheet 탭 목록을 불러오지 못했습니다.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadsheetId, getAccessToken, markExpired, navigate, fileName]);

  const selectTab = (tab: SheetTab) => {
    navigate(`/sheets/${spreadsheetId}/validate`, {
      state: { ...state, tabId: tab.sheetId, tabTitle: tab.title },
    });
  };
```

The `eslint-disable-next-line` above the `useEffect` dependency array is necessary because `state` is a fresh object derived from `location.state` on every render (`(location.state as LocationState | null) ?? {}`), so including it in the deps array would re-run the effect on every render; the effect only needs to react to `spreadsheetId` changing, and `state`'s fields are read at call time inside the effect closure. This exact pattern (deliberately narrow deps on a derived-per-render object) mirrors how `fileName` alone was already in the array before this change.

Everything else in the file (the `error`/`tabs` loading branches, `pickQuestionTab` rendering) is unchanged.

- [ ] **Step 5: Add the "풀이 시작" action to `SheetValidationPage`**

In `src/pages/SheetValidationPage.tsx`, add the new imports and state, extend `LocationState`, and add the `startQuiz` handler plus button. Full replacement of the file:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getSheetValues, SheetsApiError } from "../sheets/sheetsClient";
import { parseSheetRows } from "../sheets/parseQuestions";
import { validateQuestions } from "../sheets/validateQuestions";
import { createAttemptId, createSetFingerprint } from "../sheets/fingerprint";
import type { ValidationIssue } from "../sheets/types";
import type { Question } from "../types/question";
import { createInitialProgress } from "../types/progress";
import type { StudyAttempt } from "../types/studyAttempt";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { ErrorBanner } from "../components/ErrorBanner";

interface LocationState {
  fileName?: string;
  tabId?: number;
  tabTitle?: string;
  sourceModifiedTime?: string;
  parentFolderId?: string;
  certificationFolderName?: string;
}

export default function SheetValidationPage() {
  const { getAccessToken, markExpired, googleUserId } = useAuth();
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState | null) ?? {};
  const fileName = state.fileName ?? "";
  const tabTitle = state.tabTitle ?? "";
  const tabId = state.tabId != null ? String(state.tabId) : "";

  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    if (!spreadsheetId) return;
    if (!tabTitle) {
      setStatus("error");
      setLoadError("탭 정보를 찾을 수 없습니다. Sheet 파일을 다시 선택해주세요.");
      return;
    }
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

  const startQuiz = useCallback(async () => {
    if (!spreadsheetId || !googleUserId) return;
    setStarting(true);
    try {
      const fingerprint = createSetFingerprint(questions);
      const attemptId = createAttemptId(googleUserId, spreadsheetId, tabId, fingerprint);
      const existing = await getAttempt(attemptId);
      if (existing) {
        const hasProgress = existing.progress.some((p) => p.status !== "UNSEEN");
        navigate(hasProgress ? `/quiz/${attemptId}/resume` : `/quiz/${attemptId}`);
        return;
      }
      const now = new Date().toISOString();
      const attempt: StudyAttempt = {
        id: attemptId,
        googleUserId,
        spreadsheetId,
        spreadsheetName: fileName,
        sheetTabId: tabId,
        sheetTabName: tabTitle,
        parentFolderId: state.parentFolderId ?? "",
        certificationFolderName: state.certificationFolderName ?? fileName,
        questionSetFingerprint: fingerprint,
        sourceModifiedTime: state.sourceModifiedTime ?? "",
        lastViewedIndex: 0,
        startedAt: now,
        updatedAt: now,
        progress: questions.map((q) => createInitialProgress(q.id)),
        questionSnapshot: questions,
      };
      await saveAttempt(attempt);
      navigate(`/quiz/${attemptId}`);
    } finally {
      setStarting(false);
    }
  }, [
    spreadsheetId,
    googleUserId,
    questions,
    tabId,
    tabTitle,
    fileName,
    state.parentFolderId,
    state.certificationFolderName,
    state.sourceModifiedTime,
    navigate,
  ]);

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
      <button
        type="button"
        onClick={() => void startQuiz()}
        disabled={starting}
        className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-accent-dark"
      >
        {starting ? "준비 중…" : "풀이 시작"}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Register the new routes**

In `src/App.tsx`, add the two imports and routes:

```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./app/AppShell";
import StartPage from "./pages/StartPage";
import TopFolderSelectPage from "./pages/TopFolderSelectPage";
import DriveBrowsePage from "./pages/DriveBrowsePage";
import SheetTabSelectPage from "./pages/SheetTabSelectPage";
import SheetValidationPage from "./pages/SheetValidationPage";
import QuizPage from "./pages/QuizPage";
import ResumeSelectPage from "./pages/ResumeSelectPage";

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
            <Route path="/quiz/:attemptId" element={<QuizPage />} />
            <Route path="/quiz/:attemptId/resume" element={<ResumeSelectPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 7: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all tests including the new ones in this task

- [ ] **Step 8: Typecheck, lint, and build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all three succeed with no new errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/DriveBrowsePage.tsx src/pages/DriveBrowsePage.test.tsx \
  src/pages/SheetTabSelectPage.tsx src/pages/SheetTabSelectPage.test.tsx \
  src/pages/SheetValidationPage.tsx src/pages/SheetValidationPage.test.tsx \
  src/test/renderWithConnectedAuth.tsx src/App.tsx
git commit -m "feat: wire up attempt creation, resume routing, and quiz routes"
```

---

### Task 10: End-to-end quiz-taking flow

**Files:**
- Modify: `e2e/support/googleApiMock.ts`
- Create: `e2e/quiz-flow.spec.ts`

**Interfaces:**
- Consumes: the full app via `page.goto("/")`, the existing `mockGoogleApis` helper.
- Produces: nothing consumed elsewhere — this is the final verification step for the phase.

- [ ] **Step 1: Extend the Sheet fixture with a second question so single-answer navigation is exercised**

The existing fixture in `e2e/support/googleApiMock.ts` already has 2 questions (EC2/S3, both `SINGLE`), which is enough — no changes needed to the mock file itself. Skip to Step 2.

- [ ] **Step 2: Write the E2E test**

```typescript
// e2e/quiz-flow.spec.ts
import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("검증 통과 → 풀이 시작 → 답변 선택 → 다음 문제 → 새로고침 후 이어풀기", async ({ page }) => {
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
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("문제 2 / 2")).toBeVisible();

  await page.reload();
  await expect(page.getByText(/답변 완료/)).toBeVisible();
  await page.getByRole("button", { name: "이어서 풀기" }).click();
  await expect(page.getByText("문제 2 / 2")).toBeVisible();
});
```

- [ ] **Step 3: Run the E2E suite**

Run: `pnpm e2e`
Expected: PASS (both `sheet-select.spec.ts` and the new `quiz-flow.spec.ts`)

- [ ] **Step 4: Commit**

```bash
git add e2e/quiz-flow.spec.ts
git commit -m "test: add E2E coverage for the quiz-taking and resume flow"
```

---

## Self-Review

**Spec coverage:**
- 문제풀이 UI → Task 7 (`QuizPage`), Task 6 (navigator/progress/autosave visuals).
- 단일/복수 정답 선택 → Task 4 (`selectSingleAnswer`/`toggleMultipleAnswer`), Task 7 (radio vs. checkbox rendering, "정답 N개" hint).
- 문제 상태 (안 봄/답변완료/보류/다시 볼 문제/현재 문제) → Task 3 (`NavigatorItem`, `summarizeProgress`), Task 6 (5-state visual coding with color+icon+border).
- IndexedDB 자동저장 → Task 1 (`attempts` store), Task 5 (debounced autosave + `AutosaveStatus`).
- 이어풀기 → Task 8 (`ResumeSelectPage`), Task 9 (`SheetValidationPage` routes to `/resume` when prior progress exists; `QuizPage` always loads by id so refresh/direct-URL works).
- Explicitly out of scope per spec §15 (Phase 4): submission, grading, results, confirm screen — no task builds these; the design mockup's "제출하기" button is intentionally omitted (see Global Constraints).

**Placeholder scan:** No TBD/TODO markers; every step has literal code. The one deliberately-skipped red-step (Task 9, Step 1's `DriveBrowsePage` test) is called out explicitly with a reason, not silently glossed over.

**Type consistency:** `StudyAttempt`, `QuestionProgress`, `Question` are reused as-is from the existing `src/types/*.ts` files (no redefinition). `NavigatorItem`/`ProgressSummary` (Task 3) are consumed with identical field names in Task 5 (`QuizContext`) and Task 6 (`QuestionNavigatorGrid`). `AutosaveStatus` is defined once in Task 5 (`QuizContext.tsx`) and imported (not redefined) in Task 6 (`AutosaveIndicator.tsx`). `createAttemptId`'s parameter order (`googleUserId, spreadsheetId, sheetTabId, fingerprint`) is identical between its Task 2 definition and its Task 9 call site.
