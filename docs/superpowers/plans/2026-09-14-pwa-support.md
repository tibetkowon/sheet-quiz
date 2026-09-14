# PWA 지원 Implementation Plan

> **For agentic workers:** 이 프로젝트는 `CLAUDE.md`에 따라 애플리케이션 코드
> 구현/수정을 전역 `codex-auto` 워크플로에 위임한다. `superpowers:executing-plans`
> 또는 `superpowers:subagent-driven-development`의 "직접 코드 작성" 부분은
> 적용하지 않는다 — 대신 각 Task를 `codex-auto` 스킬에 위임하고, 반환된
> STATUS가 PASS이면 `git diff --stat`으로 보고된 파일 목록과 실제 변경 파일이
> 일치하는지 확인한 뒤 즉시 커밋한다. NEEDS_DECISION/FAIL이면 직접 조사한다.
> Task는 체크박스(`- [ ]`)로 진행 상황을 추적한다.

**Goal:** 풀이장을 홈 화면에 설치해 브라우저 주소창 없이 독립 앱처럼 즉시
실행할 수 있게 만든다(설치 중심 PWA — Drive/Sheets 데이터의 오프라인 동기화는
범위 밖).

**Architecture:** `vite-plugin-pwa`(Workbox 기반)로 manifest.json과
서비스워커를 빌드 시점에 자동 생성한다. 서비스워커는 앱 셸(JS/CSS/HTML)만
precache하고, 인증 헤더가 붙는 Google API 호출은 캐싱하지 않는다. 아이콘은
기존 `favicon.svg`에서 1회 생성해 정적 자산으로 커밋한다.

**Tech Stack:** `vite-plugin-pwa`, `@vite-pwa/assets-generator` (둘 다
devDependency로 추가, 런타임 의존성 아님).

**Spec:** `docs/superpowers/specs/2026-09-14-pwa-support-design.md`

## Global Constraints

- OAuth 액세스 토큰은 메모리에만 보관 — 서비스워커는 토큰에 접근하거나
  캐싱하지 않는다.
- `*.googleapis.com` 요청에 대한 `runtimeCaching` 규칙을 추가하지 않는다.
- 외부 폰트 CDN(jsdicvr Pretendard, Google Fonts)은 캐싱 대상에 포함하지
  않는다.
- `registerType: 'autoUpdate'` — 업데이트 알림 UI를 만들지 않는다.
- 아이콘은 1회 생성해 커밋하고, 빌드마다 재생성하지 않는다.
- `theme_color`/`background_color`는 라이트 값(`#F7F7FB`)으로 고정하고,
  다크모드는 `index.html`의 별도 `<meta>` 태그로만 보완한다.
- 백엔드/외부 DB를 추가하지 않는다(순수 정적 산출물 유지).

---

### Task 1: PWA 아이콘 생성

**Files:**
- Create: `pwa-assets.config.ts`
- Create: `public/icons/pwa-192x192.png` (192×192, 투명 배경)
- Create: `public/icons/pwa-512x512.png` (512×512, 투명 배경)
- Create: `public/icons/maskable-512x512.png` (512×512, 배경색 `#F7F7FB`로
  채운 maskable 버전 — 세이프존 확보를 위해 아이콘 그림을 중앙 약 80% 영역에
  배치)
- Create: `public/icons/apple-touch-icon-180x180.png` (180×180, 투명 배경 —
  iOS 홈 화면 아이콘용)
- Modify: `package.json` (devDependency `@vite-pwa/assets-generator` 추가,
  `scripts`에 아이콘 재생성용 스크립트 1개 추가 — 스크립트 이름과 정확한
  CLI 호출 방식은 설치된 `@vite-pwa/assets-generator` 버전의 실제 CLI 옵션을
  `--help`로 확인한 뒤 결정한다. 원본 이미지는 `public/favicon.svg` 하나다)

**Interfaces:**
- Consumes: `public/favicon.svg` (기존 파일, 보라색 체크 표시 `#3D3AA8`)
- Produces: Task 2가 `vite.config.ts`의 `VitePWA({ manifest: { icons: [...] } })`
  와 `index.html`의 `apple-touch-icon` 링크에서 참조할 4개의 PNG 경로
  (`/icons/pwa-192x192.png`, `/icons/pwa-512x512.png`,
  `/icons/maskable-512x512.png`, `/icons/apple-touch-icon-180x180.png`)

- [ ] **Step 1: `@vite-pwa/assets-generator` 설치**

```bash
pnpm add -D @vite-pwa/assets-generator
```

- [ ] **Step 2: 생성 설정 작성**

`pwa-assets.config.ts` 생성 — 아래 4개 산출물이 정확히 위 경로/크기/배경색으로
나오도록 라이브러리의 실제 config 스키마(설치된 버전의 타입 정의 또는
`node_modules/@vite-pwa/assets-generator/README.md` 참고)에 맞춰 작성한다.
핵심 요구사항만 고정:

```ts
// pwa-assets.config.ts — 핵심 요구사항 (실제 API는 설치본 문서 확인)
// images: ['public/favicon.svg']
// 출력 대상:
//   - public/icons/pwa-192x192.png       (투명 배경, 192x192)
//   - public/icons/pwa-512x512.png       (투명 배경, 512x512)
//   - public/icons/maskable-512x512.png  (배경 #F7F7FB, 512x512, safe-zone 고려)
//   - public/icons/apple-touch-icon-180x180.png (투명 배경, 180x180)
```

- [ ] **Step 3: 아이콘 생성 실행**

```bash
pnpm exec pwa-assets-generator
```

(정확한 CLI 바이너리 이름은 `node_modules/.bin/`에서 확인. `package.json`에
`"pwa:icons": "pwa-assets-generator"` 스크립트로 등록해 `pnpm pwa:icons`로도
재실행 가능하게 한다.)

- [ ] **Step 4: 생성 결과 검증**

```bash
file public/icons/pwa-192x192.png public/icons/pwa-512x512.png \
  public/icons/maskable-512x512.png public/icons/apple-touch-icon-180x180.png
```

Expected: 4개 파일 모두 `PNG image data`로 나오고, 출력 문자열에 각각
`192 x 192`, `512 x 512`, `512 x 512`, `180 x 180`이 포함되어야 한다. 크기가
다르면 Step 2의 설정을 수정하고 다시 생성한다.

- [ ] **Step 5: 커밋**

```bash
git add pwa-assets.config.ts public/icons/ package.json pnpm-lock.yaml
git commit -m "feat: generate PWA icons from favicon.svg"
```

---

### Task 2: vite-plugin-pwa 통합 (manifest + 서비스워커 + iOS/다크모드 meta + README)

**Files:**
- Modify: `vite.config.ts`
- Modify: `index.html`
- Modify: `package.json` (devDependency `vite-plugin-pwa` 추가)
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1이 생성한 4개 아이콘 경로
  (`/icons/pwa-192x192.png`, `/icons/pwa-512x512.png`,
  `/icons/maskable-512x512.png`, `/icons/apple-touch-icon-180x180.png`)
- Produces: `pnpm build` 산출물(`dist/`)에 `manifest.webmanifest`와 서비스워커
  파일이 포함됨 (Task 2 완료 조건이자 최종 검증 대상)

- [ ] **Step 1: `vite-plugin-pwa` 설치**

```bash
pnpm add -D vite-plugin-pwa
```

- [ ] **Step 2: `vite.config.ts`에 플러그인 등록**

기존 `vite.config.ts`(`vitest/config`의 `defineConfig` 사용, `test` 필드
포함)에 `VitePWA` 플러그인을 `plugins` 배열에 추가한다:

```ts
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
        theme_color: "#F7F7FB",
        background_color: "#F7F7FB",
        icons: [
          {
            src: "/icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/maskable-512x512.png",
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
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
```

- [ ] **Step 3: `index.html`에 iOS/다크모드 meta 태그 추가**

`index.html`의 `<head>` 안, 기존 `favicon.svg` 링크 다음 줄에 추가:

```html
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180x180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="#F7F7FB" />
    <meta
      name="theme-color"
      media="(prefers-color-scheme: dark)"
      content="#14131F"
    />
```

- [ ] **Step 4: `pnpm build` 실행 후 산출물 검증**

```bash
pnpm build
ls dist/manifest.webmanifest
ls dist/sw.js 2>/dev/null || ls dist/*.js | grep -i workbox
```

Expected: `dist/manifest.webmanifest` 파일이 존재하고, Workbox가 생성한
서비스워커 파일(`sw.js` 또는 유사한 이름)이 `dist/`에 존재해야 한다.

- [ ] **Step 5: `README.md` 문구 갱신**

"## 알려진 제약" 섹션의 다음 문장을:

```
- 오프라인 지원은 없습니다. Drive/Sheets 목록 조회와 최초 문제 불러오기에는
  네트워크 연결이 필요합니다(한 번 불러온 풀이는 IndexedDB에서 이어서 풀 수
  있습니다).
```

다음으로 교체:

```
- 앱은 PWA로 설치할 수 있으며, 설치 후에는 네트워크 없이도 앱 화면 자체는
  실행됩니다. 다만 Drive/Sheets 목록 조회와 최초 문제 불러오기에는 여전히
  네트워크 연결이 필요합니다(한 번 불러온 풀이는 IndexedDB에서 이어서 풀 수
  있습니다).
```

- [ ] **Step 6: 전체 검증 명령 실행**

프로젝트 `CLAUDE.md`에 명시된 검증 명령을 모두 실행한다:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm e2e
```

Expected: 모두 통과. 기존 로직을 변경하지 않았으므로 실패하면 원인은 대부분
`vite.config.ts` 설정 오류다.

- [ ] **Step 7: 커밋**

```bash
git add vite.config.ts index.html package.json pnpm-lock.yaml README.md
git commit -m "feat: add PWA manifest and service worker via vite-plugin-pwa"
```

---

## Self-Review 결과 (작성 시점에 확인 완료)

- **Spec coverage:** 스펙 3.1(서비스워커 전략)~3.4(iOS 보완)는 Task 2, 3.2(아이콘)는
  Task 1, 4절(파일 영향 범위)의 모든 파일이 두 Task에 매핑됨, 5절(테스트)은
  Task 2 Step 4/6, 6절(범위 밖)은 어떤 Task에도 구현하지 않음(의도된 누락).
- **Placeholder 점검:** Task 1의 `pwa-assets.config.ts` 정확한 스키마만 "설치본
  문서 확인"으로 열어뒀다 — 실제 로직/경로/크기/색상 요구사항은 모두 구체적으로
  명시했으므로 의미 있는 placeholder는 아니다(3rd-party 라이브러리 버전별 API
  차이를 흡수하기 위한 의도적 여유).
- **Type/이름 일관성:** 아이콘 파일 경로(`/icons/pwa-192x192.png` 등)가 Task 1의
  Produces와 Task 2 Step 2/3에서 동일하게 사용됨을 확인.
