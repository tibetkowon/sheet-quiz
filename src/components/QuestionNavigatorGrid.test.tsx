import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionNavigatorGrid } from "./QuestionNavigatorGrid";
import type { NavigatorItem } from "../quiz/navigation";

const items: NavigatorItem[] = [
  { index: 0, questionId: "q1", questionNumber: 1, status: "ANSWERED", reviewMarked: false, isCurrent: false },
  { index: 1, questionId: "q2", questionNumber: 2, status: "SKIPPED", reviewMarked: false, isCurrent: true },
  { index: 2, questionId: "q3", questionNumber: 3, status: "UNSEEN", reviewMarked: true, isCurrent: false },
];

describe("QuestionNavigatorGrid", () => {

  it("다시 볼 표시를 해제하면 원래 상태와 현재 위치를 갱신합니다", () => {
    const { rerender } = render(<QuestionNavigatorGrid items={items} onJump={() => {}} />);
    rerender(<QuestionNavigatorGrid items={items.map((item) => ({
      ...item, reviewMarked: false, isCurrent: item.index === 2,
    }))} onJump={() => {}} />);
    expect(screen.getByLabelText("문제 3, 아직 안 봄")).toHaveAttribute("aria-current", "true");
    expect(screen.getByLabelText("문제 2, 보류")).not.toHaveAttribute("aria-current");
    expect(screen.queryByLabelText("문제 3, 다시 볼 문제")).not.toBeInTheDocument();
  });

  it("문제가 없으면 이동 버튼을 표시하지 않습니다", () => {
    render(<QuestionNavigatorGrid items={[]} onJump={() => {}} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renders one button per question labelled with its status", () => {
    render(<QuestionNavigatorGrid items={items} onJump={() => {}} />);
    expect(screen.getByLabelText("문제 1, 답변 완료")).toBeInTheDocument();
    expect(screen.getByLabelText("문제 2, 보류")).toBeInTheDocument();
    expect(screen.getByLabelText("문제 3, 다시 볼 문제")).toBeInTheDocument();
  });

  it("calls onJump with the clicked item's index", async () => {
    const onJump = vi.fn();
    render(<QuestionNavigatorGrid items={items} onJump={onJump} />);
    await userEvent.click(screen.getByLabelText("문제 1, 답변 완료"));
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it("marks the current question for assistive tech", () => {
    render(<QuestionNavigatorGrid items={items} onJump={() => {}} />);
    expect(screen.getByLabelText("문제 2, 보류")).toHaveAttribute("aria-current", "true");
  });
});
