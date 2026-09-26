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

## 사용 방법

### 1. 로그인 및 최상위 폴더 선택

1. 시작 화면에서 Google 계정으로 로그인합니다(GIS 팝업).
2. 처음 로그인하면 문제은행으로 사용할 **최상위 Drive 폴더**를 한 번
   선택합니다. 이후에는 이 폴더 기준으로 하위 폴더를 탐색합니다(폴더는
   `설정`에서 언제든 다시 선택할 수 있습니다).

### 2. 시트 찾아 풀이 시작

1. 폴더를 계층적으로 탐색하며(예: `자격증명 폴더 > 회차 폴더`) 문제가 담긴
   Google Sheets 파일을 선택합니다.
2. 스프레드시트에 유효한 탭이 여러 개면 탭 선택 화면이 나타납니다.
3. 선택한 탭은 자동으로 파싱·검증됩니다. 검증 화면에서 오류/경고를 확인할
   수 있으며, 오류가 있는 행은 출제에서 제외되고 이유가 함께 표시됩니다.
4. 같은 시트(및 동일한 문제 구성)로 이전에 풀던 기록이 있으면 **이어 풀기
   화면**에서 이어서 풀지, 새로 시작할지 선택합니다.

### 3. 문제 풀이

- 문제는 단일 정답(라디오) 또는 복수 정답(체크박스) 형식입니다.
- 문제별로 **검토 표시(review mark)**와 **개인 메모**를 남길 수 있습니다.
- 풀이 중 진행 상황은 각 답변 시점마다 IndexedDB에 자동 저장되므로, 탭을
  닫았다가 돌아와도 이어서 풀 수 있습니다.
- 모든 문제를 다 풀지 않아도 제출할 수 있으며, 제출 확인 화면에서 미응답
  문제 수를 다시 알려줍니다.

### 4. 채점 결과 확인

- 제출하면 단일 정답은 정확히 일치, 복수 정답은 선택 집합이 정답 집합과
  완전히 같아야 정답으로 채점됩니다(부분 점수 없음, 미응답은 오답 처리).
- 결과 화면에서 전체 정답률과 분류/난이도별 통계, 문항별 정답·오답 및
  선택지별 해설을 확인할 수 있습니다.
- 결과 화면에서 Markdown 또는 JSON 형식으로 결과를 내보낼(다운로드) 수
  있습니다.

### 5. 풀이 기록 관리 (`/history`)

- 지금까지 제출했거나 진행 중인 모든 풀이 기록을 목록으로 확인합니다.
- 기록을 다시 열어 이어 풀거나 결과를 다시 보고, 더 이상 필요 없는 기록은
  삭제할 수 있습니다.

### 6. 설정 (`/settings`)

- 최상위 Drive 폴더 재선택
- 라이트/다크 모드 전환(우측 상단 토글, 선택값은 `localStorage`에 저장)
- 전체 데이터 삭제(저장된 모든 풀이 기록과 폴더 설정을 브라우저에서 삭제)

### Google Sheet 문제 양식

1행은 헤더이며 열 순서는 상관없습니다. 헤더는 한글/영어 모두 인식됩니다.

| 한글 헤더 | 영어 헤더 | 필수 여부 |
| --- | --- | --- |
| 번호 | `question_no` | 선택(비우면 행 순서대로 자동 부여) |
| 분류 | `category` | 필수 |
| 난이도 | `difficulty` | 필수 |
| 유형 | `question_type` | 필수 |
| 상황 | `scenario` | 선택 |
| 문제 | `question` | 필수 |
| 보기 A~D | `option_a`~`option_d` | 필수 |
| 보기 E/F | `option_e`/`option_f` | 선택 |
| 정답 | `correct_answers` | 필수 |
| 정답 개수 | `required_answer_count` | 선택(검증용) |
| 해설 | `explanation` | 필수(비어 있으면 경고만) |
| 보기별 해설 | `option_a_explanation` 등 | 선택 |
| 핵심 키워드 | `key_points` | 선택 |
| 관련 주제 | `related_topics` | 선택 |
| 참고 URL | `source_url` | 선택 |
| 상태 | `status` | 선택 |

값 형식 규칙:

- **난이도**: `EASY`/`쉬움`, `MEDIUM`/`보통`, `HARD`/`어려움`(인식 불가 값은
  `MEDIUM`으로 대체하고 경고).
- **유형**: `SINGLE`/`단일`(정답 정확히 1개), `MULTIPLE`/`복수`(정답 2개
  이상).
- **정답**: 선택지 문자를 쉼표로 구분(예: `A` 또는 `A,C`). 존재하지 않는
  선택지 지정, 중복 지정은 오류.
- **선택지**: `A`부터 빈칸 없이 연속으로 채우며 최소 2개 필요.
- **상태**: 비워두면 출제 대상. 값이 있는데 `PUBLISHED`/`출제`/`ACTIVE`/
  `사용`이 아니면(`DRAFT`/`초안` 등) 해당 행은 출제에서 제외.
- **번호**: 값을 쓰면 같은 시트 안에서 중복될 수 없습니다.

예시 데이터 행:

| 번호 | 분류 | 난이도 | 유형 | 문제 | 보기 A | 보기 B | 보기 C | 보기 D | 정답 | 해설 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 네트워크 | MEDIUM | SINGLE | TCP와 UDP의 차이로 옳은 것은? | TCP는 비연결형이다 | UDP는 연결형이다 | TCP는 순서를 보장한다 | UDP는 순서를 보장한다 | C | TCP는 연결지향 프로토콜로 순서와 신뢰성을 보장한다. |

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

- 앱은 PWA로 설치할 수 있으며, 설치 후에는 네트워크 없이도 앱 화면 자체는
  실행됩니다. 다만 Drive/Sheets 목록 조회와 최초 문제 불러오기에는 여전히
  네트워크 연결이 필요합니다(한 번 불러온 풀이는 IndexedDB에서 이어서 풀 수
  있습니다).
- 여러 브라우저 탭에서 동시에 같은 풀이를 진행하면 마지막에 저장된 내용만
  남습니다.
- GitHub Pages 서브경로 배포는 위 안내대로 별도 설정이 필요하며, 이 저장소는
  해당 설정을 기본 포함하지 않습니다.
