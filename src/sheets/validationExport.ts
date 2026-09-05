import type { ValidationIssue } from "./types";

export function buildValidationIssuesMarkdown(issues: ValidationIssue[]): string {
  const lines: string[] = ["# 시트 검증 결과", ""];
  issues.forEach((issue) => {
    const location = [issue.sheetName, `${issue.rowNumber}행`, issue.questionNumber != null ? `문제 ${issue.questionNumber}번` : null]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    lines.push(`- [${issue.severity}] ${location}: ${issue.message}`);
  });
  return lines.join("\n");
}
