# 디자인 토큰 & 근거 메모

## 기본값 회피 체크
1. 크림+세리프+테라코타 → 미사용. 배경은 옅은 인디고 틴트(#F7F7FB), 세리프 없음, 포인트는 인디고.
2. 거의 검정+네온 → 미사용. 다크 배경은 딥 그래파이트(#14131F, 순검정 아님), 포인트는 파스텔 라벤더(#8B87F0), 채도 낮음.
3. 헤어라인+radius 0+신문 다단 → 미사용. radius 6/12px로 부드럽게, 좌:본문 우:네비게이터 2단 구조(신문 다단 아님, 기능이 다른 패널 분리).

## 색 — Light
- bg `#F7F7FB` 페이지 배경
- surface `#FFFFFF` 카드/패널
- surface-sunken `#EDEDF5` 네비게이터, 인풋 배경
- border `#D8D8E6`
- text-primary `#1D1B2E`
- text-secondary `#5B5876`
- accent `#3D3AA8` (인디고)
- accent-soft `#E7E5F7`

## 색 — Dark
- bg `#14131F`
- surface `#1C1B2B`
- surface-sunken `#100F19`
- border `#34324A`
- text-primary `#ECEAF7`
- text-secondary `#A6A2C2`
- accent `#8B87F0`
- accent-soft `#2A2750`

## 상태색 (5종, 색+아이콘+테두리 조합 — 색맹 대응)
- 안 봄: 회색(#9C99B3) · 점선 테두리 · 빈 원 아이콘
- 답변완료: 청록(#1F8A5F/dark #4FC98A) · 실선 테두리 · 체크 아이콘
- 보류: 앰버(#B8791C/dark #E0A94A) · 실선 테두리 · 일시정지 아이콘
- 다시 볼 문제: 로즈(#B23A5C/dark #E58BA6) · 실선+모서리 컷 · 북마크 아이콘
- 현재 문제: 인디고 accent · 굵은 링 테두리 · 위치 마커

## 타이포그래피
- 디스플레이: Paperlogy (로고, 화면 타이틀 — 개성 있는 지오메트릭 한글 디스플레이체)
- 본문: Pretendard (문제 본문·UI 전반, 가독성 최우선)
- 데이터/캡션: IBM Plex Mono (문제번호, 타임스탬프, %, 자동저장 상태)

## 레이아웃 컨셉 — 문제풀이 화면
```
┌─ 헤더: 배지(자격증명) · 진행률 바 · 자동저장 상태 · 다크토글 ─┐
├───────────────────────────────┬───────────────────────┤
│ 분류/난이도 배지               │  문제 네비게이터 (그리드)│
│ 상황 설명 (박스)                │  1 2 3 4 5 6 7 8 9 ...  │
│ 문제 본문 + "정답 2개 선택"     │  범례(상태 5종)         │
│ 보기 4~6개 (체크/라디오)         │                         │
├───────────────────────────────┴───────────────────────┤
│ 이전 · 나중에 풀기 · 다시 볼 문제 표시 · 다음            │
└─────────────────────────────────────────────────────────┘
```
본문 폭을 68% 정도로 제한해 줄길이 확보, 네비게이터는 우측 고정 패널로 스크롤 분리.

## 시그니처 요소
해설/결과 영역에 "인덱스 카드" 접힌 모서리(clip-path corner cut) — 종이 카드로 문제를 정리한다는 학습 도구의 정체성을 시각적으로 반복.

## Tailwind theme extension
```js
// tailwind.config.js (extend)
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#F7F7FB', dark: '#14131F' },
        surface: { DEFAULT: '#FFFFFF', dark: '#1C1B2B' },
        sunken: { DEFAULT: '#EDEDF5', dark: '#100F19' },
        border: { DEFAULT: '#D8D8E6', dark: '#34324A' },
        text: { DEFAULT: '#1D1B2E', secondary: '#5B5876', dark: '#ECEAF7', 'dark-secondary': '#A6A2C2' },
        accent: { DEFAULT: '#3D3AA8', soft: '#E7E5F7', dark: '#8B87F0', 'dark-soft': '#2A2750' },
        status: {
          unseen: '#9C99B3',
          answered: '#1F8A5F', 'answered-dark': '#4FC98A',
          held: '#B8791C', 'held-dark': '#E0A94A',
          review: '#B23A5C', 'review-dark': '#E58BA6',
        },
      },
      fontFamily: {
        display: ['Paperlogy', 'Pretendard', 'sans-serif'],
        body: ['Pretendard', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: { DEFAULT: '6px', lg: '12px', sm: '4px' },
      boxShadow: { card: '0 1px 2px rgba(29,27,46,0.06), 0 4px 12px rgba(29,27,46,0.05)' },
    },
  },
};
```

## 재사용 컴포넌트 스펙
- **상태 배지 5종**: 20×20 아이콘칩 + 텍스트 라벨(네비게이터 밖에서는 라벨 노출), 색+테두리스타일+아이콘 3중 코딩.
- **진행률 바**: sunken 트랙(6px) + accent 필, 우측에 IBM Plex Mono로 `12/40` 표기.
- **자동저장 인디케이터**: 저장중(펄스 도트, prefers-reduced-motion에서 정적 도트) · 완료(체크+"저장됨 방금") · 실패(경고+"재시도" 버튼) · 재시도중(회전 없는 단계적 도트 점멸 억제판).
- **필터 chip**: sunken 배경, 선택시 accent-soft 배경 + accent 텍스트 + accent 테두리.
- **통계 카드**: surface 카드, 상단 라벨(secondary 텍스트) + 큰 숫자(display 폰트) + 보조 캡션(mono).
