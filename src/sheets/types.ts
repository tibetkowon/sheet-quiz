export interface ValidationIssue {
  sheetName: string;
  rowNumber: number;
  questionNumber: number | null;
  field: string;
  message: string;
  severity: "error" | "warning";
}
