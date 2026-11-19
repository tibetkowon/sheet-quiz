---
name: warn-tailwind-color-utilities
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/.*\.tsx$
  - field: new_text
    operator: regex_match
    pattern: \b(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|pink|rose|white|black)(-\d{2,3})?\b
---

Tailwind는 레이아웃에만 씁니다. 색은 Astryx 토큰 `var(--color-...)`을 쓰세요. (CLAUDE.md → Astryx)
