import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

async function expectNoHorizontalOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

test("375px 모바일에서 시작 → Drive 폴더 목록 → 퀴즈 풀이 화면에 가로 스크롤이 없다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockGoogleApis(page);
  await page.goto("/");

  await test.step("StartPage", async () => {
    await expect(page.getByRole("heading", { name: "풀이장" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Google Drive 연결" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  await test.step("DriveBrowsePage", async () => {
    await page.getByRole("button", { name: "Google Drive 연결" }).click();
    await expect(page).toHaveURL(/\/folders/);
    await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();
    await page.getByText("자격증 문제은행").click();
    await page
      .getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" })
      .click();
    await expect(page.getByText("AWS")).toBeVisible();
    await expect(page.getByText("SQLD")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  await test.step("QuizPage", async () => {
    await page.getByText("AWS").click();
    await page.getByText("실전 모의고사 1").click();
    await expect(page.getByText("검증 완료")).toBeVisible();
    await page.getByRole("button", { name: "풀이 시작" }).click();
    await expect(page.getByText("문제 1 / 2")).toBeVisible();
    await expect(page.getByText("가상서버")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByText("가상서버").click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("문제 2 / 2")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
