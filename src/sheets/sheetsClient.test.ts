import { afterEach, describe, expect, it, vi } from "vitest";
import { getSheetValues, listSheetTabs, pickQuestionTab, SheetsApiError } from "./sheetsClient";

describe("listSheetTabs", () => {

  it("탭 메타데이터가 없으면 빈 목록을 반환합니다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    expect(await listSheetTabs("token", "sheet-1")).toEqual([]);
  });

  it("인증 만료 외의 HTTP 오류도 전달합니다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(listSheetTabs("token", "sheet-1")).rejects.toMatchObject({
      name: "SheetsApiError", status: 403, message: "Sheet 탭 목록을 불러오지 못했습니다.",
    });
  });

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

  it.each([401, 403, 500])("HTTP %s 실패를 상태 코드와 함께 전달합니다", async (status) => {
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, json }));
    await expect(getSheetValues("token", "sheet-1", "문제은행")).rejects.toMatchObject({
      name: "SheetsApiError",
      status,
      message: status === 401 ? "Google 연결이 만료되었습니다." : "Sheet 데이터를 불러오지 못했습니다.",
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("따옴표가 있는 탭 제목을 이스케이프하고 인증 헤더를 보냅니다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ values: [[0, false, null, true]] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getSheetValues("token", "sheet-1", "O'Brien / 문제")).toEqual([["0", "false", "", "true"]]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(decodeURIComponent(url)).toContain("/values/'O''Brien / 문제'?valueRenderOption=UNFORMATTED_VALUE");
    expect(options).toEqual({ headers: { Authorization: "Bearer token" } });
  });

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

  it("탭이 없으면 자동 선택하지 않습니다", () => {
    expect(pickQuestionTab([])).toEqual({ autoSelected: null, candidates: [] });
  });

  it("영문 우선 탭이 먼저 있어도 문제은행을 선택합니다", () => {
    const tabs = [{ sheetId: 0, title: "Questions" }, { sheetId: 1, title: "문제은행" }];
    expect(pickQuestionTab(tabs)).toEqual({ autoSelected: tabs[1], candidates: [] });
  });

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
