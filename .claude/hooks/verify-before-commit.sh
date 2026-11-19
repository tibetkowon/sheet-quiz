#!/usr/bin/env bash
# PreToolUse(Bash) hook: git commit일 때만 test/typecheck/lint/build를 돌린다.
# settings.json의 `if` 조건은 $(...)나 반복문이 든 명령에도 걸려서 명령 문자열을 직접 확인한다.
command=$(jq -r '.tool_input.command // ""')

if ! printf '%s' "$command" | grep -Eq '(^|[;&|][[:space:]]*)git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 2
{ pnpm test && pnpm typecheck && pnpm lint && pnpm build; } >&2 || {
  echo '커밋 차단: test/typecheck/lint/build 중 실패한 항목을 고친 뒤 다시 커밋하세요.' >&2
  exit 2
}
