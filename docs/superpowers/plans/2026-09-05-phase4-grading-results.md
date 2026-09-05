# Phase 4: 최종 제출·채점·결과 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user submit an in-progress quiz attempt, grade it deterministically against the answer key, and view a results screen with score/category/difficulty breakdowns, per-question correctness, and per-option explanations, with a filter for isolating wrong answers.

**Architecture:** A pure `quiz/grading.ts` module grades each question (exact-set-match, no partial credit, per spec §10) and aggregates a `StudyResult` (already typed in `src/types/studyAttempt.ts` from Phase 3 prep). A new `SubmitConfirmPage` (`/quiz/:attemptId/submit`) shows in-progress stats and, on submit, computes the `StudyResult`, stamps `submittedAt`, saves the attempt, and routes to a new `ResultsPage` (`/results/:attemptId`) that renders the score, per-category/difficulty bars, a result-type filter (전체/정답/오답/미응답/다시볼문제 — this phase's "오답관리"), and an expandable per-question list showing per-option correctness and explanations (`QuestionOption.explanation`, parsed since Phase 2 but unused until now).

**Tech Stack:** React 18 + TypeScript (strict), React Router v6, Tailwind CSS (existing design tokens), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md` (§7 data model — `StudyResult`/`CategoryStat`/`DifficultyStat` already defined in `src/types/studyAttempt.ts`; §10 grading engine — pure functions, exact-set-match, no partial credit, unanswered counts as incorrect; §11 design system — screens 6 "CONFIRM" and 7 "RESULTS" in `docs/design/handoff/풀이장.dc.html`, including the corner-cut "index card" signature element; §15 roadmap item 4 "최종 제출, 채점, 결과, 선택지별 해설, 오답관리").

## Global Constraints

- No global state library — Context + hooks only (spec §5). `SubmitConfirmPage`/`ResultsPage` use local component state; no new Context needed.
- Grading is a pure function, no side effects, unit-testable in isolation (spec §10).
- Single/복수 정답: exact match required, no partial credit. Unanswered (`selectedAnswers.length === 0`) always counts as incorrect for `correctCount`/`incorrectCount` purposes but is tracked separately as `unansweredCount` (spec §10 + the existing `StudyResult` shape).
- Design tokens are already wired up (`tailwind.config.js`) — reuse `bg`, `surface`, `sunken`, `border`, `text`, `accent`, `status.*`, `font-display`/`font-mono`, `shadow-card`. The corner-cut card uses an inline `clipPath` style (no Tailwind utility for arbitrary polygon clip-paths in this project's Tailwind version — using `style` is the established pattern here since there's no existing clip-path utility to reuse).
- Reuse existing pure helpers rather than duplicating: `summarizeProgress` (`src/quiz/navigation.ts`) for the confirm screen's status counts, `ProgressBar` (`src/components/ProgressBar.tsx`) for category/difficulty bars.
- Follow existing repo conventions exactly: `renderWithConnectedAuth`/`MemoryRouter` test harness patterns already used in `QuizPage.test.tsx`/`ResumeSelectPage.test.tsx`, `vi.spyOn` module mocking, attempt-loading pages always fetch by `attemptId` from IndexedDB directly (never trust router state) — this is what makes refresh/direct-URL entry safe, established in Phase 3.
- `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm e2e` must all stay green.

## Scope decisions worth flagging up front

1. **"오답관리" is scoped to the Results screen's filter chips** (전체/정답/오답/미응답/다시볼문제), matching the design mockup's `filterChips` concept exactly. There is no separate persistent "오답노트" feature in this phase — the architecture doc deferred `StudyResult`'s exact shape to this phase precisely so it could match the mockup's filtering, and a standalone wrong-answer notebook is not mentioned anywhere in the roadmap item's wording. If the user wants more (e.g. a dedicated retry-wrong-answers flow), that's a new request, not an oversight.
2. **No submitted-lock on `QuizPage`.** After submitting, a user could theoretically navigate back to `/quiz/:attemptId` and keep changing answers, then resubmit (overwriting the previous `result`/`submittedAt`). This is harmless for a personal single-user tool and adding a lock is unnecessary complexity for this phase — consistent with similar low-risk gaps deferred in Phases 1-3.
3. **`gradeAttempt`'s per-question grading and `computeStudyResult`'s aggregation are separate exported functions** (the latter calls the former) so `ResultsPage` can render per-question correctness without recomputing aggregate stats, and so each layer has its own focused unit tests.

---

### Task 1: Grading engine

**Files:**
- Create: `src/quiz/grading.ts`
- Create: `src/quiz/grading.test.ts`

**Interfaces:**
- Consumes: `Question` (`../types/question`), `QuestionProgress` (`../types/progress`), `CategoryStat`/`DifficultyStat`/`StudyResult` (`../types/studyAttempt`).
- Produces:
  - `interface QuestionGradeResult { questionId: string; isAnswered: boolean; isCorrect: boolean; selectedAnswers: string[]; correctAnswers: string[] }`
  - `gradeQuestion(question: Question, progress: QuestionProgress): QuestionGradeResult`
  - `gradeAttempt(questions: Question[], progress: QuestionProgress[]): QuestionGradeResult[]`
  - `computeStudyResult(questions: Question[], progress: QuestionProgress[]): StudyResult`
  - Used by Task 3 (`SubmitConfirmPage`, via `computeStudyResult`) and Task 5 (`ResultsPage`, via `gradeAttempt`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/quiz/grading.test.ts
import { describe, expect, it } from "vitest";
import { computeStudyResult, gradeAttempt, gradeQuestion } from "./grading";
import type { Question } from "../types/question";
import type { QuestionProgress } from "../types/progress";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    sourceRow: 2,
    questionNumber: 1,
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: "문제",
    options: [
      { key: "A", text: "보기 A" },
      { key: "B", text: "보기 B" },
    ],
    correctAnswers: ["A"],
    explanation: "해설",
    ...overrides,
  };
}

function makeProgress(overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    questionId: "q1",
    selectedAnswers: [],
    status: "UNSEEN",
    reviewMarked: false,
    updatedAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("gradeQuestion", () => {
  it("marks a single-answer question correct on exact match", () => {
    const grade = gradeQuestion(makeQuestion(), makeProgress({ selectedAnswers: ["A"] }));
    expect(grade).toEqual({
      questionId: "q1",
      isAnswered: true,
      isCorrect: true,
      selectedAnswers: ["A"],
      correctAnswers: ["A"],
    });
  });

  it("marks a single-answer question incorrect on mismatch", () => {
    const grade = gradeQuestion(makeQuestion(), makeProgress({ selectedAnswers: ["B"] }));
    expect(grade.isAnswered).toBe(true);
    expect(grade.isCorrect).toBe(false);
  });

  it("marks an unanswered question as not answered and not correct", () => {
    const grade = gradeQuestion(makeQuestion(), makeProgress({ selectedAnswers: [] }));
    expect(grade.isAnswered).toBe(false);
    expect(grade.isCorrect).toBe(false);
  });

  it("requires an exact set match for multiple-answer questions (no partial credit)", () => {
    const question = makeQuestion({ type: "MULTIPLE", correctAnswers: ["A", "B"] });
    const partial = gradeQuestion(question, makeProgress({ selectedAnswers: ["A"] }));
    expect(partial.isCorrect).toBe(false);

    const extra = gradeQuestion(question, makeProgress({ selectedAnswers: ["A", "B", "C"] }));
    expect(extra.isCorrect).toBe(false);

    const exact = gradeQuestion(question, makeProgress({ selectedAnswers: ["B", "A"] }));
    expect(exact.isCorrect).toBe(true);
  });
});

describe("gradeAttempt", () => {
  it("grades every question even when a progress entry is missing", () => {
    const questions = [makeQuestion({ id: "q1" }), makeQuestion({ id: "q2" })];
    const grades = gradeAttempt(questions, [makeProgress({ questionId: "q1", selectedAnswers: ["A"] })]);
    expect(grades).toHaveLength(2);
    expect(grades[0].isCorrect).toBe(true);
    expect(grades[1].isAnswered).toBe(false);
  });
});

describe("computeStudyResult", () => {
  it("counts correct, incorrect, and unanswered separately", () => {
    const questions = [
      makeQuestion({ id: "q1", category: "A", difficulty: "EASY" }),
      makeQuestion({ id: "q2", category: "A", difficulty: "MEDIUM", correctAnswers: ["B"] }),
      makeQuestion({ id: "q3", category: "B", difficulty: "HARD" }),
    ];
    const progress = [
      makeProgress({ questionId: "q1", selectedAnswers: ["A"] }),
      makeProgress({ questionId: "q2", selectedAnswers: ["A"] }),
      makeProgress({ questionId: "q3", selectedAnswers: [] }),
    ];

    const result = computeStudyResult(questions, progress);

    expect(result.correctCount).toBe(1);
    expect(result.incorrectCount).toBe(1);
    expect(result.unansweredCount).toBe(1);
    expect(result.scorePercent).toBe(33);
  });

  it("groups category and difficulty stats, defaulting missing category to 미분류", () => {
    const questions = [
      makeQuestion({ id: "q1", category: undefined, difficulty: "EASY" }),
      makeQuestion({ id: "q2", category: "보안", difficulty: "EASY", correctAnswers: ["B"] }),
    ];
    const progress = [
      makeProgress({ questionId: "q1", selectedAnswers: ["A"] }),
      makeProgress({ questionId: "q2", selectedAnswers: ["A"] }),
    ];

    const result = computeStudyResult(questions, progress);

    expect(result.categoryStats).toEqual(
      expect.arrayContaining([
        { name: "미분류", total: 1, correct: 1 },
        { name: "보안", total: 1, correct: 0 },
      ]),
    );
    expect(result.difficultyStats).toEqual([{ name: "EASY", total: 2, correct: 1 }]);
  });

  it("returns a 0% score with no division-by-zero crash for an empty question set", () => {
    const result = computeStudyResult([], []);
    expect(result).toEqual({
      scorePercent: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
      categoryStats: [],
      difficultyStats: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/quiz/grading.test.ts`
Expected: FAIL — `Cannot find module './grading'`

- [ ] **Step 3: Implement**

```typescript
// src/quiz/grading.ts
import type { Question } from "../types/question";
import type { QuestionProgress } from "../types/progress";
import type { CategoryStat, DifficultyStat, StudyResult } from "../types/studyAttempt";

export interface QuestionGradeResult {
  questionId: string;
  isAnswered: boolean;
  isCorrect: boolean;
  selectedAnswers: string[];
  correctAnswers: string[];
}

function sameAnswerSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

export function gradeQuestion(question: Question, progress: QuestionProgress): QuestionGradeResult {
  const selectedAnswers = progress.selectedAnswers;
  const isAnswered = selectedAnswers.length > 0;
  return {
    questionId: question.id,
    isAnswered,
    isCorrect: isAnswered && sameAnswerSet(selectedAnswers, question.correctAnswers),
    selectedAnswers,
    correctAnswers: question.correctAnswers,
  };
}

export function gradeAttempt(questions: Question[], progress: QuestionProgress[]): QuestionGradeResult[] {
  const progressByQuestionId = new Map(progress.map((p) => [p.questionId, p]));
  return questions.map((question) =>
    gradeQuestion(
      question,
      progressByQuestionId.get(question.id) ?? {
        questionId: question.id,
        selectedAnswers: [],
        status: "UNSEEN",
        reviewMarked: false,
        updatedAt: "",
      },
    ),
  );
}

function bumpStat(map: Map<string, { total: number; correct: number }>, key: string, isCorrect: boolean): void {
  const stat = map.get(key) ?? { total: 0, correct: 0 };
  stat.total += 1;
  if (isCorrect) stat.correct += 1;
  map.set(key, stat);
}

export function computeStudyResult(questions: Question[], progress: QuestionProgress[]): StudyResult {
  const grades = gradeAttempt(questions, progress);
  const categoryMap = new Map<string, { total: number; correct: number }>();
  const difficultyMap = new Map<string, { total: number; correct: number }>();
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  questions.forEach((question, index) => {
    const grade = grades[index];
    if (!grade.isAnswered) unansweredCount += 1;
    else if (grade.isCorrect) correctCount += 1;
    else incorrectCount += 1;

    bumpStat(categoryMap, question.category ?? "미분류", grade.isCorrect);
    bumpStat(difficultyMap, question.difficulty, grade.isCorrect);
  });

  const total = questions.length;
  const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const categoryStats: CategoryStat[] = Array.from(categoryMap, ([name, stat]) => ({ name, ...stat }));
  const difficultyStats: DifficultyStat[] = Array.from(difficultyMap, ([name, stat]) => ({ name, ...stat }));

  return { scorePercent, correctCount, incorrectCount, unansweredCount, categoryStats, difficultyStats };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/quiz/grading.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/quiz/grading.ts src/quiz/grading.test.ts
git commit -m "feat: add pure grading engine for study attempts"
```

---

### Task 2: `submitAttempt` action

**Files:**
- Modify: `src/quiz/attemptActions.ts`
- Modify: `src/quiz/attemptActions.test.ts`

**Interfaces:**
- Consumes: `StudyResult` (`../types/studyAttempt`, add to the existing `StudyAttempt` import on the same line).
- Produces: `submitAttempt(attempt: StudyAttempt, result: StudyResult): StudyAttempt` — used by Task 3 (`SubmitConfirmPage`).

- [ ] **Step 1: Write the failing test**

Add to `src/quiz/attemptActions.test.ts` (add `submitAttempt` to the existing import line from `./attemptActions`, and add a `StudyResult` fixture plus this new `describe` block):

```typescript
function makeResult(): StudyResult {
  return {
    scorePercent: 100,
    correctCount: 2,
    incorrectCount: 0,
    unansweredCount: 0,
    categoryStats: [],
    difficultyStats: [],
  };
}

describe("submitAttempt", () => {
  it("stamps the result and submittedAt", () => {
    const result = submitAttempt(makeAttempt(), makeResult());
    expect(result.result).toEqual(makeResult());
    expect(result.submittedAt).toBeDefined();
    expect(() => new Date(result.submittedAt as string).toISOString()).not.toThrow();
  });

  it("does not mutate the original attempt", () => {
    const original = makeAttempt();
    submitAttempt(original, makeResult());
    expect(original.result).toBeUndefined();
    expect(original.submittedAt).toBeUndefined();
  });
});
```

Add `import type { StudyResult } from "../types/studyAttempt";` to the top of the file, and add `submitAttempt` to the existing `import { ... } from "./attemptActions";` line.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/quiz/attemptActions.test.ts`
Expected: FAIL — `submitAttempt` is not exported

- [ ] **Step 3: Implement**

In `src/quiz/attemptActions.ts`, change the top import line from:

```typescript
import type { StudyAttempt } from "../types/studyAttempt";
```

to:

```typescript
import type { StudyAttempt, StudyResult } from "../types/studyAttempt";
```

Then add at the end of the file:

```typescript
export function submitAttempt(attempt: StudyAttempt, result: StudyResult): StudyAttempt {
  const timestamp = nowIso();
  return { ...attempt, result, submittedAt: timestamp, updatedAt: timestamp };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/quiz/attemptActions.test.ts`
Expected: PASS (all existing tests plus the 2 new `submitAttempt` tests)

- [ ] **Step 5: Commit**

```bash
git add src/quiz/attemptActions.ts src/quiz/attemptActions.test.ts
git commit -m "feat: add submitAttempt action to stamp grading results"
```

---

### Task 3: Submit confirmation screen

**Files:**
- Create: `src/pages/SubmitConfirmPage.tsx`
- Create: `src/pages/SubmitConfirmPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getAttempt`/`saveAttempt` (`../storage/attemptRepo`), `submitAttempt` (`../quiz/attemptActions`, Task 2), `computeStudyResult` (`../quiz/grading`, Task 1), `summarizeProgress` (`../quiz/navigation`, existing from Phase 3).
- Produces: `export default function SubmitConfirmPage()`, mounted at `/quiz/:attemptId/submit`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/SubmitConfirmPage.test.tsx
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import SubmitConfirmPage from "./SubmitConfirmPage";

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

function makeAttempt(questions: Question[], progressOverrides: Partial<StudyAttempt["progress"][number]>[] = []): StudyAttempt {
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
    startedAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    progress: questions.map((q, i) => ({
      questionId: q.id,
      selectedAnswers: [],
      status: "UNSEEN" as const,
      reviewMarked: false,
      updatedAt: "2026-09-05T00:00:00.000Z",
      ...progressOverrides[i],
    })),
    questionSnapshot: questions,
  };
}

function renderConfirm(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/quiz/${id}/submit`]}>
      <Routes>
        <Route path="/quiz/:attemptId/submit" element={<SubmitConfirmPage />} />
        <Route path="/quiz/:attemptId" element={<div>퀴즈 화면</div>} />
        <Route path="/results/:attemptId" element={<div>결과 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SubmitConfirmPage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("shows the current progress counts", async () => {
    await saveAttempt(
      makeAttempt(
        [makeQuestion("q1", 1), makeQuestion("q2", 2), makeQuestion("q3", 3)],
        [{ status: "ANSWERED", selectedAnswers: ["A"] }, { status: "SKIPPED" }, {}],
      ),
    );

    renderConfirm("attempt-1");

    await waitFor(() => screen.getByText("제출하기 전에 확인하세요"));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("navigates back to the quiz on 계속 풀기", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1)]));

    renderConfirm("attempt-1");
    await waitFor(() => screen.getByRole("button", { name: "계속 풀기" }));
    await userEvent.click(screen.getByRole("button", { name: "계속 풀기" }));

    await waitFor(() => expect(screen.getByText("퀴즈 화면")).toBeInTheDocument());
  });

  it("grades, saves, and navigates to results on 제출하기", async () => {
    await saveAttempt(
      makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)], [{ selectedAnswers: ["A"] }, { selectedAnswers: ["B"] }]),
    );

    renderConfirm("attempt-1");
    await waitFor(() => screen.getByRole("button", { name: "제출하기" }));
    await userEvent.click(screen.getByRole("button", { name: "제출하기" }));

    await waitFor(() => expect(screen.getByText("결과 화면")).toBeInTheDocument());
    const saved = await getAttempt("attempt-1");
    expect(saved?.result?.correctCount).toBe(1);
    expect(saved?.result?.incorrectCount).toBe(1);
    expect(saved?.submittedAt).toBeDefined();
  });

  it("shows a not-found message when the attempt id doesn't exist", async () => {
    renderConfirm("missing-attempt");

    await waitFor(() =>
      expect(screen.getByText(/풀이 기록을 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/pages/SubmitConfirmPage.test.tsx`
Expected: FAIL — `Cannot find module './SubmitConfirmPage'`

- [ ] **Step 3: Implement**

```tsx
// src/pages/SubmitConfirmPage.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { submitAttempt } from "../quiz/attemptActions";
import { computeStudyResult } from "../quiz/grading";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";

export default function SubmitConfirmPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!attemptId) return;
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

  const summary = summarizeProgress(attempt.progress);

  const submit = async () => {
    if (!attemptId || !attempt.questionSnapshot) return;
    setSubmitting(true);
    try {
      const result = computeStudyResult(attempt.questionSnapshot, attempt.progress);
      const submitted = submitAttempt(attempt, result);
      await saveAttempt(submitted);
      navigate(`/results/${attemptId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">제출하기 전에 확인하세요</h1>
      <p className="mb-5 text-[13.5px] text-text-secondary dark:text-text-dark-secondary">
        제출 후에도 결과 화면에서 문제별 해설을 다시 볼 수 있습니다.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-2.5">
        <div className="rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-text-secondary dark:text-text-dark-secondary">전체</div>
          <div className="font-mono text-xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-lg border border-status-answered bg-surface p-4 dark:border-status-answered-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-status-answered dark:text-status-answered-dark">답변완료</div>
          <div className="font-mono text-xl font-semibold text-status-answered dark:text-status-answered-dark">
            {summary.answered}
          </div>
        </div>
        <div className="rounded-lg border border-status-held bg-surface p-4 dark:border-status-held-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-status-held dark:text-status-held-dark">보류</div>
          <div className="font-mono text-xl font-semibold text-status-held dark:text-status-held-dark">
            {summary.held}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-sunken p-4 dark:border-border-dark dark:bg-sunken-dark">
          <div className="mb-1 text-xs text-text-secondary dark:text-text-dark-secondary">미응답</div>
          <div className="font-mono text-xl font-semibold">{summary.unseen}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-status-review bg-surface p-4 dark:border-status-review-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-status-review dark:text-status-review-dark">다시 볼 문제</div>
          <div className="font-mono text-xl font-semibold text-status-review dark:text-status-review-dark">
            {summary.flagged}
          </div>
        </div>
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => navigate(`/quiz/${attemptId}`)}
          className="flex-1 rounded border border-border px-4 py-3 text-sm dark:border-border-dark"
        >
          계속 풀기
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="flex-1 rounded bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-accent-dark"
        >
          {submitting ? "제출 중…" : "제출하기"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register the route**

In `src/App.tsx`, add the import and route:

```tsx
import SubmitConfirmPage from "./pages/SubmitConfirmPage";
```

```tsx
            <Route path="/quiz/:attemptId/resume" element={<ResumeSelectPage />} />
            <Route path="/quiz/:attemptId/submit" element={<SubmitConfirmPage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/pages/SubmitConfirmPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/pages/SubmitConfirmPage.tsx src/pages/SubmitConfirmPage.test.tsx src/App.tsx
git commit -m "feat: add submit confirmation screen"
```

---

### Task 4: Wire "제출하기" into the quiz screen

**Files:**
- Modify: `src/pages/QuizPage.tsx`
- Modify: `src/pages/QuizPage.test.tsx`

**Interfaces:**
- Consumes: `attempt.id` from `useQuiz()` (already exposed by `QuizContext`, just not previously destructured in `QuizPageContent`).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Write the failing test**

Add to `src/pages/QuizPage.test.tsx` inside `describe("QuizPage", ...)`:

```tsx
  it("navigates to the submit confirmation screen when 제출하기 is clicked", async () => {
    await saveAttempt(makeAttempt([makeQuestion("q1", 1), makeQuestion("q2", 2)]));

    render(
      <MemoryRouter initialEntries={["/quiz/attempt-1"]}>
        <Routes>
          <Route path="/quiz/:attemptId" element={<QuizPage />} />
          <Route path="/quiz/:attemptId/submit" element={<div>제출 확인 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText("문제 1"));

    await userEvent.click(screen.getByRole("button", { name: "제출하기" }));

    await waitFor(() => expect(screen.getByText("제출 확인 화면")).toBeInTheDocument());
  });
```

(The existing `renderQuiz` helper in this file hardcodes a single `Route`; this new test renders its own `MemoryRouter`/`Routes` inline, matching the style already used for the "shows a not-found message" test's setup — check the existing file for the exact `MemoryRouter`/`Route`/`Routes` import line and extend it if needed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/pages/QuizPage.test.tsx`
Expected: FAIL — no element with the role "button" and name "제출하기"

- [ ] **Step 3: Implement**

In `src/pages/QuizPage.tsx`, add `useNavigate` to the react-router-dom import:

```tsx
import { Link, useNavigate, useParams } from "react-router-dom";
```

In `QuizPageContent`, add `attempt` to the `useQuiz()` destructuring and call `useNavigate()`:

```tsx
function QuizPageContent() {
  const {
    attempt,
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
    goNextUnseen,
    goNextHeld,
    goNextFlagged,
  } = useQuiz();
  const navigate = useNavigate();
  const [showExplanation, setShowExplanation] = useState(false);
```

Then add a "제출하기" button to the bottom action bar, after the existing "다음" button:

```tsx
        <button
          type="button"
          onClick={goNext}
          disabled={isLast}
          className="rounded border border-border px-4.5 py-2.5 text-sm disabled:opacity-40 dark:border-border-dark"
        >
          다음
        </button>
        <button
          type="button"
          onClick={() => navigate(`/quiz/${attempt.id}/submit`)}
          className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
        >
          제출하기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/pages/QuizPage.test.tsx`
Expected: PASS (all existing tests plus the new one)

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizPage.tsx src/pages/QuizPage.test.tsx
git commit -m "feat: add 제출하기 button to the quiz screen"
```

---

### Task 5: Results screen

**Files:**
- Create: `src/pages/ResultsPage.tsx`
- Create: `src/pages/ResultsPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getAttempt` (`../storage/attemptRepo`), `gradeAttempt` (`../quiz/grading`, Task 1), `ProgressBar` (`../components/ProgressBar`).
- Produces: `export default function ResultsPage()`, mounted at `/results/:attemptId`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ResultsPage.test.tsx
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { saveAttempt } from "../storage/attemptRepo";
import { computeStudyResult } from "../quiz/grading";
import type { StudyAttempt } from "../types/studyAttempt";
import type { Question } from "../types/question";
import ResultsPage from "./ResultsPage";

function makeQuestion(id: string, questionNumber: number, overrides: Partial<Question> = {}): Question {
  return {
    id,
    sourceRow: questionNumber + 1,
    questionNumber,
    category: "컴퓨팅",
    difficulty: "MEDIUM",
    type: "SINGLE",
    requiredAnswerCount: 1,
    text: `문제 ${questionNumber} 본문`,
    options: [
      { key: "A", text: "정답 보기", explanation: "A가 정답인 이유" },
      { key: "B", text: "오답 보기", explanation: "B가 오답인 이유" },
    ],
    correctAnswers: ["A"],
    explanation: `문제 ${questionNumber} 해설`,
    ...overrides,
  };
}

function makeSubmittedAttempt(): StudyAttempt {
  const questions = [
    makeQuestion("q1", 1, { category: "컴퓨팅", difficulty: "EASY" }),
    makeQuestion("q2", 2, { category: "보안", difficulty: "MEDIUM" }),
    makeQuestion("q3", 3, { category: "네트워크", difficulty: "HARD" }),
  ];
  const progress = [
    { questionId: "q1", selectedAnswers: ["A"], status: "ANSWERED" as const, reviewMarked: false, updatedAt: "" },
    { questionId: "q2", selectedAnswers: ["B"], status: "ANSWERED" as const, reviewMarked: true, updatedAt: "" },
    { questionId: "q3", selectedAnswers: [], status: "UNSEEN" as const, reviewMarked: false, updatedAt: "" },
  ];
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
    startedAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    submittedAt: "2026-09-05T00:05:00.000Z",
    progress,
    questionSnapshot: questions,
    result: computeStudyResult(questions, progress),
  };
}

function renderResults(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/results/${id}`]}>
      <Routes>
        <Route path="/results/:attemptId" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResultsPage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("shows the score, correct/total, and flagged counts", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");

    await waitFor(() => expect(screen.getByText("33%")).toBeInTheDocument());
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("filters to only incorrect questions when 오답 is selected", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");
    await waitFor(() => screen.getByText("문제 1 본문"));
    expect(screen.getByText("문제 2 본문")).toBeInTheDocument();
    expect(screen.getByText("문제 3 본문")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "오답" }));

    expect(screen.queryByText("문제 1 본문")).not.toBeInTheDocument();
    expect(screen.getByText("문제 2 본문")).toBeInTheDocument();
    expect(screen.queryByText("문제 3 본문")).not.toBeInTheDocument();
  });

  it("expands a question to show per-option correctness and explanations", async () => {
    await saveAttempt(makeSubmittedAttempt());

    renderResults("attempt-1");
    await waitFor(() => screen.getByText("문제 2 본문"));

    await userEvent.click(screen.getByText("문제 2 본문"));

    expect(screen.getByText("A가 정답인 이유")).toBeInTheDocument();
    expect(screen.getByText("B가 오답인 이유")).toBeInTheDocument();
  });

  it("shows a not-found message when the attempt hasn't been submitted", async () => {
    const attempt = makeSubmittedAttempt();
    await saveAttempt({ ...attempt, result: undefined, submittedAt: undefined });

    renderResults("attempt-1");

    await waitFor(() =>
      expect(screen.getByText(/제출된 결과를 찾을 수 없습니다/)).toBeInTheDocument(),
    );
  });
});
```

`makeSubmittedAttempt`'s three questions deliberately use distinct category/difficulty pairs. An earlier draft gave all three the same category ("컴퓨팅") and difficulty ("MEDIUM"), which made `computeStudyResult` produce a categoryStat of `{total:3,correct:1}` and a difficultyStat of `{total:3,correct:1}` — both rendering as "1/3", the same text as the "정답 / 전체" summary card. `screen.getByText("1/3")` then failed with a multiple-elements-found error. Found by actually running the test, fixed by giving each question its own category and difficulty so no stat group's fraction collides with another's.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/pages/ResultsPage.test.tsx`
Expected: FAIL — `Cannot find module './ResultsPage'`

- [ ] **Step 3: Implement**

```tsx
// src/pages/ResultsPage.tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAttempt } from "../storage/attemptRepo";
import { gradeAttempt } from "../quiz/grading";
import { ProgressBar } from "../components/ProgressBar";
import type { StudyAttempt } from "../types/studyAttempt";

type ResultFilter = "all" | "correct" | "incorrect" | "unanswered" | "flagged";

const FILTERS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "correct", label: "정답" },
  { key: "incorrect", label: "오답" },
  { key: "unanswered", label: "미응답" },
  { key: "flagged", label: "다시 볼 문제" },
];

export default function ResultsPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    getAttempt(attemptId).then((found) => {
      if (!found || !found.questionSnapshot || found.questionSnapshot.length === 0 || !found.result) {
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

  if (state === "not-found" || !attempt || !attempt.result || !attempt.questionSnapshot) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          제출된 결과를 찾을 수 없습니다. 아직 제출하지 않았다면 문제풀이 화면으로 돌아가 제출해주세요.
        </p>
        <Link to="/folders" className="text-sm font-semibold text-accent dark:text-accent-dark">
          Drive 폴더로 이동
        </Link>
      </div>
    );
  }

  return <ResultsPageContent attempt={attempt} result={attempt.result} questions={attempt.questionSnapshot} />;
}

function ResultsPageContent({
  attempt,
  result,
  questions,
}: {
  attempt: StudyAttempt;
  result: NonNullable<StudyAttempt["result"]>;
  questions: NonNullable<StudyAttempt["questionSnapshot"]>;
}) {
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const progressByQuestionId = new Map(attempt.progress.map((p) => [p.questionId, p]));
  const grades = gradeAttempt(questions, attempt.progress);
  const gradeByQuestionId = new Map(grades.map((g) => [g.questionId, g]));
  const flaggedCount = attempt.progress.filter((p) => p.reviewMarked).length;

  const rows = questions.filter((question) => {
    const grade = gradeByQuestionId.get(question.id);
    const progress = progressByQuestionId.get(question.id);
    if (!grade) return false;
    if (filter === "correct") return grade.isCorrect;
    if (filter === "incorrect") return grade.isAnswered && !grade.isCorrect;
    if (filter === "unanswered") return !grade.isAnswered;
    if (filter === "flagged") return progress?.reviewMarked ?? false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <div className="mb-7 grid grid-cols-3 gap-3.5">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1.5 text-xs text-text-secondary dark:text-text-dark-secondary">점수</div>
          <div className="font-display text-3xl font-bold">{result.scorePercent}%</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1.5 text-xs text-text-secondary dark:text-text-dark-secondary">정답 / 전체</div>
          <div className="font-mono text-2xl font-semibold">
            {result.correctCount}/{questions.length}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1.5 text-xs text-text-secondary dark:text-text-dark-secondary">다시 볼 문제</div>
          <div className="font-mono text-2xl font-semibold text-status-review dark:text-status-review-dark">
            {flaggedCount}
          </div>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2.5 text-sm font-semibold text-text-secondary dark:text-text-dark-secondary">
            분류별 정답률
          </div>
          <div className="flex flex-col gap-2.5">
            {result.categoryStats.map((stat) => (
              <div key={stat.name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{stat.name}</span>
                  <span className="font-mono text-text-secondary dark:text-text-dark-secondary">
                    {stat.correct}/{stat.total}
                  </span>
                </div>
                <ProgressBar percent={stat.total > 0 ? (stat.correct / stat.total) * 100 : 0} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2.5 text-sm font-semibold text-text-secondary dark:text-text-dark-secondary">
            난이도별 정답률
          </div>
          <div className="flex flex-col gap-2.5">
            {result.difficultyStats.map((stat) => (
              <div key={stat.name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>난이도 {stat.name}</span>
                  <span className="font-mono text-text-secondary dark:text-text-dark-secondary">
                    {stat.correct}/{stat.total}
                  </span>
                </div>
                <ProgressBar percent={stat.total > 0 ? (stat.correct / stat.total) * 100 : 0} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${
              filter === f.key
                ? "border-accent bg-accent-soft text-accent dark:border-accent-dark dark:bg-accent-dark-soft dark:text-accent-dark"
                : "border-border bg-sunken text-text-secondary dark:border-border-dark dark:bg-sunken-dark dark:text-text-dark-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((question) => {
          const grade = gradeByQuestionId.get(question.id)!;
          const progress = progressByQuestionId.get(question.id);
          const isExpanded = expandedId === question.id;
          const resultLabel = !grade.isAnswered ? "미응답" : grade.isCorrect ? "정답" : "오답";
          const resultColorClass = !grade.isAnswered
            ? "text-text-secondary dark:text-text-dark-secondary"
            : grade.isCorrect
              ? "text-status-answered dark:text-status-answered-dark"
              : "text-status-review dark:text-status-review-dark";

          return (
            <div
              key={question.id}
              className="overflow-hidden rounded-lg border border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
              style={{ clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)" }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : question.id)}
                className="flex w-full items-center gap-3 px-4.5 py-3.5 text-left"
              >
                <span className="w-7 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {question.questionNumber}
                </span>
                {question.category && (
                  <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-text-secondary dark:bg-sunken-dark dark:text-text-dark-secondary">
                    {question.category}
                  </span>
                )}
                <span className="flex-1 truncate text-[13.5px] text-text-secondary dark:text-text-dark-secondary">
                  {question.text}
                </span>
                {progress?.reviewMarked && <span aria-label="다시 볼 문제로 표시됨">⚑</span>}
                <span className={`text-xs font-semibold ${resultColorClass}`}>{resultLabel}</span>
              </button>
              {isExpanded && (
                <div className="flex flex-col gap-2 px-4.5 pb-4 pl-14">
                  {question.options.map((option) => {
                    const isCorrectOption = grade.correctAnswers.includes(option.key);
                    const isSelected = grade.selectedAnswers.includes(option.key);
                    return (
                      <div
                        key={option.key}
                        className={`rounded border px-3 py-2 text-[13px] ${
                          isCorrectOption
                            ? "border-status-answered dark:border-status-answered-dark"
                            : isSelected
                              ? "border-status-review dark:border-status-review-dark"
                              : "border-border dark:border-border-dark"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{option.key}</span>
                          <span>{option.text}</span>
                          {isCorrectOption && (
                            <span className="text-xs font-semibold text-status-answered dark:text-status-answered-dark">
                              정답
                            </span>
                          )}
                          {isSelected && !isCorrectOption && (
                            <span className="text-xs font-semibold text-status-review dark:text-status-review-dark">
                              선택함
                            </span>
                          )}
                        </div>
                        {option.explanation && (
                          <p className="m-0 mt-1 text-xs text-text-secondary dark:text-text-dark-secondary">
                            {option.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <p className="m-0 mt-1 text-[13.5px] leading-[1.65] text-text-secondary dark:text-text-dark-secondary">
                    {question.explanation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register the route**

In `src/App.tsx`, add the import and route:

```tsx
import ResultsPage from "./pages/ResultsPage";
```

```tsx
            <Route path="/quiz/:attemptId/submit" element={<SubmitConfirmPage />} />
            <Route path="/results/:attemptId" element={<ResultsPage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/pages/ResultsPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/pages/ResultsPage.tsx src/pages/ResultsPage.test.tsx src/App.tsx
git commit -m "feat: add results screen with filters and per-option explanations"
```

---

### Task 6: End-to-end submit-and-results flow

**Files:**
- Create: `e2e/results-flow.spec.ts`

**Interfaces:**
- Consumes: the full app via `page.goto("/")`, the existing `mockGoogleApis` helper from `e2e/support/googleApiMock.ts` (already provides 2 SINGLE-type questions for `sheet-1`: EC2 with correct answer "가상서버", S3 with correct answer "객체스토리지" — see Phase 2/3 fixtures).
- Produces: nothing consumed elsewhere — this is the final verification step for the phase.

- [ ] **Step 1: Write the E2E test**

```typescript
// e2e/results-flow.spec.ts
import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("문제풀이 → 제출 확인 → 제출 → 결과 확인", async ({ page }) => {
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

  await page.getByRole("button", { name: "제출하기" }).click();
  await expect(page.getByText("제출하기 전에 확인하세요")).toBeVisible();
  await page.getByRole("button", { name: "제출하기" }).click();

  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText("2/2")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm e2e`
Expected: PASS (`drive-connect.spec.ts`, `sheet-select.spec.ts`, `quiz-flow.spec.ts`, and the new `results-flow.spec.ts`)

- [ ] **Step 3: Commit**

```bash
git add e2e/results-flow.spec.ts
git commit -m "test: add E2E coverage for the submit-and-results flow"
```

---

## Self-Review

**Spec coverage:**
- 최종 제출 → Task 3 (`SubmitConfirmPage`), Task 4 (제출하기 button wiring).
- 채점 → Task 1 (`quiz/grading.ts`, exact-match/no-partial-credit per spec §10).
- 결과 → Task 5 (`ResultsPage` — score, category/difficulty breakdowns, per-question list).
- 선택지별 해설 → Task 5's per-option rendering of `QuestionOption.explanation` (parsed since Phase 2, unused until now).
- 오답관리 → Task 5's filter chips (전체/정답/오답/미응답/다시볼문제) — see "Scope decisions" section for why this, not a separate notebook feature, is the intended scope.

**Placeholder scan:** No TBD/TODO markers; every step has literal code.

**Type consistency:** `StudyResult`/`CategoryStat`/`DifficultyStat` are reused as-is from `src/types/studyAttempt.ts` (defined in Phase 3 prep, unchanged here). `QuestionGradeResult` (Task 1) is consumed with identical field names in Task 5 (`ResultsPage`'s `grade.isCorrect`/`grade.isAnswered`/`grade.selectedAnswers`/`grade.correctAnswers`). `submitAttempt`'s parameter order (`attempt, result`) is identical between its Task 2 definition and its Task 3 call site. Route paths (`/quiz/:attemptId/submit`, `/results/:attemptId`) match the architecture spec's routing table (§6) exactly.
