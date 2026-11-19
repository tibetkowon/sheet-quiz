import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5199",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --mode e2e --port 5199",
    port: 5199,
    // e2e 모드(Emulator 연결) 서버만 써야 하므로 다른 dev 서버를 재사용하지 않는다.
    reuseExistingServer: false,
  },
});
