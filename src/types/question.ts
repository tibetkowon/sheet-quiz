export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type QuestionType = "SINGLE" | "MULTIPLE";

export interface QuestionOption {
  key: string;
  text: string;
  explanation?: string;
}

export interface Question {
  id: string;
  sourceRow: number;
  questionNumber: number;
  category?: string;
  difficulty: Difficulty;
  type: QuestionType;
  requiredAnswerCount: number;
  scenario?: string;
  text: string;
  options: QuestionOption[];
  correctAnswers: string[];
  explanation: string;
  keyPoints?: string[];
  relatedTopics?: string[];
  sourceUrl?: string;
}
