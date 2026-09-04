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
