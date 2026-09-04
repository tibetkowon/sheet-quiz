import type { Page } from "@playwright/test";

interface MockTokenClientConfig {
  callback: (response: { access_token: string; expires_in: number }) => void;
}

export async function mockGoogleApis(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: MockTokenClientConfig) => ({
            requestAccessToken: () => {
              config.callback({ access_token: "mock-access-token", expires_in: 3600 });
            },
          }),
        },
      },
    };
  });

  await page.route("https://www.googleapis.com/oauth2/v3/userinfo", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sub: "mock-user-1", email: "mock-user@example.com" }),
    }),
  );

  await page.route("https://www.googleapis.com/drive/v3/files*", (route) => {
    const url = route.request().url();
    const isRoot = url.includes("%27root%27+in+parents");
    const isSpreadsheetQuery = url.includes("google-apps.spreadsheet");

    if (isSpreadsheetQuery) {
      const files = url.includes("%27cert-1%27+in+parents")
        ? [{ id: "sheet-1", name: "실전 모의고사 1", modifiedTime: "2026-09-01T00:00:00.000Z" }]
        : [];
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files }) });
      return;
    }

    const files = isRoot
      ? [{ id: "top-1", name: "자격증 문제은행", modifiedTime: "2026-09-01T00:00:00.000Z" }]
      : url.includes("%27top-1%27+in+parents")
        ? [
            { id: "cert-1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
            { id: "cert-2", name: "SQLD", modifiedTime: "2026-08-01T00:00:00.000Z" },
          ]
        : [];
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files }) });
  });

  await page.route("https://sheets.googleapis.com/v4/spreadsheets/sheet-1?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sheets: [{ properties: { sheetId: 0, title: "문제은행" } }] }),
    }),
  );

  await page.route("https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        values: [
          ["번호", "분류", "난이도", "유형", "문제", "보기 A", "보기 B", "보기 C", "보기 D", "정답", "해설"],
          ["1", "컴퓨팅", "MEDIUM", "SINGLE", "EC2란?", "가상서버", "저장소", "네트워크", "DB", "A", "해설1"],
          ["2", "스토리지", "EASY", "SINGLE", "S3란?", "객체스토리지", "블록스토리지", "DB", "큐", "A", "해설2"],
        ],
      }),
    }),
  );
}
