export interface ValidationIssue {
  sheetName: string;
  rowNumber: number;
  questionNumber: number | null;
  field: string;
  message: string;
  // 화면에는 숨기고 복사/다운로드 내용에만 붙이는 자세한 설명(예: 빠진 헤더 목록).
  detail?: string;
  severity: "error" | "warning";
}
