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
