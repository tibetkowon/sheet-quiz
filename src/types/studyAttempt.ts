import type { Question } from "./question";
import type { QuestionProgress } from "./progress";

export interface CategoryStat {
  name: string;
  total: number;
  correct: number;
}

export interface DifficultyStat {
  name: string;
  total: number;
  correct: number;
}

export interface StudyResult {
  scorePercent: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  categoryStats: CategoryStat[];
  difficultyStats: DifficultyStat[];
}

export interface StudyAttempt {
  id: string;
  googleUserId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetTabId: string;
  sheetTabName: string;
  parentFolderId: string;
  certificationFolderName: string;
  questionSetFingerprint: string;
  sourceModifiedTime: string;
  lastViewedQuestionId?: string;
  lastViewedIndex: number;
  startedAt: string;
  updatedAt: string;
  submittedAt?: string;
  progress: QuestionProgress[];
  result?: StudyResult;
  questionSnapshot?: Question[];
}
