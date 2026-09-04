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
  const index = attempt.progress.findIndex((p) => p.questionId === questionId);
  if (index === -1) return attempt;
  const updated = updater(attempt.progress[index]);
  if (updated === attempt.progress[index]) return attempt;
  const progress = attempt.progress.slice();
  progress[index] = updated;
  return { ...attempt, progress, updatedAt: nowIso() };
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
  return updateProgress(attempt, questionId, (p) => (p.status === "SKIPPED" ? p : { ...p, status: "SKIPPED" }));
}

export function toggleReviewMarked(attempt: StudyAttempt, questionId: string): StudyAttempt {
  return updateProgress(attempt, questionId, (p) => ({ ...p, reviewMarked: !p.reviewMarked }));
}

export function markFirstViewed(attempt: StudyAttempt, questionId: string): StudyAttempt {
  return updateProgress(attempt, questionId, (p) => (p.firstViewedAt ? p : { ...p, firstViewedAt: nowIso() }));
}

export function moveToIndex(attempt: StudyAttempt, index: number): StudyAttempt {
  if (index === attempt.lastViewedIndex) return attempt;
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
