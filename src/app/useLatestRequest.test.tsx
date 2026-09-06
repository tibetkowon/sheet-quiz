import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLatestRequest } from "./useLatestRequest";

describe("useLatestRequest", () => {
  it("재시도, 범위 변경, 언마운트 시 이전 요청을 무효화합니다", () => {
    const { result, rerender, unmount } = renderHook(
      ({ scope }) => useLatestRequest(scope),
      { initialProps: { scope: "old" }, wrapper: StrictMode },
    );
    const first = result.current();
    const second = result.current();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
    act(() => rerender({ scope: "new" }));
    expect(second()).toBe(false);
    const third = result.current();
    expect(third()).toBe(true);
    unmount();
    expect(third()).toBe(false);
  });
});
