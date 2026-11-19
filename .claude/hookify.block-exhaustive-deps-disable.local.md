---
name: block-exhaustive-deps-disable
enabled: true
event: file
action: block
conditions:
  - field: new_text
    operator: regex_match
    pattern: eslint-disable(-next-line|-line)?\s+react-hooks/exhaustive-deps
---

`react-hooks/exhaustive-deps`를 주석으로 끄지 마세요.
`eslint-plugin-react-hooks@4.6.2`가 ESLint 9에서 이 주석을 만나면 crash합니다.
dependency array를 실제로 exhaustive하게 고치세요. (CLAUDE.md → 알려진 프로젝트 특이사항 → ESLint)
