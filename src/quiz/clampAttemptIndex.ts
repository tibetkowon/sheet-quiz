import type { StudyAttempt } from "../types/studyAttempt";

export function clampAttemptIndex(attempt: StudyAttempt): StudyAttempt {
  const lastIndex = Math.max(0, (attempt.questionSnapshot?.length ?? 0) - 1);
  const index = Number.isFinite(attempt.lastViewedIndex) ? Math.trunc(attempt.lastViewedIndex) : 0;
  const lastViewedIndex = Math.max(0, Math.min(lastIndex, index));
  return lastViewedIndex === attempt.lastViewedIndex ? attempt : { ...attempt, lastViewedIndex };
}
