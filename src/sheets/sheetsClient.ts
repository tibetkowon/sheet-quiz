export interface SheetTab {
  sheetId: number;
  title: string;
}

export class SheetsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SheetsApiError";
    this.status = status;
  }
}

export async function listSheetTabs(accessToken: string, spreadsheetId: string): Promise<SheetTab[]> {
  const params = new URLSearchParams({ fields: "sheets.properties(sheetId,title)" });
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 401) {
    throw new SheetsApiError(401, "Google 연결이 만료되었습니다.");
  }
  if (!response.ok) {
    throw new SheetsApiError(response.status, "Sheet 탭 목록을 불러오지 못했습니다.");
  }

  const data = (await response.json()) as {
    sheets?: Array<{ properties: { sheetId: number; title: string } }>;
  };
  return (data.sheets ?? []).map((sheet) => ({
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
  }));
}

export async function getSheetValues(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string,
): Promise<string[][]> {
  const range = encodeURIComponent(`'${tabTitle.replace(/'/g, "''")}'`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 401) {
    throw new SheetsApiError(401, "Google 연결이 만료되었습니다.");
  }
  if (!response.ok) {
    throw new SheetsApiError(response.status, "Sheet 데이터를 불러오지 못했습니다.");
  }

  const data = (await response.json()) as { values?: unknown[][] };
  return (data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

export function pickQuestionTab(tabs: SheetTab[]): {
  autoSelected: SheetTab | null;
  candidates: SheetTab[];
} {
  const byTitle = (title: string) => tabs.find((tab) => tab.title === title);

  const primary = byTitle("문제은행");
  if (primary) return { autoSelected: primary, candidates: [] };

  const secondary = byTitle("Questions");
  if (secondary) return { autoSelected: secondary, candidates: [] };

  if (tabs.length === 1) return { autoSelected: tabs[0], candidates: [] };

  return { autoSelected: null, candidates: tabs };
}
