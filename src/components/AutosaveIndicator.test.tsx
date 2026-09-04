import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AutosaveIndicator } from "./AutosaveIndicator";

describe("AutosaveIndicator", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<AutosaveIndicator status="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 저장 중… while saving", () => {
    render(<AutosaveIndicator status="saving" />);
    expect(screen.getByText("저장 중…")).toBeInTheDocument();
  });

  it("shows 저장됨 once saved", () => {
    render(<AutosaveIndicator status="saved" />);
    expect(screen.getByText("저장됨")).toBeInTheDocument();
  });

  it("shows 저장 실패 on error", () => {
    render(<AutosaveIndicator status="error" />);
    expect(screen.getByText("저장 실패")).toBeInTheDocument();
  });
});
