import { buildHeaderIndex } from "./headerMap";

export interface RawQuestionRow {
  rowNumber: number;
  values: Record<string, string>;
}

export function parseSheetRows(rows: string[][]): {
  headerIndex: Record<string, number>;
  rows: RawQuestionRow[];
} {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return { headerIndex: {}, rows: [] };
  }

  const headerIndex = buildHeaderIndex(headerRow);
  const parsed: RawQuestionRow[] = [];

  dataRows.forEach((row, i) => {
    const values: Record<string, string> = {};
    let hasContent = false;
    for (const [key, columnIndex] of Object.entries(headerIndex)) {
      const cell = (row[columnIndex] ?? "").trim();
      values[key] = cell;
      if (cell) hasContent = true;
    }
    if (!hasContent) return;
    parsed.push({ rowNumber: i + 2, values });
  });

  return { headerIndex, rows: parsed };
}
