import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READ_TIMEOUT_MS, timeoutSignal, withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("끝나지 않는 promise는 제한 시간 뒤 한국어 오류로 reject합니다", async () => {
    const pending = withTimeout(new Promise<never>(() => {}));
    const assertion = expect(pending).rejects.toThrow("응답이 없습니다");

    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);

    await assertion;
  });

  it("제한 시간 전에는 reject하지 않습니다", async () => {
    const onSettled = vi.fn();
    withTimeout(new Promise<never>(() => {})).catch(onSettled);

    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);

    expect(onSettled).not.toHaveBeenCalled();
  });

  it("제때 끝나면 값을 그대로 돌려주고 타이머를 정리합니다", async () => {
    await expect(withTimeout(Promise.resolve("값"), 1000)).resolves.toBe("값");

    expect(vi.getTimerCount()).toBe(0);
  });

  it("원래 promise의 오류도 그대로 전달하고 타이머를 정리합니다", async () => {
    const error = new Error("연결 실패");

    await expect(withTimeout(Promise.reject(error), 1000)).rejects.toBe(error);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("timeoutSignal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("AbortSignal.timeout이 없는 브라우저(iOS 15 이하)에서도 제한 시간 뒤 abort됩니다", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      throw new TypeError("AbortSignal.timeout is not a function");
    });
    const signal = timeoutSignal();

    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    expect(signal.aborted).toBe(true);
  });
});
