import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "풀이장",
        short_name: "풀이장",
        display: "standalone",
        start_url: "/",
        scope: "/",
        theme_color: "#FFFFFF",
        background_color: "#FFFFFF",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // googleapis.com 요청은 의도적으로 runtimeCaching에 추가하지 않는다
        // (인증 헤더 포함 + 항상 최신 데이터가 필요한 읽기 전용 API).
      },
    }),
  ],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000",
      },
    },
    globals: true,
    // 다이얼로그를 여러 번 여닫는 페이지 테스트는 병렬 부하에서 5초 기본값을 넘긴다.
    testTimeout: 15_000,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
