import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>정상 화면</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상 화면")).toBeInTheDocument();
  });

  it("renders a fallback screen when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("문제가 발생했어요")).toBeInTheDocument();
  });

  it("navigates to the start screen when the reset button is clicked", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    });
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작 화면으로 돌아가기" }));
    expect(assignSpy).toHaveBeenCalledWith("/");
  });
});
