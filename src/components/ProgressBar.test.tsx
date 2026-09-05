import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders a fill width matching the percent prop", () => {
    const { container } = render(<ProgressBar percent={40} />);
    const fill = container.querySelector(".bg-accent") as HTMLElement;
    expect(fill.style.width).toBe("40%");
  });

  it("clamps out-of-range percentages", () => {
    const { container } = render(<ProgressBar percent={150} />);
    const fill = container.querySelector(".bg-accent") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("falls back to 0% for non-finite input", () => {
    const { container } = render(<ProgressBar percent={NaN} />);
    const fill = container.querySelector(".bg-accent") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("exposes progressbar ARIA attributes for screen readers", () => {
    render(<ProgressBar percent={40} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });
});
