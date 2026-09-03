import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("로그인 → 최상위 폴더 선택 → 자격증 폴더 목록 확인", async ({ page }) => {
  await mockGoogleApis(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "풀이장" })).toBeVisible();
  await page.getByRole("button", { name: "Google Drive 연결" }).click();

  await expect(page).toHaveURL(/\/folders/);
  await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();

  await expect(page.getByText("자격증 문제은행")).toBeVisible();
  await page.getByText("자격증 문제은행").click();
  await page
    .getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" })
    .click();

  await expect(page.getByText("AWS")).toBeVisible();
  await expect(page.getByText("SQLD")).toBeVisible();
});
