---
name: warn-indexeddb-delete-in-tests
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.test\.tsx?$
  - field: new_text
    operator: contains
    pattern: deleteDatabase
---

`getDb()`가 connection을 module scope에서 cache하므로 `indexedDB.deleteDatabase`로는 테스트가 격리되지 않습니다.
`const db = await getDb(); await db.clear("<storeName>");` 패턴을 쓰세요. (CLAUDE.md → IndexedDB 테스트 격리)
