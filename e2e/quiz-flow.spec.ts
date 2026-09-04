// e2e/quiz-flow.spec.ts
import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("검증 통과 → 풀이 시작 → 답변 선택 → 다음 문제 → 새로고침 후 이어풀기", async ({ page }) => {
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
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("문제 2 / 2")).toBeVisible();
  await expect(page.getByText("저장됨")).toBeVisible();

  // A raw reload on /quiz/:attemptId silently continues where autosave left off —
  // no resume prompt, since the attempt is loaded straight from IndexedDB by URL.
  await page.reload();
  await expect(page.getByText("문제 2 / 2")).toBeVisible();

  // Re-entering through the Sheet browse → validate → 풀이 시작 flow a second time,
  // now that progress exists, routes through the actual resume-prompt screen.
  // The top-level folder was already saved to IndexedDB on the first pass (keyed by
  // googleUserId, which the mock keeps stable), so DriveBrowsePage skips straight to
  // the certification folder list instead of showing "최상위 폴더 선택하러 가기" again.
  await page.getByText("풀이장").click();
  await page.getByRole("button", { name: "Google Drive 연결" }).click();
  await page.getByText("AWS").click();
  await page.getByText("실전 모의고사 1").click();
  await expect(page.getByText("검증 완료")).toBeVisible();
  await page.getByRole("button", { name: "풀이 시작" }).click();

  await expect(page.getByText(/답변 완료/)).toBeVisible();
  await page.getByRole("button", { name: "이어서 풀기" }).click();
  await expect(page.getByText("문제 2 / 2")).toBeVisible();
});
