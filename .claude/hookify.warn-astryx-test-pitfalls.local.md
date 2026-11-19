---
name: warn-astryx-test-pitfalls
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.test\.tsx?$
  - field: new_text
    operator: regex_match
    pattern: toBeDisabled\(|getByRole\(\s*["']alert["']
---

Astryx 테스트 함정을 확인하세요.
- `Button`의 `isDisabled`는 `aria-disabled`입니다. `toBeDisabled()` 대신 `aria-disabled`를 확인하세요.
- Astryx는 보이지 않는 `role="alert"` 영역을 만듭니다. `getByRole("alert")` 대신 메시지 텍스트의 `closest('[role="alert"]')`로 확인하세요.
네이티브 요소라 해당 없으면 무시해도 됩니다. (CLAUDE.md → Astryx)
