/** @type {import('tailwindcss').Config} */
export default {
  // preflight는 @layer 밖이라 Astryx reset/컴포넌트 스타일을 덮어쓴다.
  corePlugins: { preflight: false },
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 색·다크 모드·폰트는 Astryx 토큰(src/index.css)이 맡고, 여기에는 레이아웃용 값만 둔다.
      fontFamily: {
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      borderRadius: { DEFAULT: "6px", lg: "12px", sm: "4px" },
    },
  },
  plugins: [],
};
