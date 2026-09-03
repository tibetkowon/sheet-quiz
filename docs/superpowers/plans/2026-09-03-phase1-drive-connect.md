# 1단계: 프로젝트 초기화 · Google 연결 · 최상위 폴더 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 이 저장소는 Claude Code가 조율만
> 담당하고 실제 코드 작성은 Codex 플러그인이 담당한다 (원본 요청 2번 항목).
> 표준 `superpowers:subagent-driven-development`/`superpowers:executing-plans`의
> "Claude 서브에이전트가 코드를 작성" 방식 대신, 아래 "실행 방식" 절을 따를 것.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vite+React+TS 프로젝트를 초기화하고, 디자인 토큰을 Tailwind에 반영하며,
Google Identity Services로 로그인해 Drive 최상위 폴더를 선택하고 그 하위
자격증 폴더 목록을 보여주는 최소 흐름을 완성한다.

**Architecture:** 순수 정적 SPA. GIS로 액세스 토큰을 메모리에만 보관하고,
Drive REST API(`fetch`)로 폴더를 조회하며, 선택한 최상위 폴더는 IndexedDB(`idb`)에
Google 사용자 ID 기준으로 저장한다. 라우팅은 React Router.

**Tech Stack:** Vite, React 18, TypeScript strict, React Router, Tailwind CSS,
idb, Vitest, Testing Library, Playwright, ESLint, Prettier, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`
(4~7절: 폴더 구조/상태 경계/라우팅, 11절: 디자인 시스템)

## Global Constraints

- Java/Spring Boot, 별도 백엔드 서버, 외부 DB(Supabase/Firebase/PostgreSQL 등) 금지
- 관리자 기능, 회원 관리, AI API 연동 금지
- Google Drive/Sheets는 읽기 전용으로만 접근 (`drive.readonly`,
  `spreadsheets.readonly`, `openid`, `email`, `profile` 스코프만 요청)
- OAuth 액세스 토큰은 localStorage/IndexedDB에 저장 금지 — 메모리에만 유지,
  새로고침 시 소실되며 사용자가 버튼으로 재연결
- 풀이 기록·설정은 브라우저 IndexedDB에만 저장, 클라우드 동기화 없음
- 전역 상태 관리 라이브러리 금지 — React Context + hooks만 사용
- 순수 정적 파일로 빌드되어 Vercel에 배포 가능해야 함
- UI는 한국어, 색상만으로 상태를 구분하지 않음, 과도한 애니메이션 금지
- 휴지통에 있는 폴더는 목록에서 제외
- 환경변수는 `VITE_GOOGLE_CLIENT_ID` 하나만 사용

---

## 실행 방식 (이 프로젝트 전용)

이 계획은 표준 subagent-driven-development 대신 다음 절차로 실행한다
(각 Task가 곧 "기능 단위"):

1. Claude Code가 Task의 Files/Interfaces/Steps를 그대로 Codex 플러그인에
   구현 지시로 전달한다 (테스트 코드 포함, 실패 확인 → 최소 구현 → 통과 확인 →
   커밋까지).
2. Codex가 코드를 작성하고 `pnpm test`/`pnpm lint`/`pnpm build`(마지막 Task에서)를
   실행해 결과를 보고한다.
3. Claude Code가 diff와 실행 결과를 확인한 뒤, Codex 플러그인에 별도 코드
   리뷰(버그·보안·요구사항 누락·과도한 복잡성 관점)를 요청한다.
4. 리뷰에서 문제가 없으면 다음 Task로 진행하고, 문제가 있으면 Codex에 수정을
   요청한 뒤 재검증한다.
5. Claude Code는 소스 코드를 직접 작성하지 않는다.

**환경 제약 (2026-09-03 확인, 사용자 승인):** 이 저장소는 외장 HFS+ 볼륨
(`/Volumes/MAC`)에 있고, Codex 플러그인의 macOS 샌드박스가 이 볼륨에서
임시 파일 쓰기(예: `pnpm install`의 임시 파일, Vite/Vitest의 설정 번들
임시 `.mjs` 파일)를 `EPERM`으로 거부한다. 따라서 각 Task에서 `pnpm
install`/`pnpm test`/`pnpm lint`/`pnpm build`/`pnpm e2e` 등 **명령
실행은 Claude Code가 샌드박스 밖에서 대신 수행**하고 결과를 Codex에
전달한다. Codex에게 직접 이 명령들을 실행하라고 요청하지 않는다.

추가로, Codex 경유 `git commit` 요청은 Claude Code 하네스의 자동 모드
권한 분류기에 반복적으로 차단됨을 확인했다(문구를 바꿔도 동일). 따라서
**커밋도 Claude Code가 직접 수행**한다 — Codex가 작성한 파일을 계획의
Files/Step 내용과 diff로 대조 확인한 뒤, 계획에 명시된 것과 동일한 파일
목록·커밋 메시지로 커밋한다. Codex의 역할은 코드/테스트 코드 작성으로
한정된다.

---

### Task 1: 프로젝트 스캐폴딩 (Vite + React + TS strict + pnpm 스크립트)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `src/vite-env.d.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `App` 컴포넌트(default export, `src/App.tsx`) — 이후 Task에서
  라우터를 이 컴포넌트 안에 조립한다. 지금은 `<div>풀이장</div>` placeholder만
  렌더링한다.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "sheet-quiz",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 4173",
    "test": "NODE_OPTIONS=--no-experimental-webstorage vitest run",
    "test:watch": "NODE_OPTIONS=--no-experimental-webstorage vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": {
    "idb": "^8.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.7.0",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^8.5.0",
    "@typescript-eslint/parser": "^8.5.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.10.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "eslint-plugin-react-refresh": "^0.4.11",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.45",
    "prettier": "^3.3.3",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "typescript-eslint": "^8.5.0",
    "vite": "^5.4.5",
    "vitest": "^2.0.5"
  }
}
```

`test`/`test:watch`의 `NODE_OPTIONS=--no-experimental-webstorage`는 Node
22+에 내장된 실험적 네이티브 `localStorage` 전역이 vitest 2.x의 jsdom
환경 전역 프록시보다 먼저 전역을 선점해 `localStorage`가 테스트에서
`undefined`가 되는 문제를 막기 위한 것이다 (jsdom 자체는 정상 동작하지만
vitest가 이를 전역에 연결하지 못한다). 이 플래그 없이 `pnpm test`를
실행하면 `localStorage`를 사용하는 모든 테스트가 실패한다.

- [ ] **Step 2: pnpm install 실행**

Run: `pnpm install`
Expected: lockfile(`pnpm-lock.yaml`) 생성, 에러 없이 종료

- [ ] **Step 3: tsconfig.json / tsconfig.node.json 작성**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "outDir": "./node_modules/.tsbuildcache/node",
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node"],
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "playwright.config.ts"]
}
```

`outDir`이 필요한 이유: 이 파일은 `composite: true`이고 루트 tsconfig.json이
`references`로 참조하므로 TS 프로젝트 레퍼런스 규칙상 `noEmit: true`를 쓸 수
없다(`TS6310`). `outDir`을 `node_modules` 밑으로 돌려두지 않으면 `pnpm build`
(`tsc -b`)를 실행할 때마다 `vite.config.js`/`playwright.config.js` 같은
컴파일 산출물이 저장소 루트에 그대로 생성된다. `types: ["node"]`는
playwright.config.ts가 쓰는 `process.env.CI`(Task 12) 때문에 필요하며,
`@types/node`를 devDependencies에 추가해야 한다(아래 package.json 참고).

- [ ] **Step 4: vite.config.ts 작성 (Vitest 설정 포함)**

`defineConfig`는 `"vite"`가 아니라 `"vitest/config"`에서 가져온다 — 그래야
`test` 옵션의 타입이 인식되어 `tsc -b`가 통과한다.

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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

- [ ] **Step 5: src/test/setup.ts 작성**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: index.html 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>풀이장</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: src/main.tsx, src/App.tsx, src/index.css 작성**

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return <div>풀이장</div>;
}
```

`src/index.css`:
```css
body {
  margin: 0;
}
```

`src/vite-env.d.ts` (Vite의 `import.meta.env` 타입을 위해 필요 — 이게
없으면 `import.meta.env.VITE_GOOGLE_CLIENT_ID`를 쓰는 Task 11에서
`tsc --noEmit`이 `Property 'env' does not exist on type 'ImportMeta'`로
실패한다):
```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 8: 실패하는 테스트 작성 — src/App.test.tsx**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the app name", () => {
    render(<App />);
    expect(screen.getByText("풀이장")).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: 테스트 실행해 통과 확인**

Run: `pnpm test`
Expected: PASS (App.tsx가 이미 "풀이장"을 렌더링하므로 바로 통과 — 이 Task는
스캐폴딩이 목적이라 최소 구현이 이미 포함되어 있다)

- [ ] **Step 10: .gitignore, .env.example 작성**

`.gitignore`:
```
node_modules
dist
dist-ssr
*.local
.env.local
coverage
playwright-report
test-results
*.tsbuildinfo
```

`.env.example`:
```
VITE_GOOGLE_CLIENT_ID=
```

- [ ] **Step 11: 커밋**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.node.json vite.config.ts index.html src .gitignore .env.example
git commit -m "chore: scaffold Vite + React + TypeScript project"
```

---

### Task 2: ESLint + Prettier 설정

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

**Interfaces:**
- Consumes: Task 1의 `package.json` devDependencies (`typescript-eslint`,
  `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`,
  `eslint-config-prettier`)

- [ ] **Step 1: eslint.config.js 작성 (flat config)**

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  prettier,
);
```

devDependencies에 `@eslint/js`를 Task 1에서 빠뜨렸다면 이 Task에서
`pnpm add -D @eslint/js`로 추가한다.

- [ ] **Step 2: .prettierrc.json / .prettierignore 작성**

`.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

`.prettierignore`:
```
dist
coverage
playwright-report
test-results
pnpm-lock.yaml
```

- [ ] **Step 3: lint 실행해 통과 확인**

Run: `pnpm lint`
Expected: PASS (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add eslint.config.js .prettierrc.json .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: add ESLint and Prettier configuration"
```

---

### Task 3: Tailwind + 디자인 토큰 반영

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Modify: `src/index.css`
- Modify: `index.html`
- Create: `src/app/useTheme.ts`
- Test: `src/app/useTheme.test.ts`

**Interfaces:**
- Produces: `useTheme(): { theme: "light" | "dark"; toggleTheme: () => void }`
  — 이후 모든 화면의 다크모드 토글 버튼이 이 훅을 사용한다.

- [ ] **Step 1: tailwind.config.js 작성 (design-tokens.md 그대로 반영)**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#F7F7FB", dark: "#14131F" },
        surface: { DEFAULT: "#FFFFFF", dark: "#1C1B2B" },
        sunken: { DEFAULT: "#EDEDF5", dark: "#100F19" },
        border: { DEFAULT: "#D8D8E6", dark: "#34324A" },
        text: {
          DEFAULT: "#1D1B2E",
          secondary: "#5B5876",
          dark: "#ECEAF7",
          "dark-secondary": "#A6A2C2",
        },
        accent: {
          DEFAULT: "#3D3AA8",
          soft: "#E7E5F7",
          dark: "#8B87F0",
          "dark-soft": "#2A2750",
        },
        status: {
          unseen: "#9C99B3",
          answered: "#1F8A5F",
          "answered-dark": "#4FC98A",
          held: "#B8791C",
          "held-dark": "#E0A94A",
          review: "#B23A5C",
          "review-dark": "#E58BA6",
        },
        danger: "#B23A3A",
      },
      fontFamily: {
        display: ["Paperlogy", "Pretendard", "sans-serif"],
        body: ["Pretendard", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      borderRadius: { DEFAULT: "6px", lg: "12px", sm: "4px" },
      boxShadow: {
        card: "0 1px 2px rgba(29,27,46,0.06), 0 4px 12px rgba(29,27,46,0.05)",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: postcss.config.js 작성**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: 폰트 로드 — index.html에 Pretendard/IBM Plex Mono 링크 추가**

`index.html`의 `<head>` 안, `<title>` 다음에 추가:
```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
/>
<link
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 4: src/index.css 재작성 — Tailwind 지시문 + Paperlogy @font-face**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@font-face {
  font-family: "Paperlogy";
  src: url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2")
    format("woff2");
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: "Paperlogy";
  src: url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-6SemiBold.woff2")
    format("woff2");
  font-weight: 600;
  font-display: swap;
}

body {
  margin: 0;
}

*:focus-visible {
  outline: 2px solid theme("colors.accent.DEFAULT");
  outline-offset: 2px;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 5: 실패하는 테스트 작성 — src/app/useTheme.test.ts**

```typescript
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light theme and adds no dark class", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggles to dark and adds the dark class", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists the theme choice in localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggleTheme());
    expect(window.localStorage.getItem("sheet-quiz-theme")).toBe("dark");
  });
});
```

- [ ] **Step 6: 테스트 실행해 실패 확인**

Run: `pnpm test src/app/useTheme.test.ts`
Expected: FAIL with "Cannot find module './useTheme'"

- [ ] **Step 7: src/app/useTheme.ts 구현**

```typescript
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sheet-quiz-theme";
type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function applyThemeClass(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyThemeClass(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return { theme, toggleTheme };
}
```

- [ ] **Step 8: 테스트 실행해 통과 확인**

Run: `pnpm test src/app/useTheme.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: 커밋**

```bash
git add tailwind.config.js postcss.config.js src/index.css index.html src/app/useTheme.ts src/app/useTheme.test.ts package.json pnpm-lock.yaml
git commit -m "feat: apply design tokens via Tailwind and add theme toggle"
```

---

### Task 4: 공용 타입 정의

**Files:**
- Create: `src/types/question.ts`
- Create: `src/types/studyAttempt.ts`
- Create: `src/types/progress.ts`
- Test: `src/types/progress.test.ts`

**Interfaces:**
- Produces: `Question`, `QuestionOption` (`src/types/question.ts`),
  `StudyAttempt` (`src/types/studyAttempt.ts`), `QuestionAnswerStatus`,
  `QuestionProgress`, `createInitialProgress(questionId: string): QuestionProgress`
  (`src/types/progress.ts`) — 3단계(문제풀이 UI) 계획이 이 타입들을 그대로
  가져다 쓴다.

- [ ] **Step 1: src/types/question.ts 작성**

```typescript
export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type QuestionType = "SINGLE" | "MULTIPLE";

export interface QuestionOption {
  key: string;
  text: string;
  explanation?: string;
}

export interface Question {
  id: string;
  sourceRow: number;
  questionNumber: number;
  category?: string;
  difficulty: Difficulty;
  type: QuestionType;
  requiredAnswerCount: number;
  scenario?: string;
  text: string;
  options: QuestionOption[];
  correctAnswers: string[];
  explanation: string;
  keyPoints?: string[];
  relatedTopics?: string[];
  sourceUrl?: string;
}
```

- [ ] **Step 2: src/types/progress.ts 작성할 실패하는 테스트 먼저 작성**

```typescript
import { describe, expect, it } from "vitest";
import { createInitialProgress } from "./progress";

describe("createInitialProgress", () => {
  it("starts UNSEEN with no answers and no review mark", () => {
    const progress = createInitialProgress("q-1");
    expect(progress).toMatchObject({
      questionId: "q-1",
      selectedAnswers: [],
      status: "UNSEEN",
      reviewMarked: false,
    });
  });

  it("sets updatedAt to an ISO timestamp", () => {
    const progress = createInitialProgress("q-1");
    expect(() => new Date(progress.updatedAt).toISOString()).not.toThrow();
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm test src/types/progress.test.ts`
Expected: FAIL with "Cannot find module './progress'"

- [ ] **Step 4: src/types/progress.ts 구현**

```typescript
export type QuestionAnswerStatus = "UNSEEN" | "ANSWERED" | "SKIPPED";

export interface QuestionProgress {
  questionId: string;
  selectedAnswers: string[];
  status: QuestionAnswerStatus;
  reviewMarked: boolean;
  personalMemo?: string;
  firstViewedAt?: string;
  answeredAt?: string;
  updatedAt: string;
}

export function createInitialProgress(questionId: string): QuestionProgress {
  return {
    questionId,
    selectedAnswers: [],
    status: "UNSEEN",
    reviewMarked: false,
    updatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `pnpm test src/types/progress.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: src/types/studyAttempt.ts 작성 (타입 전용, 별도 테스트 없음)**

```typescript
import type { Question } from "./question";
import type { QuestionProgress } from "./progress";

export interface CategoryStat {
  name: string;
  total: number;
  correct: number;
}

export interface DifficultyStat {
  name: string;
  total: number;
  correct: number;
}

export interface StudyResult {
  scorePercent: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  categoryStats: CategoryStat[];
  difficultyStats: DifficultyStat[];
}

export interface StudyAttempt {
  id: string;
  googleUserId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetTabId: string;
  sheetTabName: string;
  parentFolderId: string;
  certificationFolderName: string;
  questionSetFingerprint: string;
  sourceModifiedTime: string;
  lastViewedQuestionId?: string;
  lastViewedIndex: number;
  startedAt: string;
  updatedAt: string;
  submittedAt?: string;
  progress: QuestionProgress[];
  result?: StudyResult;
  questionSnapshot?: Question[];
}
```

- [ ] **Step 7: 타입 체크 실행**

Run: `pnpm typecheck`
Expected: PASS (에러 없음)

- [ ] **Step 8: 커밋**

```bash
git add src/types
git commit -m "feat: add shared Question, StudyAttempt, and progress types"
```

---

### Task 5: Google Identity Services 연동 모듈

**Files:**
- Create: `src/types/google.d.ts`
- Create: `src/auth/googleAuthError.ts`
- Create: `src/auth/googleIdentity.ts`
- Test: `src/auth/googleIdentity.test.ts`

**Interfaces:**
- Produces: `GoogleAuthError` (code: `"popup_blocked" | "access_denied" |
  "popup_closed" | "network_error" | "unknown"`), `TokenResponse
  { accessToken: string; expiresAt: number }`, `createGoogleIdentityClient(clientId:
  string): { requestAccessToken(): Promise<TokenResponse> }` — Task 6(AuthContext)이
  이 클라이언트를 소비한다.

- [ ] **Step 1: src/types/google.d.ts 작성 (전역 타입 선언)**

```typescript
export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token: string;
              expires_in: number;
              error?: string;
            }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): { requestAccessToken: () => void };
        };
      };
    };
  }
}
```

- [ ] **Step 2: src/auth/googleAuthError.ts 작성**

```typescript
export type GoogleAuthErrorCode =
  | "popup_blocked"
  | "popup_closed"
  | "access_denied"
  | "network_error"
  | "unknown";

export class GoogleAuthError extends Error {
  code: GoogleAuthErrorCode;

  constructor(code: GoogleAuthErrorCode, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

export const AUTH_ERROR_MESSAGES: Record<GoogleAuthErrorCode, string> = {
  popup_blocked:
    "팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업 차단을 해제한 뒤 다시 시도해주세요.",
  popup_closed: "로그인 창이 닫혔습니다. 다시 시도해주세요.",
  access_denied: "Google 계정 접근 권한이 거부되었습니다. 읽기 권한을 승인해야 계속할 수 있습니다.",
  network_error: "네트워크 연결에 실패했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.",
  unknown: "알 수 없는 오류로 Google 연결에 실패했습니다. 다시 시도해주세요.",
};
```

- [ ] **Step 3: 실패하는 테스트 작성 — src/auth/googleIdentity.test.ts**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleIdentityClient } from "./googleIdentity";
import { GoogleAuthError } from "./googleAuthError";

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: { access_token: string; expires_in: number; error?: string }) => void;
  error_callback?: (error: { type: string; message?: string }) => void;
}

describe("createGoogleIdentityClient", () => {
  let initTokenClient: ReturnType<typeof vi.fn>;
  let requestAccessToken: ReturnType<typeof vi.fn>;
  let lastConfig: TokenClientConfig;

  beforeEach(() => {
    requestAccessToken = vi.fn();
    initTokenClient = vi.fn((config: TokenClientConfig) => {
      lastConfig = config;
      return { requestAccessToken };
    });
    window.google = { accounts: { oauth2: { initTokenClient } } };
  });

  afterEach(() => {
    delete window.google;
    vi.restoreAllMocks();
  });

  it("resolves with an access token on success", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.callback({
        access_token: "token-abc",
        expires_in: 3600,
      });
    });

    const client = createGoogleIdentityClient("client-id");
    const result = await client.requestAccessToken();

    expect(result.accessToken).toBe("token-abc");
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it("requests the read-only scopes required by the spec", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.callback({
        access_token: "token-abc",
        expires_in: 3600,
      });
    });

    const client = createGoogleIdentityClient("client-id");
    await client.requestAccessToken();

    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/spreadsheets.readonly",
        ].join(" "),
      }),
    );
  });

  it("rejects with access_denied when the user denies consent", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.callback({
        access_token: "",
        expires_in: 0,
        error: "access_denied",
      });
    });

    const client = createGoogleIdentityClient("client-id");
    await expect(client.requestAccessToken()).rejects.toMatchObject({
      code: "access_denied",
    } satisfies Partial<GoogleAuthError>);
  });

  it("rejects with popup_blocked when the popup fails to open", async () => {
    requestAccessToken.mockImplementation(() => {
      lastConfig.error_callback?.({
        type: "popup_failed_to_open",
      });
    });

    const client = createGoogleIdentityClient("client-id");
    await expect(client.requestAccessToken()).rejects.toMatchObject({
      code: "popup_blocked",
    } satisfies Partial<GoogleAuthError>);
  });
});
```

(주: 최초 버전은 `any` 캐스팅과 불필요한 `@ts-expect-error`를 썼다가
`pnpm typecheck`/`pnpm lint`에서 걸려 위 형태로 수정했다 — `lastConfig`를
타입이 있는 클로저 변수로 캡처하고, `window.google`이 optional이라
`delete`에 억제 주석이 필요 없다.)

- [ ] **Step 4: 테스트 실행해 실패 확인**

Run: `pnpm test src/auth/googleIdentity.test.ts`
Expected: FAIL with "Cannot find module './googleIdentity'"

- [ ] **Step 5: src/auth/googleIdentity.ts 구현**

```typescript
import { GoogleAuthError } from "./googleAuthError";

export interface TokenResponse {
  accessToken: string;
  expiresAt: number;
}

export interface GoogleIdentityClient {
  requestAccessToken(): Promise<TokenResponse>;
}

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
].join(" ");

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new GoogleAuthError("network_error", "Google 인증 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

function mapTokenError(error: string): GoogleAuthError {
  if (error === "access_denied") {
    return new GoogleAuthError("access_denied", "Google 계정 접근 권한이 거부되었습니다.");
  }
  return new GoogleAuthError("unknown", `Google 인증 오류: ${error}`);
}

function mapClientError(error: { type: string }): GoogleAuthError {
  if (error.type === "popup_failed_to_open") {
    return new GoogleAuthError("popup_blocked", "팝업이 차단되었습니다.");
  }
  if (error.type === "popup_closed") {
    return new GoogleAuthError("popup_closed", "로그인 창이 닫혔습니다.");
  }
  return new GoogleAuthError("unknown", "알 수 없는 Google 인증 오류가 발생했습니다.");
}

export function createGoogleIdentityClient(clientId: string): GoogleIdentityClient {
  return {
    async requestAccessToken() {
      await loadGisScript();
      if (!window.google) {
        throw new GoogleAuthError("network_error", "Google 인증 스크립트를 불러오지 못했습니다.");
      }

      return new Promise<TokenResponse>((resolve, reject) => {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: (response) => {
            if (response.error) {
              reject(mapTokenError(response.error));
              return;
            }
            resolve({
              accessToken: response.access_token,
              expiresAt: Date.now() + response.expires_in * 1000,
            });
          },
          error_callback: (error) => reject(mapClientError(error)),
        });
        tokenClient.requestAccessToken();
      });
    },
  };
}
```

- [ ] **Step 6: 테스트 실행해 통과 확인**

Run: `pnpm test src/auth/googleIdentity.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: 커밋**

```bash
git add src/types/google.d.ts src/auth/googleAuthError.ts src/auth/googleIdentity.ts src/auth/googleIdentity.test.ts
git commit -m "feat: add Google Identity Services client with error mapping"
```

---

### Task 6: 사용자 정보 조회 + AuthContext

**Files:**
- Create: `src/auth/userInfo.ts`
- Create: `src/auth/AuthContext.tsx`
- Test: `src/auth/userInfo.test.ts`
- Test: `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `createGoogleIdentityClient`, `TokenResponse`, `GoogleAuthError`
  (Task 5)
- Produces: `fetchGoogleUserInfo(accessToken: string): Promise<{ googleUserId:
  string; email: string }>` (`src/auth/userInfo.ts`); `AuthProvider`,
  `useAuth(): { status: "signed_out" | "connecting" | "connected" | "expired";
  googleUserId: string | null; email: string | null; error: GoogleAuthError |
  null; connect(): Promise<void>; disconnect(): void; getAccessToken(): string
  | null }` (`src/auth/AuthContext.tsx`) — 이후 모든 Drive/Sheets 호출 화면이
  `useAuth().getAccessToken()`을 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성 — src/auth/userInfo.test.ts**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleUserInfo } from "./userInfo";

describe("fetchGoogleUserInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the stable Google user id and email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sub: "1234567890", email: "user@example.com" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGoogleUserInfo("token-abc");

    expect(result).toEqual({ googleUserId: "1234567890", email: "user@example.com" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: "Bearer token-abc" } },
    );
  });

  it("throws GoogleAuthError when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(fetchGoogleUserInfo("token-abc")).rejects.toMatchObject({
      code: "unknown",
    });
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/auth/userInfo.test.ts`
Expected: FAIL with "Cannot find module './userInfo'"

- [ ] **Step 3: src/auth/userInfo.ts 구현**

```typescript
import { GoogleAuthError } from "./googleAuthError";

export interface GoogleUserInfo {
  googleUserId: string;
  email: string;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new GoogleAuthError("unknown", "Google 사용자 정보를 가져오지 못했습니다.");
  }
  const data = (await response.json()) as { sub: string; email: string };
  return { googleUserId: data.sub, email: data.email };
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm test src/auth/userInfo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 실패하는 테스트 작성 — src/auth/AuthContext.test.tsx**

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import * as googleIdentity from "./googleIdentity";
import * as userInfo from "./userInfo";

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="email">{auth.email ?? ""}</span>
      <button onClick={() => auth.connect()}>connect</button>
      <button onClick={() => auth.disconnect()}>disconnect</button>
    </div>
  );
}

describe("AuthContext", () => {
  afterEach(() => vi.restoreAllMocks());

  it("moves to connected status with the user's email after connect()", async () => {
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
      requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
    });
    vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
      googleUserId: "user-1",
      email: "user@example.com",
    });

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByText("connect"));
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("connected"));
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
  });

  it("resets to signed_out with an error when connect() fails", async () => {
    vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
      requestAccessToken: async () => {
        throw new (await import("./googleAuthError")).GoogleAuthError(
          "popup_blocked",
          "팝업이 차단되었습니다.",
        );
      },
    });

    render(
      <AuthProvider clientId="client-id">
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByText("connect"));
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
  });
});
```

- [ ] **Step 6: 테스트 실행해 실패 확인**

Run: `pnpm test src/auth/AuthContext.test.tsx`
Expected: FAIL with "Cannot find module './AuthContext'"

- [ ] **Step 7: src/auth/AuthContext.tsx 구현**

```tsx
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { createGoogleIdentityClient, TokenResponse } from "./googleIdentity";
import { fetchGoogleUserInfo } from "./userInfo";
import { GoogleAuthError } from "./googleAuthError";

type AuthStatus = "signed_out" | "connecting" | "connected" | "expired";

interface AuthContextValue {
  status: AuthStatus;
  googleUserId: string | null;
  email: string | null;
  error: GoogleAuthError | null;
  /** Resolves true once connected, false if the connection attempt failed. */
  connect: () => Promise<boolean>;
  disconnect: () => void;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const EXPIRY_BUFFER_MS = 60_000;

export function AuthProvider({
  clientId,
  children,
}: {
  clientId: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus>("signed_out");
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<GoogleAuthError | null>(null);
  const tokenRef = useRef<TokenResponse | null>(null);

  const connect = useCallback(async (): Promise<boolean> => {
    setStatus("connecting");
    setError(null);
    try {
      const client = createGoogleIdentityClient(clientId);
      const token = await client.requestAccessToken();
      tokenRef.current = token;
      const info = await fetchGoogleUserInfo(token.accessToken);
      setGoogleUserId(info.googleUserId);
      setEmail(info.email);
      setStatus("connected");
      return true;
    } catch (err) {
      tokenRef.current = null;
      setError(
        err instanceof GoogleAuthError
          ? err
          : new GoogleAuthError("unknown", "알 수 없는 오류로 Google 연결에 실패했습니다."),
      );
      setStatus("signed_out");
      return false;
    }
  }, [clientId]);

  const disconnect = useCallback(() => {
    tokenRef.current = null;
    setGoogleUserId(null);
    setEmail(null);
    setStatus("signed_out");
  }, []);

  const getAccessToken = useCallback((): string | null => {
    const token = tokenRef.current;
    if (!token || token.expiresAt - EXPIRY_BUFFER_MS < Date.now()) {
      if (token) setStatus("expired");
      return null;
    }
    return token.accessToken;
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, googleUserId, email, error, connect, disconnect, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
```

- [ ] **Step 8: 테스트 실행해 통과 확인**

Run: `pnpm test src/auth/AuthContext.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: 커밋**

```bash
git add src/auth/userInfo.ts src/auth/userInfo.test.ts src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx
git commit -m "feat: add Google user info lookup and AuthContext"
```

---

### Task 7: IndexedDB 저장소 (최상위 폴더)

**Files:**
- Modify: `src/test/setup.ts`
- Create: `src/storage/db.ts`
- Create: `src/storage/topFolderRepo.ts`
- Test: `src/storage/topFolderRepo.test.ts`

**Interfaces:**
- Produces: `saveTopFolder(selection: TopFolderSelection): Promise<void>`,
  `getTopFolder(googleUserId: string): Promise<TopFolderSelection | undefined>`,
  `clearTopFolder(googleUserId: string): Promise<void>` where
  `TopFolderSelection = { googleUserId: string; folderId: string; folderName:
  string; updatedAt: string }` (`src/storage/topFolderRepo.ts`) — Task 9(자격증
  폴더 목록 화면)와 설정 화면(5단계)이 이 레포지토리를 사용한다.

- [ ] **Step 1: fake-indexeddb 테스트 셋업 추가 — src/test/setup.ts 수정**

```typescript
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/storage/topFolderRepo.test.ts**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { clearTopFolder, getTopFolder, saveTopFolder } from "./topFolderRepo";

describe("topFolderRepo", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("sheet-quiz");
  });

  it("returns undefined when no top folder is saved", async () => {
    const result = await getTopFolder("user-1");
    expect(result).toBeUndefined();
  });

  it("saves and retrieves a top folder selection per Google user", async () => {
    await saveTopFolder({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "자격증 문제은행",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });

    const result = await getTopFolder("user-1");
    expect(result).toEqual({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "자격증 문제은행",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
  });

  it("keeps selections for different Google users separate", async () => {
    await saveTopFolder({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "폴더 A",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
    await saveTopFolder({
      googleUserId: "user-2",
      folderId: "folder-2",
      folderName: "폴더 B",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });

    expect((await getTopFolder("user-1"))?.folderId).toBe("folder-1");
    expect((await getTopFolder("user-2"))?.folderId).toBe("folder-2");
  });

  it("clears a saved selection", async () => {
    await saveTopFolder({
      googleUserId: "user-1",
      folderId: "folder-1",
      folderName: "폴더 A",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
    await clearTopFolder("user-1");
    expect(await getTopFolder("user-1")).toBeUndefined();
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm test src/storage/topFolderRepo.test.ts`
Expected: FAIL with "Cannot find module './topFolderRepo'"

- [ ] **Step 4: src/storage/db.ts 구현**

```typescript
import { DBSchema, IDBPDatabase, openDB } from "idb";
import type { TopFolderSelection } from "./topFolderRepo";

export interface SheetQuizDB extends DBSchema {
  topFolder: {
    key: string;
    value: TopFolderSelection;
  };
}

const DB_NAME = "sheet-quiz";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SheetQuizDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SheetQuizDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SheetQuizDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("topFolder")) {
          db.createObjectStore("topFolder", { keyPath: "googleUserId" });
        }
      },
    });
  }
  return dbPromise;
}
```

- [ ] **Step 5: src/storage/topFolderRepo.ts 구현**

```typescript
import { getDb } from "./db";

export interface TopFolderSelection {
  googleUserId: string;
  folderId: string;
  folderName: string;
  updatedAt: string;
}

export async function saveTopFolder(selection: TopFolderSelection): Promise<void> {
  const db = await getDb();
  await db.put("topFolder", selection);
}

export async function getTopFolder(
  googleUserId: string,
): Promise<TopFolderSelection | undefined> {
  const db = await getDb();
  return db.get("topFolder", googleUserId);
}

export async function clearTopFolder(googleUserId: string): Promise<void> {
  const db = await getDb();
  await db.delete("topFolder", googleUserId);
}
```

`db.ts`와 `topFolderRepo.ts`가 서로의 타입을 참조하는 순환 임포트를 만들지
않도록, `TopFolderSelection`은 `topFolderRepo.ts`에서 정의하고 `db.ts`는
`import type`으로만 가져온다 (위 코드대로).

- [ ] **Step 6: 테스트 실행해 통과 확인**

Run: `pnpm test src/storage/topFolderRepo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: 커밋**

```bash
git add src/storage/db.ts src/storage/topFolderRepo.ts src/storage/topFolderRepo.test.ts src/test/setup.ts package.json pnpm-lock.yaml
git commit -m "feat: add IndexedDB-backed top folder repository"
```

---

### Task 8: Drive REST 클라이언트

**Files:**
- Create: `src/drive/driveApiError.ts`
- Create: `src/drive/driveClient.ts`
- Test: `src/drive/driveClient.test.ts`

**Interfaces:**
- Produces: `DriveFolder { id: string; name: string; modifiedTime: string }`,
  `DriveApiError` (status: number), `listChildFolders(accessToken: string,
  parentId: string): Promise<DriveFolder[]>` (`src/drive/driveClient.ts`) —
  Task 9의 화면들이 이 함수를 사용하며, 2단계 계획(Sheet 목록)도 같은 파일에
  `listChildFiles`를 추가해 재사용한다.

- [ ] **Step 1: src/drive/driveApiError.ts 작성**

```typescript
export class DriveApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveApiError";
    this.status = status;
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/drive/driveClient.test.ts**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveApiError } from "./driveApiError";
import { listChildFolders, listRootFolders } from "./driveClient";

describe("listChildFolders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queries Drive for non-trashed folders under the given parent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: "f1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const folders = await listChildFolders("token-abc", "parent-1");

    expect(folders).toEqual([
      { id: "f1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("mimeType+%3D+%27application%2Fvnd.google-apps.folder%27");
    expect(calledUrl).toContain("trashed+%3D+false");
    expect(calledUrl).toContain("%27parent-1%27+in+parents");
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer token-abc" },
    });
  });

  it("throws DriveApiError with status 401 when the token is expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    await expect(listChildFolders("expired-token", "parent-1")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<DriveApiError>);
  });

  it("lists folders under the Drive root via listRootFolders", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listRootFolders("token-abc");

    expect(fetchMock.mock.calls[0][0]).toContain("%27root%27+in+parents");
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm test src/drive/driveClient.test.ts`
Expected: FAIL with "Cannot find module './driveClient'"

- [ ] **Step 4: src/drive/driveClient.ts 구현**

```typescript
import { DriveApiError } from "./driveApiError";

export interface DriveFolder {
  id: string;
  name: string;
  modifiedTime: string;
}

interface DriveFilesListResponse {
  files: DriveFolder[];
}

export async function listChildFolders(
  accessToken: string,
  parentId: string,
): Promise<DriveFolder[]> {
  const query = [
    `'${parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,modifiedTime)",
    orderBy: "name",
    pageSize: "1000",
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new DriveApiError(401, "Google 연결이 만료되었습니다.");
  }
  if (!response.ok) {
    throw new DriveApiError(response.status, "Drive 폴더 목록을 불러오지 못했습니다.");
  }

  const data = (await response.json()) as DriveFilesListResponse;
  return data.files ?? [];
}

export function listRootFolders(accessToken: string): Promise<DriveFolder[]> {
  return listChildFolders(accessToken, "root");
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `pnpm test src/drive/driveClient.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/drive/driveApiError.ts src/drive/driveClient.ts src/drive/driveClient.test.ts
git commit -m "feat: add Drive REST client for listing child folders"
```

---

### Task 9: 최상위 폴더 선택 화면

**Files:**
- Create: `src/test/renderWithConnectedAuth.tsx`
- Create: `src/components/Breadcrumb.tsx`
- Create: `src/components/ErrorBanner.tsx`
- Create: `src/pages/TopFolderSelectPage.tsx`
- Test: `src/pages/TopFolderSelectPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `listChildFolders`, `DriveFolder`,
  `DriveApiError` (Task 8), `saveTopFolder` (Task 7)
- Produces: `TopFolderSelectPage` (default export) — Task 11(라우터)이 이
  컴포넌트를 `/folders` 라우트에 연결한다. `renderWithConnectedAuth(ui:
  ReactElement, initialEntries?: string[]): RenderResult` (`src/test/
  renderWithConnectedAuth.tsx`) — GIS/사용자정보 mock이 이미 설정된 상태에서
  `connect()`까지 마친 뒤 렌더링하는 테스트 헬퍼. Task 10의 테스트도 이 헬퍼를
  재사용한다.

- [ ] **Step 0: src/test/renderWithConnectedAuth.tsx 작성**

`useAuth()`를 직접 쓰는 화면은 `AuthProvider`가 기본값(`signed_out`,
`googleUserId: null`)으로 시작하기 때문에, 테스트에서 GIS/사용자정보를
mock한 뒤 실제로 `connect()`가 완료되어 `status === "connected"`가 될 때까지
기다려야 화면이 정상 동작한다. 이 헬퍼가 그 과정을 감싼다.

```tsx
import { ReactElement, ReactNode, useEffect } from "react";
import { render, RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../auth/AuthContext";

function ConnectGate({ children }: { children: ReactNode }) {
  const { status, connect } = useAuth();
  useEffect(() => {
    if (status === "signed_out") void connect();
  }, [status, connect]);
  if (status !== "connected") return null;
  return <>{children}</>;
}

export function renderWithConnectedAuth(
  ui: ReactElement,
  initialEntries: string[] = ["/"],
): RenderResult {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider clientId="client-id">
        <ConnectGate>{ui}</ConnectGate>
      </AuthProvider>
    </MemoryRouter>,
  );
}
```

이 파일은 순수 테스트 유틸이므로 별도 단위 테스트 없이 다음 Step들의 테스트가
통과하는 것으로 검증한다.

- [ ] **Step 1: src/components/Breadcrumb.tsx 작성**

```tsx
export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="현재 위치"
      className="mb-4 flex items-center gap-1.5 font-mono text-[13px] text-text-secondary dark:text-text-dark-secondary"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="cursor-pointer underline-offset-2 hover:underline"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={isLast ? "font-semibold text-text dark:text-text-dark" : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && <span aria-hidden="true">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: src/components/ErrorBanner.tsx 작성**

```tsx
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger bg-surface p-4 text-sm text-danger dark:bg-surface-dark"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-danger px-3 py-1.5 text-xs font-semibold"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 실패하는 테스트 작성 — src/pages/TopFolderSelectPage.test.tsx**

```tsx
import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as driveClient from "../drive/driveClient";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import TopFolderSelectPage from "./TopFolderSelectPage";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

describe("TopFolderSelectPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists Drive root folders once connected", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockResolvedValue([
      { id: "f1", name: "자격증 문제은행", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);

    renderWithConnectedAuth(<TopFolderSelectPage />);

    await waitFor(() => expect(screen.getByText("자격증 문제은행")).toBeInTheDocument());
  });

  it("saves the selected folder as the top folder and navigates to the certification folders page", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockResolvedValue([
      { id: "f1", name: "자격증 문제은행", modifiedTime: "2026-09-01T00:00:00.000Z" },
    ]);
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([]);
    const saveSpy = vi.spyOn(topFolderRepo, "saveTopFolder").mockResolvedValue();

    renderWithConnectedAuth(
      <Routes>
        <Route path="/" element={<TopFolderSelectPage />} />
        <Route path="/folders" element={<div>자격증 폴더 화면</div>} />
      </Routes>,
    );
    await waitFor(() => screen.getByText("자격증 문제은행"));

    await userEvent.click(screen.getByText("자격증 문제은행"));
    await waitFor(() =>
      expect(driveClient.listChildFolders).toHaveBeenCalledWith("token-abc", "f1"),
    );

    await userEvent.click(screen.getByRole("button", { name: /이 폴더를 문제은행 최상위 폴더로 선택/ }));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ googleUserId: "user-1", folderId: "f1", folderName: "자격증 문제은행" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("자격증 폴더 화면")).toBeInTheDocument());
  });

  it("shows a retryable error banner when Drive listing fails", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockRejectedValue(
      new (await import("../drive/driveApiError")).DriveApiError(500, "Drive 폴더 목록을 불러오지 못했습니다."),
    );

    renderWithConnectedAuth(<TopFolderSelectPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Drive 폴더 목록을 불러오지 못했습니다."));
  });

  it("filters folders by the search query", async () => {
    mockAuthenticated();
    vi.spyOn(driveClient, "listRootFolders").mockResolvedValue([
      { id: "f1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
      { id: "f2", name: "SQLD", modifiedTime: "2026-08-01T00:00:00.000Z" },
    ]);

    renderWithConnectedAuth(<TopFolderSelectPage />);
    await waitFor(() => screen.getByText("AWS"));

    await userEvent.type(screen.getByPlaceholderText("폴더 또는 파일 검색"), "SQ");

    expect(screen.queryByText("AWS")).not.toBeInTheDocument();
    expect(screen.getByText("SQLD")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 테스트 실행해 실패 확인**

Run: `pnpm test src/pages/TopFolderSelectPage.test.tsx`
Expected: FAIL with "Cannot find module './TopFolderSelectPage'"

- [ ] **Step 5: src/pages/TopFolderSelectPage.tsx 구현**

```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFolder, listChildFolders, listRootFolders } from "../drive/driveClient";
import { saveTopFolder } from "../storage/topFolderRepo";
import { Breadcrumb, BreadcrumbItem } from "../components/Breadcrumb";
import { ErrorBanner } from "../components/ErrorBanner";

interface FolderLevel {
  id: string;
  name: string;
}

export default function TopFolderSelectPage() {
  const { getAccessToken, googleUserId } = useAuth();
  const navigate = useNavigate();
  const [path, setPath] = useState<FolderLevel[]>([{ id: "root", name: "내 드라이브" }]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = path[path.length - 1];

  const load = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result =
        currentFolder.id === "root"
          ? await listRootFolders(accessToken)
          : await listChildFolders(accessToken, currentFolder.id);
      setFolders(result);
    } catch (err) {
      setError(err instanceof DriveApiError ? err.message : "Drive 폴더 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [currentFolder.id, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (folder: DriveFolder) => {
    setPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery("");
  };

  const selectAsTopFolder = async () => {
    if (!googleUserId) return;
    await saveTopFolder({
      googleUserId,
      folderId: currentFolder.id,
      folderName: currentFolder.name,
      updatedAt: new Date().toISOString(),
    });
    navigate("/folders");
  };

  const breadcrumbItems: BreadcrumbItem[] = path.map((level, index) => ({
    label: level.name,
    onClick: index < path.length - 1 ? () => setPath(path.slice(0, index + 1)) : undefined,
  }));

  const visibleFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <Breadcrumb items={breadcrumbItems} />

      <div className="mb-5 flex items-center justify-between gap-3">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="폴더 또는 파일 검색"
          className="flex-1 rounded border border-border bg-sunken px-3.5 py-2.5 text-sm dark:border-border-dark dark:bg-sunken-dark"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border px-3.5 py-2.5 text-sm dark:border-border-dark"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={() => void selectAsTopFolder()}
          className="rounded bg-accent px-3.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
        >
          이 폴더를 문제은행 최상위 폴더로 선택
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {loading ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">불러오는 중…</p>
      ) : visibleFolders.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          하위 폴더가 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border dark:divide-border-dark dark:border-border-dark">
          {visibleFolders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                onClick={() => openFolder(folder)}
                className="flex w-full items-center justify-between px-4.5 py-3.5 text-left"
              >
                <span className="text-sm font-medium">{folder.name}</span>
                <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {folder.modifiedTime}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 테스트 실행해 통과 확인**

Run: `pnpm test src/pages/TopFolderSelectPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 7: 커밋**

```bash
git add src/components/Breadcrumb.tsx src/components/ErrorBanner.tsx src/pages/TopFolderSelectPage.tsx src/pages/TopFolderSelectPage.test.tsx
git commit -m "feat: add top folder selection page with search and breadcrumb"
```

---

### Task 10: 자격증 폴더 목록 화면 + 시작 화면

**Files:**
- Create: `src/pages/StartPage.tsx`
- Create: `src/pages/CertificationFoldersPage.tsx`
- Test: `src/pages/CertificationFoldersPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `listChildFolders`, `DriveFolder` (Task 8),
  `getTopFolder` (Task 7), `renderWithConnectedAuth` (Task 9)
- Produces: `StartPage`, `CertificationFoldersPage` (default exports) — Task 11
  (라우터)이 `/`와 `/folders`(최상위 폴더가 있을 때)에 연결한다.

- [ ] **Step 1: src/pages/StartPage.tsx 작성**

```tsx
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { AUTH_ERROR_MESSAGES } from "../auth/googleAuthError";

export default function StartPage() {
  const { status, error, connect } = useAuth();
  const navigate = useNavigate();

  const handleConnect = async () => {
    const success = await connect();
    if (success) navigate("/folders");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-10">
      <div className="w-full max-w-[460px] text-center">
        <h1 className="mb-3 font-display text-3xl font-bold tracking-tight">풀이장</h1>
        <p className="mb-8 text-[15px] leading-7 text-text-secondary dark:text-text-dark-secondary">
          Google Drive에 저장된 시트 문제은행을 연결해 자격증 문제를 한 문제씩
          풀고, 채점과 해설을 확인하는 개인용 도구입니다. 서버 없이 브라우저에서만
          동작하며, 시트 데이터는 어디로도 전송되지 않습니다.
        </p>

        {error && <ErrorBanner message={AUTH_ERROR_MESSAGES[error.code]} onRetry={handleConnect} />}

        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={status === "connecting"}
          className="w-full rounded bg-accent px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-60 dark:bg-accent-dark"
        >
          {status === "connecting" ? "연결하는 중…" : "Google Drive 연결"}
        </button>
        <p className="mt-2.5 text-xs text-text-secondary dark:text-text-dark-secondary">
          읽기 권한만 요청합니다. 계정 정보는 브라우저에만 저장됩니다.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 실패하는 테스트 작성 — src/pages/CertificationFoldersPage.test.tsx**

```tsx
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as googleIdentity from "../auth/googleIdentity";
import * as userInfo from "../auth/userInfo";
import * as driveClient from "../drive/driveClient";
import * as topFolderRepo from "../storage/topFolderRepo";
import { renderWithConnectedAuth } from "../test/renderWithConnectedAuth";
import CertificationFoldersPage from "./CertificationFoldersPage";

function mockAuthenticated() {
  vi.spyOn(googleIdentity, "createGoogleIdentityClient").mockReturnValue({
    requestAccessToken: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 3600_000 }),
  });
  vi.spyOn(userInfo, "fetchGoogleUserInfo").mockResolvedValue({
    googleUserId: "user-1",
    email: "user@example.com",
  });
}

describe("CertificationFoldersPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the saved top folder's child folders as certification folders", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue({
      googleUserId: "user-1",
      folderId: "top-1",
      folderName: "자격증 문제은행",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    vi.spyOn(driveClient, "listChildFolders").mockResolvedValue([
      { id: "c1", name: "AWS", modifiedTime: "2026-09-01T00:00:00.000Z" },
      { id: "c2", name: "SQLD", modifiedTime: "2026-08-01T00:00:00.000Z" },
    ]);

    renderWithConnectedAuth(<CertificationFoldersPage />);

    await waitFor(() => expect(screen.getByText("AWS")).toBeInTheDocument());
    expect(screen.getByText("SQLD")).toBeInTheDocument();
    expect(screen.getByText("자격증 문제은행")).toBeInTheDocument();
  });

  it("prompts to select a top folder when none is saved yet", async () => {
    mockAuthenticated();
    vi.spyOn(topFolderRepo, "getTopFolder").mockResolvedValue(undefined);

    renderWithConnectedAuth(<CertificationFoldersPage />);

    await waitFor(() =>
      expect(screen.getByText("먼저 문제은행 최상위 폴더를 선택해주세요.")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm test src/pages/CertificationFoldersPage.test.tsx`
Expected: FAIL with "Cannot find module './CertificationFoldersPage'"

- [ ] **Step 4: src/pages/CertificationFoldersPage.tsx 구현**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFolder, listChildFolders } from "../drive/driveClient";
import { getTopFolder, TopFolderSelection } from "../storage/topFolderRepo";
import { Breadcrumb } from "../components/Breadcrumb";
import { ErrorBanner } from "../components/ErrorBanner";

export default function CertificationFoldersPage() {
  const { getAccessToken, googleUserId } = useAuth();
  const [topFolder, setTopFolder] = useState<TopFolderSelection | null | undefined>(undefined);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!googleUserId) return;
    void getTopFolder(googleUserId).then((saved) => setTopFolder(saved ?? null));
  }, [googleUserId]);

  useEffect(() => {
    if (!topFolder) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    listChildFolders(accessToken, topFolder.folderId)
      .then(setFolders)
      .catch((err) =>
        setError(err instanceof DriveApiError ? err.message : "자격증 폴더 목록을 불러오지 못했습니다."),
      );
  }, [topFolder, getAccessToken]);

  if (topFolder === undefined) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (topFolder === null) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          먼저 문제은행 최상위 폴더를 선택해주세요.
        </p>
        <Link to="/folders/select" className="text-sm font-semibold text-accent dark:text-accent-dark">
          최상위 폴더 선택하러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <Breadcrumb items={[{ label: "내 드라이브" }, { label: topFolder.folderName }]} />
      {error && <ErrorBanner message={error} />}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border dark:divide-border-dark dark:border-border-dark">
        {folders.map((folder) => (
          <li key={folder.id} className="flex items-center justify-between px-4.5 py-3.5">
            <span className="text-sm font-medium">{folder.name}</span>
            <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
              {folder.modifiedTime}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `pnpm test src/pages/CertificationFoldersPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/pages/StartPage.tsx src/pages/CertificationFoldersPage.tsx src/pages/CertificationFoldersPage.test.tsx
git commit -m "feat: add start page and certification folders page"
```

---

### Task 11: 라우터 조립

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Create: `src/app/AppShell.tsx`

**Interfaces:**
- Consumes: `AuthProvider` (Task 6), `StartPage`, `TopFolderSelectPage`,
  `CertificationFoldersPage` (Tasks 9-10), `useTheme` (Task 3)
- Produces: 라우트 `/`, `/folders/select`, `/folders` — 2단계 계획이
  `/sheets/:spreadsheetId/tabs` 등을 이 라우터에 추가한다.

- [ ] **Step 1: src/app/AppShell.tsx 작성 (공용 헤더: 로고 + 다크모드 토글)**

```tsx
import { Link } from "react-router-dom";
import { useTheme } from "./useTheme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-bg text-text dark:bg-bg-dark dark:text-text-dark">
      <header className="flex items-center justify-between border-b border-border px-8 py-4 dark:border-border-dark">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-white dark:bg-accent-dark">
            풀
          </span>
          <span className="font-display text-[17px] font-semibold">풀이장</span>
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded border border-border bg-sunken px-3 py-1.5 text-[13px] text-text-secondary dark:border-border-dark dark:bg-sunken-dark dark:text-text-dark-secondary"
        >
          {theme === "dark" ? "라이트 모드" : "다크 모드"}
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: 기존 테스트를 라우팅에 맞게 수정 — src/App.test.tsx**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the start screen at the root route", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(screen.getByRole("heading", { name: "풀이장" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm test src/App.test.tsx`
Expected: FAIL — `<h1>`이 아직 없으므로 `getByRole("heading", ...)` 실패

- [ ] **Step 4: StartPage의 제목을 h1으로 확인 (이미 Task 10에서 `<h1>`로 작성됨),
  src/App.tsx를 라우터로 재작성**

```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./app/AppShell";
import StartPage from "./pages/StartPage";
import TopFolderSelectPage from "./pages/TopFolderSelectPage";
import CertificationFoldersPage from "./pages/CertificationFoldersPage";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export default function App() {
  return (
    <AuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<StartPage />} />
            <Route path="/folders/select" element={<TopFolderSelectPage />} />
            <Route path="/folders" element={<CertificationFoldersPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `pnpm test src/App.test.tsx`
Expected: PASS

- [ ] **Step 6: 전체 테스트/타입체크/린트 실행**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/App.tsx src/App.test.tsx src/app/AppShell.tsx
git commit -m "feat: wire up router and app shell"
```

---

### Task 12: Playwright E2E — 로그인부터 자격증 폴더 목록까지

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/support/googleApiMock.ts`
- Create: `e2e/drive-connect.spec.ts`

**Interfaces:**
- Consumes: 실제 앱 전체 (dev 서버 위에서 브라우저 자동화). GIS와 Drive REST를
  네트워크 레벨에서 가로챈다.

- [ ] **Step 1: playwright.config.ts 작성**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: e2e/support/googleApiMock.ts 작성 (GIS + Drive REST mock)**

```typescript
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
```

- [ ] **Step 3: e2e/drive-connect.spec.ts 작성**

```typescript
import { expect, test } from "@playwright/test";
import { mockGoogleApis } from "./support/googleApiMock";

test("로그인 → 최상위 폴더 선택 → 자격증 폴더 목록 확인", async ({ page }) => {
  await mockGoogleApis(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "풀이장" })).toBeVisible();
  await page.getByRole("button", { name: "Google Drive 연결" }).click();

  await expect(page).toHaveURL(/\/folders/);
  await page.getByRole("link", { name: "최상위 폴더 선택하러 가기" }).click();

  await expect(page.getByText("자격증 문제은행")).toBeVisible();
  await page.getByText("자격증 문제은행").click();
  await page
    .getByRole("button", { name: "이 폴더를 문제은행 최상위 폴더로 선택" })
    .click();

  await expect(page.getByText("AWS")).toBeVisible();
  await expect(page.getByText("SQLD")).toBeVisible();
});
```

- [ ] **Step 4: E2E 실행**

Run: `pnpm exec playwright install --with-deps chromium && pnpm e2e`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add playwright.config.ts e2e package.json pnpm-lock.yaml
git commit -m "test: add Playwright E2E flow for Drive connect and top folder selection"
```

---

### Task 13: 완료 조건 검증 (빌드 확인)

**Files:**
- (변경 없음 — 검증만 수행)

- [ ] **Step 1: 전체 파이프라인 실행**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전체 PASS, `dist/` 생성 확인

- [ ] **Step 2: 빌드 산출물이 정적 파일인지 확인**

Run: `ls dist`
Expected: `index.html`, `assets/` 등 정적 파일만 존재 (서버 코드 없음)

- [ ] **Step 3: 1단계 완료 조건 체크리스트 확인**

- [ ] `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm e2e` 모두 통과
- [ ] Google 로그인(mock) → 최상위 폴더 선택 → IndexedDB 저장 → 자격증 폴더 목록
      표시까지 E2E로 재현됨
- [ ] 액세스 토큰이 localStorage/IndexedDB 어디에도 저장되지 않음 (코드 검토로 확인:
      `grep -rn "accessToken" src/storage` 결과 없어야 함)
- [ ] 다크모드 토글이 모든 화면에서 동작
