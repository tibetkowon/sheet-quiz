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
