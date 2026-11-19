import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("새로고침해도 Drive가 유지되고, 탭 저장소가 비면 다시 연결하면 열린다", async ({ page }) => {
  await mockGoogleApis(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Google Drive 연결" }).click();

  await expect(page).toHaveURL(/\/folders/);
  await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();
  await page.getByText("자격증 문제은행").click();
  await page.getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" }).click();
  await expect(page).toHaveURL(/\/folders$/);
  await expect(page.getByText("AWS")).toBeVisible();

  // 토큰이 sessionStorage에 있어서 다시 연결 없이 바로 목록이 보인다.
  await page.reload();
  await expect(page.getByText("AWS")).toBeVisible();
  await expect(page.getByRole("button", { name: "드라이브 다시 연결" })).toHaveCount(0);

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "저장된 풀이 기록" })).toBeVisible();

  // 새 탭처럼 sessionStorage가 비면 기존 재연결 경로로 열린다.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/folders");
  await page.getByRole("button", { name: "드라이브 다시 연결" }).click();
  await expect(page.getByText("AWS")).toBeVisible();
});
