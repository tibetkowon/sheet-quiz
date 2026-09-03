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
    const files = isRoot
      ? [{ id: "top-1", name: "자격증 문제은행", modifiedTime: "2026-09-01T00:00:00.000Z" }]
      : [
          { id: "cert-1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
          { id: "cert-2", name: "SQLD", modifiedTime: "2026-08-01T00:00:00.000Z" },
        ];
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files }),
    });
  });
}
