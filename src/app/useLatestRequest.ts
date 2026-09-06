import { useCallback, useLayoutEffect, useMemo } from "react";

// 범위가 바뀌거나 언마운트되면 이전 요청의 성공/실패 처리를 모두 무효화합니다.
export function useLatestRequest(scope: string | null | undefined) {
  const requests = useMemo(() => ({ scope, generation: 0 }), [scope]);

  useLayoutEffect(() => () => {
    requests.generation += 1;
  }, [requests]);

  return useCallback(() => {
    const generation = ++requests.generation;
    return () => generation === requests.generation;
  }, [requests]);
}
