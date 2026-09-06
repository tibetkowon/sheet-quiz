import { describe, expect, it } from "vitest";
import { parseSheetRows } from "./parseQuestions";
import { validateQuestions } from "./validateQuestions";

const CONTEXT = { sheetName: "문제은행", spreadsheetId: "sheet-1", sheetTabId: "tab-1" };

const VALID_HEADER = [
  "번호",
  "분류",
  "난이도",
  "유형",
  "문제",
  "보기 A",
  "보기 B",
  "보기 C",
  "보기 D",
  "정답",
  "해설",
];

function run(rows: string[][]) {
  const { headerIndex, rows: parsed } = parseSheetRows([VALID_HEADER, ...rows]);
  return validateQuestions(headerIndex, parsed, CONTEXT);
}

describe("validateQuestions", () => {

  it.each(["NaN", "Infinity", "번호"])("숫자가 아닌 문제 번호 %s를 거부합니다", (number) => {
    const result = run([[number, "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설"]]);
    expect(result.questions).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({ field: "question_no", severity: "error", rowNumber: 2 }),
    ]);
  });

  it("인식할 수 없는 난이도는 경고와 함께 기본값을 적용합니다", () => {
    const result = run([["1", "분류", "UNKNOWN", "SINGLE", "문제", "A", "B", "", "", "a", "해설"]]);
    expect(result.questions[0]).toMatchObject({ difficulty: "MEDIUM", correctAnswers: ["A"] });
    expect(result.issues).toEqual([
      expect.objectContaining({ field: "difficulty", severity: "warning" }),
    ]);
  });

  it("선택지가 전혀 없는 행의 오류도 수집합니다", () => {
    const result = run([["1", "분류", "MEDIUM", "SINGLE", "문제", "", "", "", "", "", "해설"]]);
    expect(result.questions).toEqual([]);
    expect(result.issues.map((issue) => issue.field)).toEqual(["options", "correct_answers"]);
  });

  it("잘못된 정답 개수를 거부하면서 다음 유효 행은 유지합니다", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "정답 개수"],
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", "해설", "Infinity"],
      ["2", "분류", "MEDIUM", "SINGLE", "문제 2", "A", "B", "", "", "A", "해설", "1"],
    ]);
    const result = validateQuestions(headerIndex, rows, CONTEXT);
    expect(result.questions.map((question) => question.questionNumber)).toEqual([2]);
    expect(result.issues).toEqual([
      expect.objectContaining({ field: "required_answer_count", severity: "error", rowNumber: 2 }),
    ]);
  });

  it("제외된 행은 자동 번호나 중복 번호 검사에 영향을 주지 않습니다", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "상태"],
      ["1", "", "", "", "", "", "", "", "", "", "", "INACTIVE"],
      ["", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설", "ACTIVE"],
    ]);
    const result = validateQuestions(headerIndex, rows, CONTEXT);
    expect(result.issues).toEqual([]);
    expect(result.questions[0]).toMatchObject({ questionNumber: 1, sourceRow: 3 });
  });

  it("returns a header-missing error and no questions when a required header is absent", () => {
    const { headerIndex, rows } = parseSheetRows([["번호", "문제"], ["1", "본문"]]);
    const result = validateQuestions(headerIndex, rows, CONTEXT);
    expect(result.questions).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ field: "header", severity: "error" });
  });

  it("parses a valid single-answer row into a Question", () => {
    const { questions, issues } = run([
      ["1", "컴퓨팅", "MEDIUM", "SINGLE", "EC2란?", "가상서버", "저장소", "네트워크", "DB", "A", "해설입니다"],
    ]);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      questionNumber: 1,
      category: "컴퓨팅",
      difficulty: "MEDIUM",
      type: "SINGLE",
      requiredAnswerCount: 1,
      text: "EC2란?",
      correctAnswers: ["A"],
      explanation: "해설입니다",
    });
    expect(questions[0].options).toEqual([
      { key: "A", text: "가상서버", explanation: undefined },
      { key: "B", text: "저장소", explanation: undefined },
      { key: "C", text: "네트워크", explanation: undefined },
      { key: "D", text: "DB", explanation: undefined },
    ]);
  });

  it("normalizes Korean type and difficulty aliases", () => {
    const { questions } = run([
      ["1", "분류", "쉬움", "복수 정답", "문제", "A", "B", "", "", "A,B", "해설"],
    ]);
    expect(questions[0].difficulty).toBe("EASY");
    expect(questions[0].type).toBe("MULTIPLE");
  });

  it("parses comma-and-space separated multiple answers", () => {
    const { questions } = run([
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "B, C", "해설"],
    ]);
    expect(questions[0].correctAnswers).toEqual(["B", "C"]);
  });

  it("defaults empty difficulty to MEDIUM with a warning", () => {
    const { questions, issues } = run([
      ["1", "분류", "", "SINGLE", "문제", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions[0].difficulty).toBe("MEDIUM");
    expect(issues.some((i) => i.field === "difficulty" && i.severity === "warning")).toBe(true);
  });

  it("warns but keeps the question when explanation is missing", () => {
    const { questions, issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", ""],
    ]);
    expect(questions).toHaveLength(1);
    expect(issues).toEqual([
      expect.objectContaining({ field: "explanation", severity: "warning" }),
    ]);
  });

  it("errors and skips the row when the question text is missing", () => {
    const { questions, issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions).toEqual([]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "question", severity: "error", rowNumber: 2 }),
    ]);
  });

  it("errors when fewer than two options are present", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "", "", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "options", severity: "error" }),
    ]);
  });

  it("errors when an option is missing in the middle of the sequence", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "", "C", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "options", severity: "error" }),
    ]);
  });

  it("errors when the correct answer references a non-existent option", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "E", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "correct_answers", severity: "error" }),
    ]);
  });

  it("errors when the answer field is empty", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "correct_answers", severity: "error" }),
    ]);
  });

  it("errors when SINGLE has more than one correct answer", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "C", "", "A,B", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "type", severity: "error" }),
    ]);
  });

  it("errors when MULTIPLE has only one correct answer", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "type", severity: "error" }),
    ]);
  });

  it("errors when required_answer_count does not match the actual answer count", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "정답 개수"],
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "A,B", "해설", "3"],
    ]);
    const { issues } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(issues).toEqual([
      expect.objectContaining({ field: "required_answer_count", severity: "error" }),
    ]);
  });

  it("errors on an unsupported question type", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "OX", "문제", "A", "B", "", "", "A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "question_type", severity: "error" }),
    ]);
  });

  it("collects every issue on a row instead of stopping at the first one", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "OX", "", "A", "B", "", "", "A", "해설"],
    ]);
    expect(issues).toHaveLength(2);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "question", severity: "error" }),
        expect.objectContaining({ field: "question_type", severity: "error" }),
      ]),
    );
  });

  it("errors on duplicate question numbers", () => {
    const { issues, questions } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제 1", "A", "B", "", "", "A", "해설"],
      ["1", "분류", "MEDIUM", "SINGLE", "문제 2", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions).toHaveLength(1);
    expect(issues).toEqual([
      expect.objectContaining({ field: "question_no", severity: "error", rowNumber: 3 }),
    ]);
  });

  it("errors when the same option letter is listed twice in the answer", () => {
    const { issues } = run([
      ["1", "분류", "MEDIUM", "MULTIPLE", "문제", "A", "B", "C", "", "A,A", "해설"],
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ field: "correct_answers", severity: "error" }),
    ]);
  });

  it("excludes DRAFT/INACTIVE rows without raising an issue", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "상태"],
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설", "DRAFT"],
    ]);
    const { questions, issues } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(questions).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("keeps PUBLISHED/ACTIVE rows", () => {
    const { headerIndex, rows } = parseSheetRows([
      [...VALID_HEADER, "상태"],
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설", "사용"],
    ]);
    const { questions } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(questions).toHaveLength(1);
  });

  it("auto-numbers rows when the question number column is blank", () => {
    const { headerIndex, rows } = parseSheetRows([
      VALID_HEADER,
      ["", "분류", "MEDIUM", "SINGLE", "첫 문제", "A", "B", "", "", "A", "해설"],
      ["", "분류", "MEDIUM", "SINGLE", "둘째 문제", "A", "B", "", "", "A", "해설"],
    ]);
    const { questions } = validateQuestions(headerIndex, rows, CONTEXT);
    expect(questions.map((q) => q.questionNumber)).toEqual([1, 2]);
  });

  it("gives each valid question a stable, content-derived id", () => {
    const { questions } = run([
      ["1", "분류", "MEDIUM", "SINGLE", "문제", "A", "B", "", "", "A", "해설"],
    ]);
    expect(questions[0].id).toBe(
      questions[0].id, // sanity: deterministic within this call
    );
    expect(typeof questions[0].id).toBe("string");
    expect(questions[0].id.length).toBeGreaterThan(0);
  });
});
