# 풀이장 (sheet-quiz) 아키텍처 설계

- 작성일: 2026-09-03
- 상태: 사용자 검토 대기
- 관련 자산: `docs/design/handoff/` (Claude Design 핸드오프 원본)

## 1. 개요

Google Drive에 저장된 Google Sheet 문제은행을 읽어 자격증 문제를 풀 수 있는
개인용 정적 웹앱. 자체 서버·회원 시스템·AI API 연동 없음. 특정 자격증(AWS)에
종속되지 않고, 정해진 Sheet 형식만 지키면 어떤 자격증에도 재사용 가능해야 한다.

풀이 기록은 Firestore(사용자별, 소유자만 접근)에 저장하고 SDK 오프라인 캐시를
쓴다. 그래서 새로고침해도, 다른 기기(PC↔모바일)에서도 이어 풀 수 있다. 로그인
세션은 Firebase Auth가 유지하고, Drive/Sheets OAuth 액세스 토큰은 메모리에만
유지한다(영구 저장 금지). Drive·Sheets는 읽기 전용으로만 접근한다.

이 문서는 사용자가 최초 요청에서 제공한 요구사항(제품 스펙, 30개 항목)을
기술 아키텍처로 옮긴 것이다. 기능 요구사항의 원문은 대화 기록에 있으며, 이
문서는 "어떻게 구현하는가"에 집중한다.

## 2. 핵심 제약

- Java/Spring Boot 등 자체 백엔드 서버 금지. 저장/인증 외부 서비스는 Firebase
  Auth와 Firestore만 허용한다(2026-11-19 사용자 결정). 그 밖의 외부 DB 금지
- 관리자 기능, 회원 관리, AI API 연동 금지
- 순수 정적 파일로 빌드되어 Vercel/Cloudflare Pages/GitHub Pages/일반 정적
  서버 어디에나 배포 가능해야 함
- 전역 상태 관리 라이브러리 없이 React Context + hooks로 해결
- 무거운 UI 컴포넌트 라이브러리 사용 금지

## 3. 기술 스택

Vite, React 19, TypeScript(strict), React Router(브라우저 라우터), Astryx
(`@astryxdesign/core`, neutral 테마 — UI 컴포넌트와 디자인 토큰), Tailwind
CSS 3(레이아웃 보조), Firebase(Auth, Firestore), `idb`(기존 IndexedDB 데이터
마이그레이션 전용), Zod, Google Identity Services, Vitest, Testing
Library, Playwright, ESLint, Prettier, pnpm.

Google Drive/Sheets API는 `gapi` 클라이언트 라이브러리를 쓰지 않고 REST
엔드포인트를 `fetch`로 직접 호출한다. 의존성을 하나 줄이고 요청/응답을 온전히
통제할 수 있어 테스트 mock이 쉬워진다.

## 4. 폴더 구조

```
src/
  app/          라우터, 레이아웃, 최상위 App
  firebase.ts   Firebase 앱·Auth·Firestore 초기화 (e2e에서는 Emulator 연결)
  auth/         Firebase Auth 로그인, GIS 연동(Drive 재연결), AuthContext (Drive 토큰은 메모리에만)
  drive/        Drive REST 클라이언트, 폴더 탐색 훅
  sheets/       Sheets REST 클라이언트, 헤더 매핑, 파서, Zod 검증
  quiz/         문제풀이 상태기계, 네비게이션, 채점 엔진, fingerprint
  storage/      Firestore 레포지토리 + 1회성 IndexedDB 마이그레이션
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

- **AuthContext**: 신원과 Drive 토큰을 나눠서 다룬다.
  - 신원: Firebase Auth 사용자(세션은 SDK가 브라우저에 유지, 새로고침해도 유지).
    Google 사용자 ID(Google sub)·이메일.
  - Drive 토큰: 첫 로그인(`signInWithPopup`, Drive/Sheets 읽기 범위 포함) 결과에서
    받고, 이후 재연결은 GIS 토큰 클라이언트(`login_hint`)로 받는다. `useRef`에만
    보관한다.
  - 상태: 시작 시 `connecting`(세션 복원 중), Firebase 사용자는 있는데 토큰이
    없으면 `expired`(→ "드라이브 다시 연결"), 둘 다 있으면 `connected`, 사용자가
    없으면 `signed_out`. 풀이·결과·기록 화면은 신원만 있으면 동작한다.
- **폴더 탐색**: 현재 폴더 ID를 라우트 파라미터로 관리한다. 별도 전역 컨텍스트
  불필요 — breadcrumb과 뒤로가기가 URL과 자연스럽게 맞물린다.
- **QuizContext**: 진행 중인 attempt의 로컬 상태 + repo 동기화 훅
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

### 8.1 시트 헤더 양식 (`headerMap.ts` 기준)

1행 = 헤더, 열 순서는 무관. 한글/영어 헤더 모두 인식된다.

| 한글 헤더 | 영어 헤더 | 필수 여부 |
|---|---|---|
| 번호 | `question_no` | 필수 |
| 분류 | `category` | 필수 |
| 난이도 | `difficulty` | 필수 |
| 유형 | `question_type` | 필수 |
| 상황 | `scenario` | 선택 |
| 문제 | `question` | 필수 |
| 보기 A / B / C / D | `option_a` ~ `option_d` | 필수(A~D) |
| 보기 E / F | `option_e` / `option_f` | 선택 |
| 정답 | `correct_answers` | 필수 |
| 정답 개수 | `required_answer_count` | 선택(검증용) |
| 해설 | `explanation` | 필수(비어 있으면 경고만, 차단은 아님) |
| 보기 A~F 해설 | `option_a_explanation` 등 | 선택 |
| 핵심 키워드 | `key_points` | 선택 |
| 관련 주제 | `related_topics` | 선택 |
| 참고 URL | `source_url` | 선택 |
| 상태 | `status` | 선택 |
| 세트 ID | `set_id` | 선택(현재 미사용) |
| 출제일 | `published_at` | 선택(현재 미사용) |

값 형식 규칙(`validateQuestions.ts` 기준):

- **난이도**: `EASY`/`쉬움`, `MEDIUM`/`보통`, `HARD`/`어려움`. 인식 불가 값은 `MEDIUM`으로 대체하고 경고.
- **유형**: `SINGLE`/`단일`/`단일 정답`/`객관식 단일`, `MULTIPLE`/`복수`/`복수 정답`/`객관식 복수`. SINGLE은 정답 정확히 1개, MULTIPLE은 2개 이상이어야 함.
- **정답**: 쉼표로 구분한 선택지 문자(예: `A` 또는 `A,C`). 존재하지 않는 선택지 지정, 중복 지정은 오류.
- **선택지**: `A`부터 중간에 빈칸 없이 연속으로 채워야 하며 최소 2개 필요. `E`/`F`는 선택.
- **정답 개수**(`required_answer_count`)를 채우면 실제 정답 수와 일치해야 함(불일치 시 오류).
- **상태**: 비워두면 출제 대상에 포함. 값이 있는데 `PUBLISHED`/`출제`/`ACTIVE`/`사용`이 아니면(`DRAFT`/`초안`/`INACTIVE`/`미사용` 등) 해당 행은 제외.
- **번호**(`question_no`): 비우면 행 순서대로 자동 부여. 값을 쓰면 시트 내 중복 불가.
- **핵심 키워드 / 관련 주제**: 쉼표로 구분한 여러 값.

예시 데이터 행:

| 번호 | 분류 | 난이도 | 유형 | 문제 | 보기 A | 보기 B | 보기 C | 보기 D | 정답 | 해설 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 네트워크 | MEDIUM | SINGLE | TCP와 UDP의 차이로 옳은 것은? | TCP는 비연결형이다 | UDP는 연결형이다 | TCP는 순서를 보장한다 | UDP는 순서를 보장한다 | C | TCP는 연결지향 프로토콜로 순서와 신뢰성을 보장한다. |

### 8.2 키워드 탭 (선택)

스프레드시트 안에 이름이 정확히 `키워드`인 탭을 두면 시험 시작 전 화면의 "키워드 보기"에서 영역별 정리본을 볼 수 있다. 탭이 없어도 다른 기능은 영향이 없다.

1행 = 헤더. `영역`(별칭 `분류`), `키워드`는 필수, `설명`은 선택. `영역`은 문제 탭의 `분류`와 같은 표기를 쓰는 것을 권장한다(앱이 강제하지는 않는다). 영역 또는 키워드가 빈 행은 무시한다.

| 영역 | 키워드 | 설명 |
|---|---|---|
| 네트워크 | TCP 3-way handshake | SYN → SYN-ACK → ACK |

- `키워드` 탭은 문제 탭 선택 후보와 자동 선택 대상에서 제외한다(`pickQuestionTab`).
- 키워드는 화면에 들어갈 때마다 Sheets API로 읽으며 IndexedDB에 저장하지 않는다.
- 시험 풀이 중 키워드 보기는 지원하지 않는다.

## 9. 저장소 (Firestore)

2026-11-19부터 Firestore가 원본이다. 계획: `docs/superpowers/plans/2026-11-19-firestore-sync.md`.

```
users/{firebaseUid}/attempts/{attemptId}       StudyAttempt (questionSnapshot 포함)
users/{firebaseUid}/topFolder/{googleUserId}   TopFolderSelection
```

- 보안 규칙: `users/{uid}/**`는 `request.auth.uid == uid`일 때만 읽고 쓸 수 있다.
  문서 내용과 `attemptId`는 계속 Google sub(`googleUserId`)를 쓴다.
- 오프라인: SDK `persistentLocalCache`(`persistentMultipleTabManager`). 쓰기는 서버
  응답을 기다리지 않는다("저장됨" = 이 기기에 저장, 동기화 대기).
- 기기 간 동기화: 화면을 열 때 읽는다(실시간 구독 없음).
- 충돌: 문서 단위 last write wins. 단, 이미 제출된 문서를 제출 전 상태로 덮어쓰지
  않고(`allowSubmittedOverwrite` 제외), `updatedAt`이 더 오래된 쓰기는 버린다.
  두 기기에서 같은 attempt를 동시에 풀면 늦게 저장한 쪽이 이긴다.
- 문서 크기(1 MiB 한도): JSON 크기가 900 KB를 넘으면 저장하지 않고 탭을 나누라고
  안내한다. 문제 생성 프롬프트는 탭당 150문항, 필드별 글자 수 상한을 둔다.
- 기존 IndexedDB(`sheet-quiz` DB, `idb`) 기록은 기기별 첫 로그인 때 한 번 업로드하고
  이후로는 읽지 않는다.
- 액세스 토큰은 어디에도 저장하지 않는다.

## 10. 채점 엔진

`quiz/grading.ts`는 순수 함수로 구현한다(부수효과 없음, 단위 테스트 용이).
단일 정답은 정확히 일치, 복수 정답은 선택 집합과 정답 집합이 완전히 같아야
정답 — 부분 점수 없음. 미응답(`UNSEEN`/`SKIPPED`이며 답변 없음)은 오답 처리.

## 11. 디자인 시스템

2026-11-18에 직접 만든 Tailwind 토큰 기반 UI를 Astryx(Meta 오픈소스 React 디자인
시스템, 0.x 베타)로 전환했다. 전환 계획과 결정 과정은
`docs/superpowers/plans/2026-11-18-astryx-migration.md`에 있다. 이전에 기준으로 삼던
`docs/design/handoff/`와 `design-tokens.md`는 더 이상 구현 기준이 아니다.

- **컴포넌트**: Astryx 컴포넌트(`Button`, `Card`, `Item`, `Badge`, `RadioList`,
  `CheckboxList`, `Collapsible`, `Drawer`, `TopNav` 등)를 하위 경로로 가져와 쓴다
  (`@astryxdesign/core/Button`). props는 추측하지 말고
  `pnpm exec astryx component <이름>`으로 확인한다.
- **Tailwind의 역할**: 레이아웃 보조(flex/grid/간격)에만 쓴다. 색·글자 스타일·다크
  모드는 Tailwind가 아니라 Astryx 토큰이 맡는다. Astryx의 Tailwind 브릿지는 v4
  전용이라 쓰지 않으며, Tailwind preflight는 끈다(`@layer` 밖이라 Astryx 스타일을
  덮어쓰기 때문). Astryx 토큰이 필요하면 `bg-[var(--color-background-surface)]`처럼
  임의 값으로만 쓴다.
- **토큰 덮어쓰기**: `src/index.css`에서 포인트 색(라이트 `#5146C8`, 다크 `#6258DC`,
  로고 색)과 폰트(본문·제목 모두 나눔스퀘어라운드, 글자 끝이 둥근 한글 폰트)를 덮어쓴다. `<Theme>`이 감싼 요소에도
  같은 토큰을 다시 선언하므로 선택자는 반드시 `:root, [data-astryx-theme]`로 한다.
- **다크 모드**: `<Theme mode>`가 `<html data-theme>`을 설정한다. 선택값은 localStorage
  `sheet-quiz-theme`에 저장하고, `index.html`의 짧은 스크립트가 마운트 전에 적용해 첫
  화면 깜빡임을 막는다. 모드 상태는 `AstryxProviders`가 한 곳에서 갖고 `useThemeMode()`로
  공유한다(훅을 컴포넌트마다 따로 호출하면 상태가 어긋난다).
- **한국어**: `InternationalizationProvider`에 `ko-KR` 카탈로그를 넣어 Astryx 내장
  문구(본문으로 건너뛰기, 닫기 등)를 한국어로 표시한다.
- **상태 5종(문제 목록)**: 색+아이콘+테두리 3중 코딩(안 봄=점선 회색, 답변완료=체크
  초록, 보류=일시정지 노랑, 다시볼문제=깃발 빨강, 현재문제=굵은 강조 링). 범례는 글자
  대신 실제 칸과 같은 모양의 견본으로 보여준다. 색상만으로 구분하지 않는다.
  `QuestionNavigatorGrid`는 이 3중 코딩 때문에 Astryx 컴포넌트가 아니라 자체 마크업을 쓴다.
- **날짜 표기**: 화면의 모든 날짜는 ISO 8601(`YYYY-MM-DD`, 사용자 로컬 시간대)로 보인다.
- **전환하며 제외한 것**: 해설/결과 카드의 접힌 모서리(`clip-path`) 시그니처 요소와
  기존 프로토타입의 인디고 단일 팔레트는 Astryx 전환 과정에서 쓰지 않는다.
- **커버되지 않은 화면/상태**: 탭 선택, 이어 풀기 선택, Sheet 변경 충돌 처리, 검증
  오류 화면의 부가 버튼, 문제풀이 화면의 퀵 이동, 모바일 문제 목록(서랍), 결과 화면의
  내보내기 버튼과 필터는 별도 목업이 없다. 이미 확정된 컴포넌트를 조합해 구현한다
  (2026-09-03 사용자와 합의, 전환 후에도 동일).

## 12. 테스트 전략

- **Vitest**: 헤더 파싱, 검증, 채점, fingerprint, 네비게이션(다음 미응답/보류/
  다시볼문제), 통계 계산, Markdown/JSON 내보내기 — 대부분 순수 함수라 단위
  테스트가 쉽다.
- **Testing Library**: 문제풀이 화면, 네비게이터, 검증 오류 화면 등 컴포넌트
  단위.
- **Firestore rules**: `@firebase/rules-unit-testing`으로 소유자만 접근되는지
  검증한다(Emulator에서만 실행).
- **Playwright E2E**: Firebase Emulator(auth+firestore) 위에서 돈다. 로그인은
  테스트 전용 경로(GIS mock → userinfo mock → `signInWithCredential`)를 쓴다.
  GIS 연동 모듈을 인터페이스로 감싸고, E2E에서는
  `page.addInitScript`로 `window.google.accounts.oauth2`를 가짜 구현으로
  주입하고 `page.route()`로 Drive/Sheets REST 엔드포인트를 가로채 고정 응답을
  반환한다. 실제 Google 계정 없이 전체 사용자 흐름(로그인 mock → 폴더 선택 →
  Sheet 선택 → 검증 → 풀이 → 제출 → 결과 → 다운로드)을 재현한다.

## 13. 배포

Vercel을 1차 검증 대상으로 하고, README에 다른 정적 호스팅(Cloudflare Pages,
GitHub Pages, 일반 정적 서버) 배포 절차를 함께 문서화한다. 환경변수는
`VITE_GOOGLE_CLIENT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`이고, `VITE_FIREBASE_EMULATOR`는 e2e 전용이다. 필요성이
명확해지기 전까지 추가 환경변수를 만들지 않는다.

배포 전에 Firebase 설정(`scripts/setup-firebase.sh`로 자동화된 부분 + 콘솔 수동
작업)과 Firestore rules 배포가 필요하다.

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
- Firebase Auth + Firestore 도입: 새로고침 로그인 유지, 기기 간 이어 풀기. Drive
  토큰은 메모리 유지, Firestore가 원본, 기존 기록 1회 업로드, E2E는 Emulator
  (2026-11-19 확정, `docs/superpowers/plans/2026-11-19-firestore-sync.md`)
