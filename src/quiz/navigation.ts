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
