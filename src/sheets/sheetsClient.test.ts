import { afterEach, describe, expect, it, vi } from "vitest";
import { getSheetValues, listSheetTabs, pickQuestionTab, SheetsApiError } from "./sheetsClient";

describe("listSheetTabs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns sheet tabs from the spreadsheet metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sheets: [
            { properties: { sheetId: 0, title: "문제은행" } },
            { properties: { sheetId: 1, title: "오답노트" } },
          ],
        }),
      }),
    );

    const tabs = await listSheetTabs("token-abc", "sheet-1");

    expect(tabs).toEqual([
      { sheetId: 0, title: "문제은행" },
      { sheetId: 1, title: "오답노트" },
    ]);
  });

  it("throws SheetsApiError with status 401 when the token is expired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));

    await expect(listSheetTabs("expired", "sheet-1")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<SheetsApiError>);
  });
});

describe("getSheetValues", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches values for the given tab and stringifies every cell", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ values: [["번호", "문제"], [1, "EC2란?"]] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const values = await getSheetValues("token-abc", "sheet-1", "문제은행");

    expect(values).toEqual([["번호", "문제"], ["1", "EC2란?"]]);
    expect(fetchMock.mock.calls[0][0]).toContain("/sheet-1/values/");
  });

  it("returns an empty array when the tab has no values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );

    expect(await getSheetValues("token-abc", "sheet-1", "빈 탭")).toEqual([]);
  });
});

describe("pickQuestionTab", () => {
  it("prefers a tab named 문제은행", () => {
    const tabs = [{ sheetId: 0, title: "오답노트" }, { sheetId: 1, title: "문제은행" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: tabs[1], candidates: [] });
  });

  it("falls back to a tab named Questions", () => {
    const tabs = [{ sheetId: 0, title: "Notes" }, { sheetId: 1, title: "Questions" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: tabs[1], candidates: [] });
  });

  it("auto-selects the only tab when there is exactly one", () => {
    const tabs = [{ sheetId: 0, title: "Sheet1" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: tabs[0], candidates: [] });
  });

  it("returns all tabs as candidates when none match and there are several", () => {
    const tabs = [{ sheetId: 0, title: "1과목" }, { sheetId: 1, title: "2과목" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: null, candidates: tabs });
  });
});
