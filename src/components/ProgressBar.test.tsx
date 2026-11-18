import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("reports the percent prop as the progress value", () => {
    render(<ProgressBar percent={40} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  });

  it("clamps out-of-range percentages", () => {
    render(<ProgressBar percent={150} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("falls back to 0% for non-finite input", () => {
    render(<ProgressBar percent={NaN} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("exposes progressbar ARIA attributes for screen readers", () => {
    render(<ProgressBar percent={40} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("sets aria-label when a label is provided", () => {
    render(<ProgressBar percent={40} label="분류: 컴퓨팅" />);
    expect(screen.getByRole("progressbar", { name: "분류: 컴퓨팅" })).toBeInTheDocument();
  });
});
