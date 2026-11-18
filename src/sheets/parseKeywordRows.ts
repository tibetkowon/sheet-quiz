export interface KeywordEntry {
  keyword: string;
  description: string;
}

export interface KeywordGroup {
  category: string;
  entries: KeywordEntry[];
}

export type ParseKeywordResult =
  | { ok: true; groups: KeywordGroup[] }
  | { ok: false; error: string };

export function parseKeywordRows(rows: string[][]): ParseKeywordResult {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return { ok: true, groups: [] };

  const headerIndex = new Map<string, number>();
  headerRow.forEach((raw, i) => {
    const header = raw.trim();
    const key = header === "분류" ? "영역" : header;
    if (!headerIndex.has(key)) headerIndex.set(key, i);
  });

  const categoryIndex = headerIndex.get("영역");
  const keywordIndex = headerIndex.get("키워드");
  const descriptionIndex = headerIndex.get("설명");
  if (categoryIndex === undefined || keywordIndex === undefined) {
    return { ok: false, error: "'영역', '키워드' 헤더를 찾을 수 없습니다." };
  }

  const groups = new Map<string, KeywordGroup>();
  for (const row of dataRows) {
    const category = (row[categoryIndex] ?? "").trim();
    const keyword = (row[keywordIndex] ?? "").trim();
    if (!category || !keyword) continue;

    const description = descriptionIndex === undefined ? "" : (row[descriptionIndex] ?? "").trim();
    let group = groups.get(category);
    if (!group) {
      group = { category, entries: [] };
      groups.set(category, group);
    }
    group.entries.push({ keyword, description });
  }

  return { ok: true, groups: [...groups.values()] };
}
