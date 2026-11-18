import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test.beforeEach(async ({ page }) => {
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
});

test("자격증 폴더 → Sheet 선택 → 탭 자동 선택 → 검증 통과", async ({ page }) => {
  await expect(page.getByText("검증 완료")).toBeVisible();
  await expect(page.getByText(/문제 2개/)).toBeVisible();
});

test("시험 시작 전 영역별 키워드를 보고 돌아옵니다", async ({ page }) => {
  await expect(page.getByRole("button", { name: "풀이 시작" })).toBeVisible();
  await page.getByRole("button", { name: "키워드 보기" }).click();

  await expect(page.getByRole("heading", { name: "키워드 정리" })).toBeVisible();
  await page.getByRole("button", { name: /컴퓨팅/ }).press("Enter");
  await expect(page.getByText("EC2", { exact: true })).toBeVisible();
  await expect(page.getByText("가상 서버")).toBeVisible();
  await page.getByRole("button", { name: /스토리지/ }).click();
  await expect(page.getByText("S3", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "뒤로 가기" }).click();
  await expect(page.getByRole("button", { name: "풀이 시작" })).toBeVisible();
});
