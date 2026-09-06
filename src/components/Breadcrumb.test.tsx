import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumb } from "./Breadcrumb";

describe("Breadcrumb", () => {
  it("상위 경로만 이동할 수 있고 현재 경로는 텍스트로 표시합니다", async () => {
    const onParent = vi.fn();
    const onCurrent = vi.fn();
    render(<Breadcrumb items={[
      { label: "루트" },
      { label: "상위 폴더", onClick: onParent },
      { label: "현재 폴더", onClick: onCurrent },
    ]} />);
    expect(screen.getByRole("navigation", { name: "현재 위치" })).toHaveTextContent("현재 폴더");
    expect(screen.queryByRole("button", { name: "루트" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "현재 폴더" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "상위 폴더" }));
    expect(onParent).toHaveBeenCalledTimes(1);
    expect(onCurrent).not.toHaveBeenCalled();
  });

  it("경로가 비어 있으면 이동 버튼이나 구분자를 표시하지 않습니다", () => {
    render(<Breadcrumb items={[]} />);
    expect(screen.getByRole("navigation", { name: "현재 위치" })).toBeEmptyDOMElement();
  });
});
