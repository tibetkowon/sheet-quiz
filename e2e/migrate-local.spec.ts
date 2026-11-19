import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("업그레이드 전 IndexedDB 기록이 첫 로그인 때 올라가 기록 목록에 보인다", async ({ page }) => {
  const sub = `mock-user-${randomUUID()}`;
  await mockGoogleApis(page, sub);
  // 앱의 idb 스키마(v2)와 같게 만든 뒤 로그인 전에 기록 하나를 넣는다.
  await page.addInitScript((googleUserId) => {
    const open = indexedDB.open("sheet-quiz", 2);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore("topFolder", { keyPath: "googleUserId" });
      const attempts = db.createObjectStore("attempts", { keyPath: "id" });
      attempts.createIndex("googleUserId", "googleUserId");
      attempts.createIndex("bySheetTab", ["spreadsheetId", "sheetTabId"]);
    };
    open.onsuccess = () => {
      const now = new Date().toISOString();
      open.result.transaction("attempts", "readwrite").objectStore("attempts").put({
        id: "legacy-attempt",
        googleUserId,
        spreadsheetId: "s",
        spreadsheetName: "S",
        sheetTabId: "t",
        sheetTabName: "옛 기록 시트",
        parentFolderId: "p",
        certificationFolderName: "레거시",
        questionSetFingerprint: "f",
        sourceModifiedTime: now,
        lastViewedIndex: 0,
        startedAt: now,
        updatedAt: now,
        progress: [],
      });
    };
  }, sub);

  await page.goto("/");
  await page.getByRole("button", { name: "Google Drive 연결" }).click();
  await expect(page).toHaveURL(/\/folders/);

  await page.goto("/history");
  await expect(page.getByText("레거시 · 옛 기록 시트")).toBeVisible();
});
