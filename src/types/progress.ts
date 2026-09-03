export type QuestionAnswerStatus = "UNSEEN" | "ANSWERED" | "SKIPPED";

export interface QuestionProgress {
  questionId: string;
  selectedAnswers: string[];
  status: QuestionAnswerStatus;
  reviewMarked: boolean;
  personalMemo?: string;
  firstViewedAt?: string;
  answeredAt?: string;
  updatedAt: string;
}

export function createInitialProgress(questionId: string): QuestionProgress {
  return {
    questionId,
    selectedAnswers: [],
    status: "UNSEEN",
    reviewMarked: false,
    updatedAt: new Date().toISOString(),
  };
}
