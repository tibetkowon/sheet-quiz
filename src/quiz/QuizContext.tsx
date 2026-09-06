// src/quiz/QuizContext.tsx
import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const latestRef = useRef(attempt);
  const pendingRef = useRef<StudyAttempt | null>(null);
  const mountedRef = useRef(true);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    void saveAttempt(pending).then(() => {
      if (mountedRef.current && latestRef.current === pending) setAutosaveStatus("saved");
    }).catch(() => {
      if (latestRef.current !== pending) return;
      pendingRef.current = pending;
      if (mountedRef.current) setAutosaveStatus("error");
    });
  }, []);

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

  useLayoutEffect(() => {
    latestRef.current = attempt;
    pendingRef.current = attempt;
    setAutosaveStatus("saving");
    const timer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [attempt, flush]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", flush);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

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
