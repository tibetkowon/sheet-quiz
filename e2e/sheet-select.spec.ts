import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("자격증 폴더 → Sheet 선택 → 탭 자동 선택 → 검증 통과", async ({ page }) => {
  await mockGoogleApis(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Google Drive 연결" }).click();
  await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();
  await expect(page.getByText("자격증 문제은행")).toBeVisible();
  await page.getByText("자격증 문제은행").click();
  await page
    .getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" })
    .click();

  await expect(page.getByText("AWS")).toBeVisible();
  await page.getByText("AWS").click();

  await expect(page.getByText("실전 모의고사 1")).toBeVisible();
  await page.getByText("실전 모의고사 1").click();

  await expect(page.getByText("검증 완료")).toBeVisible();
  await expect(page.getByText(/문제 2개/)).toBeVisible();
});
