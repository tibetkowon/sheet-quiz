# PWA 지원 설계

- 작성일: 2026-09-14
- 상태: 사용자 검토 대기
- 관련 문서: `docs/superpowers/specs/2026-09-03-sheet-quiz-architecture-design.md`

## 1. 개요

풀이장을 홈 화면에 설치해 브라우저 주소창 없이 독립 앱처럼 즉시 실행할 수
있도록 PWA(Progressive Web App)를 지원한다. 핵심 목적은 **설치/즉시 실행**이며,
Google Drive/Sheets 데이터의 완전한 오프라인 동기화는 범위에 포함하지 않는다.

이미 존재하는 동작(참고, 변경 없음): 한 번 불러온 풀이는 IndexedDB에 저장되어
있어 새로고침 후에도 이어서 풀 수 있다. 이 기능은 PWA 도입과 무관하게 이미
동작하며, PWA는 여기에 "앱 셸(HTML/CSS/JS)이 오프라인에서도 로드된다"는 성질을
추가로 보장한다.

## 2. 핵심 제약 (기존 제약과의 상호작용)

- OAuth 액세스 토큰은 메모리에만 보관한다(`docs/superpowers/specs/2026-09-03-...`
  4절 준수). 서비스워커는 이 토큰에 접근하거나 캐싱하지 않는다.
- Drive/Sheets API(`*.googleapis.com`) 호출은 읽기 전용이지만 인증 헤더가 붙은
  요청이다. 최신성과 보안을 위해 **런타임 캐싱 대상에서 명시적으로 제외**한다.
  네트워크가 없으면 폴더 탐색/새 Sheet 불러오기는 여전히 실패해야 하며, 이는
  README에 이미 안내된 기존 제약(`오프라인 지원은 없습니다`)의 일부를 유지하는
  것이다 — 다만 "앱 자체 실행"은 오프라인에서도 가능해지므로 README 문구를
  갱신한다(6절 참고).
- 백엔드/외부 DB 없음 원칙 유지 — 서비스워커는 정적 자산만 캐싱하는 클라이언트
  전용 계층이다.

## 3. 구현 방식

`vite-plugin-pwa`(devDependency)를 사용한다. Vite 빌드와 통합되어 있어
manifest.json과 서비스워커(Workbox 기반)를 빌드 시점에 자동 생성하고 캐시
무효화(파일 해시 기반)를 알아서 처리한다.

### 3.1 서비스워커 전략

- `registerType: 'autoUpdate'` — 새 배포가 감지되면 다음 방문 시 자동으로 최신
  버전을 사용한다. "업데이트 알림 UI" 등 추가 컴포넌트는 만들지 않는다(설치
  중심 목표에 비해 과함).
- 기본 `generateSW` 전략으로 빌드 산출물(JS/CSS/HTML)을 precache한다.
- `navigateFallback: 'index.html'`로 설정해 오프라인 상태에서도 SPA 라우팅이
  깨지지 않게 한다.
- `googleapis.com`에 대한 `runtimeCaching` 규칙은 추가하지 않는다(2절 참고).
- `index.html`에서 로드하는 외부 폰트(Pretendard/IBM Plex Mono, jsdelivr·Google
  Fonts CDN)는 캐싱 대상에 포함하지 않는다 — 설치 중심 목표에는 불필요하고,
  범위를 넓히지 않는다(YAGNI).

### 3.2 아이콘

- `public/favicon.svg`(보라색 체크 표시, `#3D3AA8`)를 원본으로 사용한다.
- `@vite-pwa/assets-generator`(devDependency)로 다음을 1회 생성한다:
  - `public/icons/pwa-192x192.png`
  - `public/icons/pwa-512x512.png`
  - `public/icons/maskable-512x512.png` (세이프존 확보를 위해 `bg.DEFAULT
    #F7F7FB` 배경을 채운 버전)
- 생성된 PNG는 정적 자산으로 저장소에 커밋한다. 매 빌드마다 재생성하지 않는다
  (샌드박스/CI 환경에서 이미지 래스터라이즈 도구 의존성 문제를 피하기 위함).
  아이콘을 다시 만들어야 할 경우를 위해 생성 설정(`pwa-assets.config.ts`)과
  `package.json`의 생성 스크립트는 남겨둔다.

### 3.3 manifest 필드

| 필드 | 값 |
| --- | --- |
| `name` | 풀이장 |
| `short_name` | 풀이장 |
| `display` | `standalone` |
| `start_url` | `/` |
| `scope` | `/` |
| `theme_color` | `#F7F7FB` (라이트 테마 기준 고정) |
| `background_color` | `#F7F7FB` |
| `icons` | 3.2의 192/512/maskable-512 |

다크모드 사용자를 위해 `index.html`에
`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#14131F">`
를 추가로 넣어 브라우저 크롬(상단바 등) 색상만 보완한다. manifest 자체의
`theme_color`는 단일 값만 지원하므로 라이트 값으로 고정한다.

### 3.4 iOS Safari 보완

iOS Safari는 Web App Manifest를 완전히 지원하지 않으므로 `index.html`에 다음을
추가한다:

- `<link rel="apple-touch-icon" href="/icons/pwa-192x192.png">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`

## 4. 파일 영향 범위

- 신규
  - `public/icons/pwa-192x192.png`
  - `public/icons/pwa-512x512.png`
  - `public/icons/maskable-512x512.png`
  - `pwa-assets.config.ts`
- 수정
  - `vite.config.ts` (vite-plugin-pwa 플러그인 등록)
  - `index.html` (apple 관련 meta 태그, dark theme-color meta 태그)
  - `package.json` (devDependency 2개 추가: `vite-plugin-pwa`,
    `@vite-pwa/assets-generator`; 아이콘 생성 스크립트 1개 추가)
  - `README.md` ("오프라인 지원은 없습니다" 문구를 "앱 설치/오프라인 실행은
    가능하나 Drive/Sheets 데이터 조회에는 여전히 네트워크가 필요합니다"로 갱신)

## 5. 테스트

로직 변경이 없는 순수 빌드/설정 변경이므로:

- 기존 Vitest/Playwright 스위트는 변경 없이 통과해야 한다.
- `pnpm build` 산출물(`dist/`)에 `manifest.webmanifest`와 서비스워커 파일
  (`sw.js` 또는 `vite-plugin-pwa`가 생성하는 이름)이 존재하는지 확인한다.
- 서비스워커 등록 자체를 Playwright로 엔드투엔드 검증하는 것은 이 앱 규모에는
  과하므로 하지 않는다.

## 6. 범위 밖 (Out of scope)

- Google Drive/Sheets 데이터의 오프라인 동기화·캐싱
- 푸시 알림
- 백그라운드 동기화(Background Sync API)
- 업데이트 알림 UI(사용자에게 "새 버전이 있습니다" 토스트 등 표시)
- Android/iOS 네이티브 앱 스토어 배포용 wrapper(TWA, Capacitor 등)

## 7. 알려진 제약

- iOS Safari는 서비스워커 캐시 용량과 지속성이 Android/데스크톱보다 제한적이라,
  iOS에서 홈 화면 아이콘 실행 후에도 일부 자산이 재요청될 수 있다.
- `theme_color`는 라이트 테마 값으로 고정되므로, 다크모드 사용자의 OS
  설정(예: Android 상태바)이 라이트 색상으로 보일 수 있는 브라우저가 있을 수
  있다(3.3의 media query meta 태그로 대부분의 최신 브라우저는 보완됨).
