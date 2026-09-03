# 풀이장 (sheet-quiz) 아키텍처 설계

- 작성일: 2026-09-03
- 상태: 사용자 검토 대기
- 관련 자산: `docs/design/handoff/` (Claude Design 핸드오프 원본)

## 1. 개요

Google Drive에 저장된 Google Sheet 문제은행을 읽어 자격증 문제를 풀 수 있는
개인용 정적 웹앱. 서버·DB·회원 시스템·AI API 연동 없음. 특정 자격증(AWS)에
종속되지 않고, 정해진 Sheet 형식만 지키면 어떤 자격증에도 재사용 가능해야 한다.

풀이 기록은 브라우저 IndexedDB에만 저장되고, Google OAuth 액세스 토큰은
메모리에만 유지한다(영구 저장 금지). Drive·Sheets는 읽기 전용으로만 접근한다.

이 문서는 사용자가 최초 요청에서 제공한 요구사항(제품 스펙, 30개 항목)을
기술 아키텍처로 옮긴 것이다. 기능 요구사항의 원문은 대화 기록에 있으며, 이
문서는 "어떻게 구현하는가"에 집중한다.

## 2. 핵심 제약

- Java/Spring Boot, 별도 백엔드, Supabase/Firebase/PostgreSQL 등 외부 DB 금지
- 관리자 기능, 회원 관리, AI API 연동, 클라우드 동기화 금지
- 순수 정적 파일로 빌드되어 Vercel/Cloudflare Pages/GitHub Pages/일반 정적
  서버 어디에나 배포 가능해야 함
- 전역 상태 관리 라이브러리 없이 React Context + hooks로 해결
- 무거운 UI 컴포넌트 라이브러리 사용 금지

## 3. 기술 스택

Vite, React 18, TypeScript(strict), React Router(브라우저 라우터), Tailwind
CSS, `idb`(IndexedDB 래퍼), Zod, Google Identity Services, Vitest, Testing
Library, Playwright, ESLint, Prettier, pnpm.

Google Drive/Sheets API는 `gapi` 클라이언트 라이브러리를 쓰지 않고 REST
엔드포인트를 `fetch`로 직접 호출한다. 의존성을 하나 줄이고 요청/응답을 온전히
통제할 수 있어 테스트 mock이 쉬워진다.

## 4. 폴더 구조

```
src/
  app/          라우터, 레이아웃, 최상위 App
  auth/         GIS 연동, AuthContext (토큰은 메모리에만)
  drive/        Drive REST 클라이언트, 폴더 탐색 훅
  sheets/       Sheets REST 클라이언트, 헤더 매핑, 파서, Zod 검증
  quiz/         문제풀이 상태기계, 네비게이션, 채점 엔진, fingerprint
  storage/      IndexedDB(idb) 레포지토리
  export/       Markdown/JSON 내보내기
  types/        공용 타입 (Question, StudyAttempt 등)
  components/   재사용 UI (버튼, 상태 배지, 카드, chip 등 — 디자인 토큰 기반)
  pages/        라우트별 화면
  test/         테스트 유틸 (Google API mock)
e2e/            Playwright 테스트
docs/
  design/handoff/   Claude Design 핸드오프 원본 (풀이장.dc.html, design-tokens.md)
  superpowers/specs/  아키텍처/기능 설계 문서
```

## 5. 상태 관리 경계

전역 라이브러리 없이 Context + hooks만 사용한다.

- **AuthContext**: GIS 토큰 클라이언트, in-memory access token, 로그인/로그아웃/
  재연결, Google 사용자 ID·이메일. 토큰은 `useRef`/모듈 스코프 변수에만 보관하고
  리렌더 트리거용 상태(연결됨/만료됨)만 Context state로 노출한다.
- **폴더 탐색**: 현재 폴더 ID를 라우트 파라미터로 관리한다. 별도 전역 컨텍스트
  불필요 — breadcrumb과 뒤로가기가 URL과 자연스럽게 맞물린다.
- **QuizContext**: 진행 중인 attempt의 로컬 상태 + IndexedDB 동기화 훅
  (`useAutosave`, debounce). attempt 단위로 provider를 마운트한다.

## 6. 라우팅 (React Router, 브라우저 라우터)

```
/                                시작 화면 (로그인 상태별 분기)
/folders/:folderId?              Drive 폴더 탐색 (최상위 미선택 시 선택 화면)
/sheets/:spreadsheetId/tabs      탭 선택 (유효 탭이 여러 개일 때)
/sheets/:spreadsheetId/validate  검증 결과
/quiz/:attemptId                 문제풀이
/quiz/:attemptId/resume          이어 풀기 선택 (기존 기록이 있을 때 진입점)
/quiz/:attemptId/submit          제출 확인
/results/:attemptId              결과·해설
/history                         저장된 풀이 기록
/settings                        설정
```

`attemptId`는 `googleUserId + spreadsheetId + sheetTabId + fingerprint`로 만든
안정적 키다(8절 참고). Vercel 배포를 1차 검증 대상으로 하며 base path는 `/`를
가정한다. GitHub Pages(서브경로 + 404 fallback)는 README에 별도 안내만 하고
지금 단계에서 라우팅 로직을 선제적으로 복잡하게 만들지 않는다.

## 7. 핵심 데이터 모델

```typescript
interface Question {
  id: string; // spreadsheetId + sheetTabId + 문제번호 + 본문 hash
  sourceRow: number;
  questionNumber: number;
  category?: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  type: "SINGLE" | "MULTIPLE";
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

interface QuestionOption {
  key: string; // "A" | "B" | ...
  text: string;
  explanation?: string;
}

type QuestionAnswerStatus = "UNSEEN" | "ANSWERED" | "SKIPPED";

interface QuestionProgress {
  questionId: string;
  selectedAnswers: string[];
  status: QuestionAnswerStatus;
  reviewMarked: boolean;
  personalMemo?: string;
  firstViewedAt?: string;
  answeredAt?: string;
  updatedAt: string;
}

interface StudyAttempt {
  id: string; // googleUserId + spreadsheetId + sheetTabId + fingerprint
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
  questionSnapshot?: Question[]; // 제출 시점 스냅샷, Sheet 원본 변경/삭제와 무관하게 유지
}
```

`StudyResult`, 분류별/난이도별 통계 타입은 4단계(채점/결과) 구현 계획에서
확정한다 — 지금 시점에 고정하면 결과 화면 요구사항(분류/난이도/단일·복수 정답
정답률, 자주 틀린 관련 주제)과 어긋날 위험이 있어 해당 단계에서 함께 설계한다.

## 8. Google Sheet 파싱·검증 파이프라인

`sheets/headerMap.ts`(한/영 헤더 별칭 매핑, 순서 무관) → `sheets/parseQuestions.ts`
(원시 행 배열 → 중간 DTO, 빈 행 무시·공백 trim) → `sheets/validateQuestions.ts`
(Zod 스키마 + 커스텀 규칙: 선택지 연속성, 정답 존재, 정답 개수 일치, 상태값
필터링 등 — 오류를 하나씩 중단하지 않고 전체 수집) → `quiz/fingerprint.ts`
(문제 세트 fingerprint 및 문제 ID 생성, 채점에 영향 없는 변경은 무시).

## 9. IndexedDB 스키마 (`idb` 사용)

- `topFolder`: Google 사용자별 선택된 최상위 폴더(싱글턴 per user)
- `recentItems`: 최근 사용한 폴더/파일
- `attempts`: `StudyAttempt`, keyPath `id`, 인덱스: `googleUserId`,
  `[spreadsheetId+sheetTabId]`
- 액세스 토큰은 어떤 store에도 저장하지 않는다.

## 10. 채점 엔진

`quiz/grading.ts`는 순수 함수로 구현한다(부수효과 없음, 단위 테스트 용이).
단일 정답은 정확히 일치, 복수 정답은 선택 집합과 정답 집합이 완전히 같아야
정답 — 부분 점수 없음. 미응답(`UNSEEN`/`SKIPPED`이며 답변 없음)은 오답 처리.

## 11. 디자인 시스템

`docs/design/handoff/`의 Claude Design 핸드오프를 기준으로 삼는다.

- **원본 프로토타입**: `풀이장.dc.html` — 시작/드라이브탐색/시트목록/검증오류/
  문제풀이/제출확인/결과/설정 8개 화면. 프로토타입 구조(`x-dc`, `sc-if`,
  `sc-for` 등)는 그대로 옮기지 않고, 시각 결과물(레이아웃·색·타이포·간격)만
  React + Tailwind로 재현한다.
- **토큰**: `design-tokens.md`의 Tailwind theme extension을 그대로
  `tailwind.config.js`에 반영한다 — 라이트/다크 색상(`bg`, `surface`, `sunken`,
  `border`, `text`, `accent`, `status.*`), 폰트(`display`: Paperlogy,
  `body`: Pretendard, `mono`: IBM Plex Mono), radius, `shadow-card`. 다크모드는
  Tailwind `darkMode: 'class'` 전략.
- **상태 5종(문제 네비게이터)**: 색+아이콘+테두리 3중 코딩(안 봄=점선 회색,
  답변완료=체크 청록, 보류=일시정지 앰버, 다시볼문제=북마크 로즈+모서리 컷,
  현재문제=인디고 굵은 링). 색상만으로 구분하지 않는다는 접근성 요구사항을
  이미 충족하는 형태.
- **시그니처 요소**: 해설/결과 카드의 접힌 모서리(`clip-path` corner cut) —
  "인덱스 카드로 문제를 정리한다"는 정체성을 반복 사용한다.
- **커버되지 않은 화면/상태**: 탭 선택, 이어 풀기 선택, Sheet 변경 충돌 처리,
  검증 오류 화면의 부가 버튼(오류 목록 복사/Markdown 다운로드/원본 열기),
  문제풀이 화면의 퀵 이동(다음 미응답/보류/다시볼문제, 목록으로 돌아가기),
  모바일 네비게이터 접기, 결과 화면의 내보내기 버튼과 분류·난이도 필터는 별도
  목업이 없다. 이미 확정된 토큰과 컴포넌트(버튼, 카드, chip, 배지)를 그대로
  조합해 해당 기능을 구현하는 단계(3~5단계)에서 채운다. 새로 디자인을 받지
  않기로 사용자와 합의됨(2026-09-03).

## 12. 테스트 전략

- **Vitest**: 헤더 파싱, 검증, 채점, fingerprint, 네비게이션(다음 미응답/보류/
  다시볼문제), 통계 계산, Markdown/JSON 내보내기 — 대부분 순수 함수라 단위
  테스트가 쉽다.
- **Testing Library**: 문제풀이 화면, 네비게이터, 검증 오류 화면 등 컴포넌트
  단위.
- **Playwright E2E**: GIS 연동 모듈을 인터페이스로 감싸고, E2E에서는
  `page.addInitScript`로 `window.google.accounts.oauth2`를 가짜 구현으로
  주입하고 `page.route()`로 Drive/Sheets REST 엔드포인트를 가로채 고정 응답을
  반환한다. 실제 Google 계정 없이 전체 사용자 흐름(로그인 mock → 폴더 선택 →
  Sheet 선택 → 검증 → 풀이 → 제출 → 결과 → 다운로드)을 재현한다.

## 13. 배포

Vercel을 1차 검증 대상으로 하고, README에 다른 정적 호스팅(Cloudflare Pages,
GitHub Pages, 일반 정적 서버) 배포 절차를 함께 문서화한다. 환경변수는
`VITE_GOOGLE_CLIENT_ID` 하나를 기본으로 하며, 필요성이 명확해지기 전까지 추가
환경변수를 만들지 않는다.

## 14. Claude-Codex 협업 프로세스

- Claude Code(이 세션)는 기능 단위(15절의 서브프로젝트)마다 구현 범위와 완료
  조건을 정의하고, Codex 플러그인에 구체적인 구현 지시(대상 파일, 인터페이스,
  완료 조건)를 전달한다.
- Codex가 코드/테스트를 작성하고 `pnpm test`/`lint`/`build`를 실행해 결과를
  보고한다.
- Claude Code가 diff와 실행 결과를 검토한 뒤, Codex 플러그인에 별도 관점의
  코드 리뷰(버그·보안·요구사항 누락·과도한 복잡성)를 요청한다. 별도 CLI
  세션을 새로 띄우는 대신, 리뷰 요청 자체를 "독립적인 관점에서 반박하듯
  검토하라"는 지시로 구성해 구현 판단에 이어지지 않는 리뷰를 유도한다.
- 리뷰 결과는 Claude Code가 판단하며, 수정이 필요하면 Codex에 재작업을
  요청한다. Claude Code는 애플리케이션 소스 코드를 직접 작성하지 않는다.
  Codex 플러그인을 사용할 수 없는 상황이 생기면 즉시 사용자에게 보고하고
  대신 코딩하지 않는다.

## 15. 구현 로드맵 (서브프로젝트 분해)

사용자가 정의한 6단계 로드맵을 그대로 서브프로젝트 단위로 사용한다. 각
단계는 `writing-plans` 스킬로 별도 구현 계획을 만들고, 계획 단위로 Codex에
위임한다.

1. 프로젝트 초기화, 기본 화면, GIS 연동, Drive 폴더 탐색, 최상위 폴더 저장
2. 하위 폴더 탐색, Sheet 목록, 탭/데이터 읽기, 파서, 검증
3. 문제풀이 UI, 단일/복수 정답, 문제 상태, IndexedDB 자동저장, 이어풀기
4. 최종 제출, 채점, 결과, 선택지별 해설, 오답관리
5. Markdown/JSON 내보내기, 설정/데이터 삭제, 오류 처리, 모바일/접근성
6. 테스트 보강, Codex 독립 리뷰, 리뷰 수정, README/문서, 프로덕션 빌드 검증

각 단계 완료 시 Codex가 테스트하고 Claude Code가 결과를 검증한 뒤 다음
단계로 진행한다.

## 16. 사용자 확정 사항 (참고)

- 라우팅: React Router (2026-09-03 확정)
- 배포 우선순위: Vercel (2026-09-03 확정)
- 다크모드: 라이트/다크 모두 지원 (2026-09-03 확정)
- 디자인 톤: 차분하고 신뢰감 있는 집중형 (2026-09-03 확정)
- 디자인 커버되지 않은 화면/상태는 기존 토큰·컴포넌트로 확장 구현 (2026-09-03 합의)
