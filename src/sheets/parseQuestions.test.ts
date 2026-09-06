import { describe, expect, it } from "vitest";
import { parseSheetRows } from "./parseQuestions";

describe("parseSheetRows", () => {

  it("알 수 없는 열만 채운 행은 무시하고 실제 시트 행 번호는 유지합니다", () => {
    expect(parseSheetRows([
      ["문제", "메모"],
      ["", "문제가 아닌 메모"],
      [],
      ["본문", "추가 정보"],
    ])).toEqual({
      headerIndex: { question: 0 },
      rows: [{ rowNumber: 4, values: { question: "본문" } }],
    });
  });

  it("parses data rows into trimmed values keyed by normalized header", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제"],
      ["1", " EC2란 무엇인가? "],
    ]);
    expect(rows).toEqual([{ rowNumber: 2, values: { question_no: "1", question: "EC2란 무엇인가?" } }]);
  });

  it("assigns sheet row numbers accounting for the header row", () => {
    const { rows } = parseSheetRows([
      ["번호"],
      ["1"],
      ["2"],
    ]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("skips fully empty rows", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제"],
      ["1", "첫 문제"],
      ["", ""],
      ["2", "세 번째 문제"],
    ]);
    expect(rows.map((r) => r.values.question_no)).toEqual(["1", "2"]);
    expect(rows[1].rowNumber).toBe(4);
  });

  it("treats a row with only whitespace as empty", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제"],
      ["  ", "  "],
    ]);
    expect(rows).toEqual([]);
  });

  it("returns an empty header index and no rows when the sheet has no header row", () => {
    const result = parseSheetRows([]);
    expect(result).toEqual({ headerIndex: {}, rows: [] });
  });

  it("treats a missing trailing cell as an empty string", () => {
    const { rows } = parseSheetRows([
      ["번호", "문제", "해설"],
      ["1", "문제 본문"],
    ]);
    expect(rows[0].values.explanation).toBe("");
  });
});
