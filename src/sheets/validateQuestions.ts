import type { Difficulty, Question, QuestionOption, QuestionType } from "../types/question";
import { createQuestionId } from "./fingerprint";
import { REQUIRED_HEADER_KEYS } from "./headerMap";
import type { RawQuestionRow } from "./parseQuestions";
import type { ValidationIssue } from "./types";

const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d", "option_e", "option_f"] as const;
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const DIFFICULTY_MAP: Record<string, Difficulty> = {
  EASY: "EASY",
  쉬움: "EASY",
  MEDIUM: "MEDIUM",
  보통: "MEDIUM",
  HARD: "HARD",
  어려움: "HARD",
};

const TYPE_MAP: Record<string, QuestionType> = {
  SINGLE: "SINGLE",
  단일: "SINGLE",
  "단일 정답": "SINGLE",
  "객관식 단일": "SINGLE",
  MULTIPLE: "MULTIPLE",
  복수: "MULTIPLE",
  "복수 정답": "MULTIPLE",
  "객관식 복수": "MULTIPLE",
};

const ACTIVE_STATUSES = new Set(["PUBLISHED", "출제", "ACTIVE", "사용"]);
// 상태가 비어 있으면 사용 가능으로 취급하고, 값이 있는데 ACTIVE_STATUSES에
// 없으면(DRAFT/초안/INACTIVE/미사용 포함, 그 외 인식 불가 값도) 제외한다.

export interface ValidateContext {
  sheetName: string;
  spreadsheetId: string;
  sheetTabId: string;
}

function issue(
  context: ValidateContext,
  rowNumber: number,
  questionNumber: number | null,
  field: string,
  message: string,
  severity: "error" | "warning",
): ValidationIssue {
  return { sheetName: context.sheetName, rowNumber, questionNumber, field, message, severity };
}

export function validateQuestions(
  headerIndex: Record<string, number>,
  rows: RawQuestionRow[],
  context: ValidateContext,
): { questions: Question[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  const missingHeaders = REQUIRED_HEADER_KEYS.filter((key) => !(key in headerIndex));
  if (missingHeaders.length > 0) {
    issues.push(
      issue(context, 1, null, "header", `필수 헤더가 없습니다: ${missingHeaders.join(", ")}`, "error"),
    );
    return { questions: [], issues };
  }

  const questions: Question[] = [];
  const seenNumbers = new Map<number, number>();
  let autoNumber = 0;

  for (const row of rows) {
    const v = row.values;

    const status = v.status ?? "";
    if (status && !ACTIVE_STATUSES.has(status)) continue;

    autoNumber += 1;

    const rowIssues: ValidationIssue[] = [];
    let hasBlockingError = false;

    const questionText = v.question ?? "";
    if (!questionText) {
      rowIssues.push(issue(context, row.rowNumber, null, "question", "문제 본문이 비어 있습니다.", "error"));
      hasBlockingError = true;
    }

    let questionNumber = autoNumber;
    const rawNumber = v.question_no ? Number(v.question_no) : NaN;
    if (v.question_no && !Number.isFinite(rawNumber)) {
      rowIssues.push(
        issue(
          context,
          row.rowNumber,
          null,
          "question_no",
          `문제 번호를 숫자로 해석할 수 없습니다: ${v.question_no}`,
          "error",
        ),
      );
      hasBlockingError = true;
    } else if (Number.isFinite(rawNumber)) {
      questionNumber = rawNumber;
    }

    if (seenNumbers.has(questionNumber)) {
      rowIssues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "question_no",
          `문제 번호가 중복됩니다: ${questionNumber} (첫 등장: ${seenNumbers.get(questionNumber)}행)`,
          "error",
        ),
      );
      hasBlockingError = true;
    } else {
      seenNumbers.set(questionNumber, row.rowNumber);
    }

    const rawOptionTexts = OPTION_KEYS.map((key) => v[key] ?? "");
    let lastFilledIndex = -1;
    for (let i = rawOptionTexts.length - 1; i >= 0; i--) {
      if (rawOptionTexts[i]) {
        lastFilledIndex = i;
        break;
      }
    }

    let questionOptions: QuestionOption[] | null = null;
    if (lastFilledIndex === -1) {
      rowIssues.push(issue(context, row.rowNumber, questionNumber, "options", "선택지가 2개 미만입니다.", "error"));
      hasBlockingError = true;
    } else {
      const hasGap = rawOptionTexts.slice(0, lastFilledIndex + 1).some((text) => !text);
      if (hasGap) {
        rowIssues.push(
          issue(context, row.rowNumber, questionNumber, "options", "선택지 중간이 비어 있습니다.", "error"),
        );
        hasBlockingError = true;
      } else {
        const built = rawOptionTexts.slice(0, lastFilledIndex + 1).map((text, i) => ({
          key: OPTION_LETTERS[i],
          text,
          explanation: v[`${OPTION_KEYS[i]}_explanation`] || undefined,
        }));
        if (built.length < 2) {
          rowIssues.push(
            issue(context, row.rowNumber, questionNumber, "options", "선택지가 2개 미만입니다.", "error"),
          );
          hasBlockingError = true;
        } else {
          questionOptions = built;
        }
      }
    }

    const rawAnswers = (v.correct_answers ?? "")
      .split(",")
      .map((a) => a.trim().toUpperCase())
      .filter((a) => a.length > 0);

    if (rawAnswers.length === 0) {
      rowIssues.push(
        issue(context, row.rowNumber, questionNumber, "correct_answers", "정답이 비어 있습니다.", "error"),
      );
      hasBlockingError = true;
    } else {
      const uniqueAnswers = new Set(rawAnswers);
      if (uniqueAnswers.size !== rawAnswers.length) {
        rowIssues.push(
          issue(
            context,
            row.rowNumber,
            questionNumber,
            "correct_answers",
            "정답에 동일한 선택지가 중복 지정되었습니다.",
            "error",
          ),
        );
        hasBlockingError = true;
      } else if (questionOptions) {
        const optionKeys = new Set(questionOptions.map((o) => o.key));
        const unknownAnswer = rawAnswers.find((a) => !optionKeys.has(a));
        if (unknownAnswer) {
          rowIssues.push(
            issue(
              context,
              row.rowNumber,
              questionNumber,
              "correct_answers",
              `존재하지 않는 선택지가 정답으로 지정되었습니다: ${unknownAnswer}`,
              "error",
            ),
          );
          hasBlockingError = true;
        }
      }
    }

    const rawType = v.question_type ?? "";
    const questionType = Object.prototype.hasOwnProperty.call(TYPE_MAP, rawType)
      ? TYPE_MAP[rawType]
      : undefined;
    if (!questionType) {
      rowIssues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "question_type",
          `지원하지 않는 문제 유형입니다: ${v.question_type || "(비어 있음)"}`,
          "error",
        ),
      );
      hasBlockingError = true;
    } else if (rawAnswers.length > 0) {
      if (questionType === "SINGLE" && rawAnswers.length > 1) {
        rowIssues.push(
          issue(context, row.rowNumber, questionNumber, "type", "단일 정답 문제인데 정답이 여러 개입니다.", "error"),
        );
        hasBlockingError = true;
      } else if (questionType === "MULTIPLE" && rawAnswers.length < 2) {
        rowIssues.push(
          issue(context, row.rowNumber, questionNumber, "type", "복수 정답 문제인데 정답이 1개뿐입니다.", "error"),
        );
        hasBlockingError = true;
      }
    }

    if (v.required_answer_count) {
      const requiredCount = Number(v.required_answer_count);
      if (!Number.isFinite(requiredCount)) {
        rowIssues.push(
          issue(
            context,
            row.rowNumber,
            questionNumber,
            "required_answer_count",
            `정답 개수를 숫자로 해석할 수 없습니다: ${v.required_answer_count}`,
            "error",
          ),
        );
        hasBlockingError = true;
      } else if (requiredCount !== rawAnswers.length) {
        rowIssues.push(
          issue(
            context,
            row.rowNumber,
            questionNumber,
            "required_answer_count",
            `정답 개수(${requiredCount})와 실제 정답 수(${rawAnswers.length})가 다릅니다.`,
            "error",
          ),
        );
        hasBlockingError = true;
      }
    }

    const rawDifficulty = v.difficulty ?? "";
    let difficulty = Object.prototype.hasOwnProperty.call(DIFFICULTY_MAP, rawDifficulty)
      ? DIFFICULTY_MAP[rawDifficulty]
      : undefined;
    if (!difficulty) {
      difficulty = "MEDIUM";
      rowIssues.push(
        issue(
          context,
          row.rowNumber,
          questionNumber,
          "difficulty",
          v.difficulty
            ? `난이도 값을 인식할 수 없어 기본값(MEDIUM)을 적용했습니다: ${v.difficulty}`
            : "난이도가 비어 있어 기본값(MEDIUM)을 적용했습니다.",
          "warning",
        ),
      );
    }

    if (!v.explanation) {
      rowIssues.push(
        issue(context, row.rowNumber, questionNumber, "explanation", "해설이 비어 있습니다.", "warning"),
      );
    }

    issues.push(...rowIssues);

    if (hasBlockingError || !questionOptions || !questionType) continue;

    questions.push({
      id: createQuestionId(context.spreadsheetId, context.sheetTabId, questionNumber, questionText),
      sourceRow: row.rowNumber,
      questionNumber,
      category: v.category || undefined,
      difficulty,
      type: questionType,
      requiredAnswerCount: rawAnswers.length,
      scenario: v.scenario || undefined,
      text: questionText,
      options: questionOptions,
      correctAnswers: rawAnswers,
      explanation: v.explanation ?? "",
      keyPoints: v.key_points ? v.key_points.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      relatedTopics: v.related_topics
        ? v.related_topics.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      sourceUrl: v.source_url || undefined,
    });
  }

  return { questions, issues };
}
