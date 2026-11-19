import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("기기 A에서 풀던 기록을 같은 계정의 기기 B에서 이어 푼다", async ({ browser }) => {
  const sub = `cross-device-${Date.now()}`;

  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await mockGoogleApis(a, sub);
  await a.goto("/");
  await a.getByRole("button", { name: "Google Drive 연결" }).click();
  await a.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();
  await a.getByText("자격증 문제은행").click();
  await a.getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" }).click();
  await a.getByText("AWS").click();
  await a.getByText("실전 모의고사 1").click();
  await expect(a.getByText("검증 완료")).toBeVisible();
  await a.getByRole("button", { name: "풀이 시작" }).click();
  await expect(a.getByText("문제 1 / 2")).toBeVisible();
  await a.getByText("가상서버").click();
  await a.getByRole("button", { name: "다음", exact: true }).click();
  await expect(a.getByText("문제 2 / 2")).toBeVisible();
  await expect(a.getByText("저장됨")).toBeVisible();

  // saveAttempt는 서버 ack를 기다리지 않으므로, B가 서버에서 기록을 받을 때까지 /history를 다시 불러오며 기다린다.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await mockGoogleApis(b, sub);
  await b.goto("/");
  await b.getByRole("button", { name: "Google Drive 연결" }).click();
  await expect(b).toHaveURL(/\/folders/);

  // 1번 답변 직후의 이전 문서가 먼저 도착할 수 있어서 "문제 2 / 2"까지 포함해 재시도한다.
  await expect(async () => {
    await b.goto("/history");
    await expect(b.getByText(/AWS · 문제은행/)).toBeVisible({ timeout: 2_000 });
    await b.getByRole("button", { name: /이어서 풀기/ }).click();
    await expect(b.getByText("문제 2 / 2")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  await ctxA.close();
  await ctxB.close();
});
