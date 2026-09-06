import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBanner } from "./ErrorBanner";

describe("ErrorBanner", () => {
  it("재시도 동작이 없으면 오류 메시지만 알립니다", () => {
    render(<ErrorBanner message="불러오지 못했습니다." />);
    expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했습니다.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("재시도 버튼은 전달된 동작을 한 번 호출합니다", async () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="실패" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
