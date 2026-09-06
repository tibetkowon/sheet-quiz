# 풀이장 (sheet-quiz)

개인용 자격증 학습 웹앱. Google Drive에 정리해 둔 시트를 문제은행으로 삼아
풀이·채점·복습을 진행합니다.

- React + Vite + TypeScript(strict)
- React Router
- Tailwind CSS
- IndexedDB(브라우저 로컬 저장)
- Google Drive / Google Sheets 연동(읽기 전용)
- 백엔드 없음, 외부 DB 없음, 런타임 AI 호출 없음

## 사전 준비: Google OAuth 클라이언트 발급

이 앱은 Google Identity Services(GIS)로 로그인하고, 발급받은 토큰으로 Drive/
Sheets API를 직접 호출합니다. 별도 서버가 없으므로 사용자가 직접 OAuth 2.0
클라이언트를 만들어야 합니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를
   생성(또는 선택)합니다.
2. "API 및 서비스 > 사용자 인증 정보"에서 **OAuth 클라이언트 ID**를 만들고,
   애플리케이션 유형은 **웹 애플리케이션**을 선택합니다.
3. "승인된 자바스크립트 원본"에 로컬 개발 주소(`http://localhost:5173`)와
   실제 배포 도메인을 등록합니다.
4. "API 및 서비스 > 라이브러리"에서 **Google Drive API**와 **Google Sheets
   API**를 사용 설정합니다.
5. 발급된 클라이언트 ID를 아래 환경변수 설정에 사용합니다.

## 설치 및 환경변수

```bash
pnpm install
cp .env.example .env.local
```

`.env.local`에 발급받은 클라이언트 ID를 채웁니다.

```
VITE_GOOGLE_CLIENT_ID=여기에_클라이언트_ID
```

이 값 하나 외에 다른 환경변수는 사용하지 않습니다.

## 개발 명령

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 로컬 개발 서버 실행(`http://localhost:5173`) |
| `pnpm test` | Vitest 유닛/컴포넌트 테스트 실행 |
| `pnpm test:watch` | Vitest를 watch 모드로 실행 |
| `pnpm typecheck` | `tsc --noEmit`으로 타입 검사 |
| `pnpm lint` | ESLint 검사 |
| `pnpm build` | `tsc -b && vite build`로 프로덕션 번들을 `dist/`에 생성 |
| `pnpm preview` | `pnpm build`로 만든 `dist/`를 정적 서버로 구동(포트 4173) |
| `pnpm e2e` | Playwright E2E 테스트 실행 — 내부적으로 `pnpm dev` 서버를 자동 기동한다 |

`pnpm e2e`는 프로덕션 번들이 아니라 `pnpm dev` 서버를 대상으로 실행되므로,
실제 배포 전에는 `pnpm build && pnpm preview`로 프로덕션 번들이 정상 동작하는지
별도로 확인하는 것을 권장합니다.

## 데이터와 프라이버시

- OAuth access token은 **메모리에만** 보관됩니다. 어떤 저장소(IndexedDB,
  localStorage 등)에도 기록하지 않으며, 새로고침하면 다시 로그인해야 합니다.
- 풀이 진행 상황, 채점 결과, 풀이 기록은 브라우저의 **IndexedDB**에만
  저장되고 서버로 전송되지 않습니다. 브라우저 저장소를 지우거나 다른
  기기/브라우저로 접속하면 기록이 보이지 않습니다.
- 다크모드 설정만 `localStorage`에 저장됩니다.
- Drive/Sheets API 호출은 모두 읽기 전용(list/get)입니다.

## 배포

정적 파일(`pnpm build`의 `dist/` 산출물)만 있으면 어디서든 호스팅할 수
있습니다. `VITE_GOOGLE_CLIENT_ID`는 빌드 시점에 번들에 인라인되므로, 빌드
전에 배포 환경의 값으로 설정되어 있어야 합니다.

### Vercel (1차 검증 대상)

1. GitHub 저장소를 Vercel에 import합니다.
2. 프로젝트 환경변수에 `VITE_GOOGLE_CLIENT_ID`를 등록합니다.
3. Build Command는 `pnpm build`, Output Directory는 `dist`로 설정합니다
   (Vite 프로젝트로 인식되면 기본값으로 자동 설정됩니다).
4. 배포된 도메인을 Google Cloud Console의 "승인된 자바스크립트 원본"에
   추가로 등록합니다.

### 다른 정적 호스팅

- **Cloudflare Pages**: Build command `pnpm build`, Build output directory
  `dist`. 환경변수 등록 방식은 Vercel과 동일합니다.
- **GitHub Pages**: 저장소 서브경로(`/<repo>/`)에 배포되므로
  `vite.config.ts`에 `base: "/<repo>/"`를 설정해야 자산 경로가 깨지지
  않습니다. SPA 라우팅이므로 404 페이지를 `index.html` 내용으로 대체하는
  fallback 설정이 필요합니다(예: `dist/index.html`을 `dist/404.html`로
  복사). 이 프로젝트는 서브경로 배포용 `base` 설정을 코드에 기본 포함하지
  않으므로, 필요할 때 위 설정을 직접 추가하세요.
- **일반 정적 서버(nginx 등)**: `dist/`를 그대로 서빙하고, 존재하지 않는
  경로는 모두 `index.html`로 rewrite하도록 설정합니다(SPA fallback).

## 알려진 제약

- 오프라인 지원은 없습니다. Drive/Sheets 목록 조회와 최초 문제 불러오기에는
  네트워크 연결이 필요합니다(한 번 불러온 풀이는 IndexedDB에서 이어서 풀 수
  있습니다).
- 여러 브라우저 탭에서 동시에 같은 풀이를 진행하면 마지막에 저장된 내용만
  남습니다.
- GitHub Pages 서브경로 배포는 위 안내대로 별도 설정이 필요하며, 이 저장소는
  해당 설정을 기본 포함하지 않습니다.
