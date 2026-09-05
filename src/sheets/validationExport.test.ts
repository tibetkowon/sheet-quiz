import { describe, expect, it } from "vitest";
import { buildValidationIssuesMarkdown } from "./validationExport";
import type { ValidationIssue } from "./types";

const issues: ValidationIssue[] = [
  { sheetName: "1회차", rowNumber: 4, questionNumber: 3, field: "correctAnswers", message: "정답이 없습니다.", severity: "error" },
  { sheetName: "1회차", rowNumber: 7, questionNumber: null, field: "options", message: "선택지가 비어 있습니다.", severity: "warning" },
];

describe("buildValidationIssuesMarkdown", () => {
  it("includes a header line", () => {
    expect(buildValidationIssuesMarkdown([])).toContain("# 시트 검증 결과");
  });

  it("includes severity, location, and message for each issue", () => {
    const md = buildValidationIssuesMarkdown(issues);
    expect(md).toContain("[error] 1회차 · 4행 · 문제 3번: 정답이 없습니다.");
    expect(md).toContain("[warning] 1회차 · 7행: 선택지가 비어 있습니다.");
  });
});
