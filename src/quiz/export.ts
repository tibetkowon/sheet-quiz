import type { Question } from "../types/question";
import type { StudyAttempt } from "../types/studyAttempt";
import { computeStudyResult, gradeAttempt } from "./grading";

export function buildResultMarkdown(attempt: StudyAttempt, questions: Question[]): string {
  const result = computeStudyResult(questions, attempt.progress);
  const grades = gradeAttempt(questions, attempt.progress);
  const gradeByQuestionId = new Map(grades.map((g) => [g.questionId, g]));

  const lines: string[] = [];
  lines.push(`# ${attempt.certificationFolderName} · ${attempt.sheetTabName}`);
  lines.push("");
  lines.push(`- 점수: ${result.scorePercent}% (${result.correctCount}/${questions.length})`);
  lines.push(`- 오답: ${result.incorrectCount} · 미응답: ${result.unansweredCount}`);
  lines.push(`- 제출 시각: ${attempt.submittedAt ?? "미제출"}`);
  lines.push("");
  lines.push("## 분류별 정답률");
  result.categoryStats.forEach((stat) => lines.push(`- ${stat.name}: ${stat.correct}/${stat.total}`));
  lines.push("");
  lines.push("## 난이도별 정답률");
  result.difficultyStats.forEach((stat) => lines.push(`- ${stat.name}: ${stat.correct}/${stat.total}`));
  lines.push("");
  lines.push("## 문제별 결과");
  questions.forEach((question) => {
    const grade = gradeByQuestionId.get(question.id);
    const label = !grade?.isAnswered ? "미응답" : grade.isCorrect ? "정답" : "오답";
    lines.push(`### ${question.questionNumber}. ${question.text} (${label})`);
    question.options.forEach((option) => {
      const isCorrectOption = question.correctAnswers.includes(option.key);
      const isSelected = grade?.selectedAnswers.includes(option.key) ?? false;
      const marker = isCorrectOption ? "✔" : isSelected ? "✘" : "-";
      lines.push(`- ${marker} ${option.key}. ${option.text}`);
    });
    lines.push("");
    lines.push(question.explanation);
    lines.push("");
  });
  return lines.join("\n");
}

export function buildResultJson(attempt: StudyAttempt, questions: Question[]): string {
  const result = computeStudyResult(questions, attempt.progress);
  const grades = gradeAttempt(questions, attempt.progress);
  const gradeByQuestionId = new Map(grades.map((g) => [g.questionId, g]));

  const payload = {
    certificationFolderName: attempt.certificationFolderName,
    spreadsheetName: attempt.spreadsheetName,
    sheetTabName: attempt.sheetTabName,
    submittedAt: attempt.submittedAt ?? null,
    result,
    questions: questions.map((question) => {
      const grade = gradeByQuestionId.get(question.id);
      return {
        questionNumber: question.questionNumber,
        text: question.text,
        category: question.category ?? null,
        difficulty: question.difficulty,
        selectedAnswers: grade?.selectedAnswers ?? [],
        correctAnswers: question.correctAnswers,
        isCorrect: grade?.isCorrect ?? false,
        explanation: question.explanation,
      };
    }),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const anchor = document.createElement("a");
  anchor.href = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
