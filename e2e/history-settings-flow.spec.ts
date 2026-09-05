import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("결과 내보내기, 기록 목록, 설정에서 데이터 삭제", async ({ page }) => {
  await mockGoogleApis(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Google Drive 연결" }).click();
  await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();
  await page.getByText("자격증 문제은행").click();
  await page.getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" }).click();
  await page.getByText("AWS").click();
  await page.getByText("실전 모의고사 1").click();

  await expect(page.getByText("검증 완료")).toBeVisible();
  await page.getByRole("button", { name: "풀이 시작" }).click();

  await expect(page.getByText("문제 1 / 2")).toBeVisible();
  await page.getByText("가상서버").click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("문제 2 / 2")).toBeVisible();
  await page.getByText("객체스토리지").click();
  await expect(page.getByText("저장됨")).toBeVisible();

  await page.getByRole("button", { name: "제출하기" }).click();
  await expect(page.getByText("제출하기 전에 확인하세요")).toBeVisible();
  await page.getByRole("button", { name: "제출하기" }).click();
  await expect(page.getByText("100%")).toBeVisible();

  const [mdDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Markdown 다운로드" }).click(),
  ]);
  expect(mdDownload.suggestedFilename()).toMatch(/\.md$/);

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON 다운로드" }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/);

  await page.getByRole("link", { name: "기록" }).click();
  await expect(page.getByText(/AWS · 문제은행/)).toBeVisible();
  await expect(page.getByText(/100%/)).toBeVisible();

  await page.getByRole("link", { name: "설정" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "모든 데이터 삭제" }).click();
  await expect(page.getByText("Google Drive 연결")).toBeVisible();
});
