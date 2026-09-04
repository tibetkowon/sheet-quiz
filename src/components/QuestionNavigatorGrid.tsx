import type { NavigatorItem } from "../quiz/navigation";

type DisplayStatus = "unseen" | "answered" | "held" | "flagged";

const STATUS_STYLES: Record<DisplayStatus, { border: string; text: string; glyph: string; label: string }> = {
  unseen: {
    border: "border-2 border-dashed border-status-unseen",
    text: "text-status-unseen",
    glyph: "○",
    label: "아직 안 봄",
  },
  answered: {
    border: "border-2 border-status-answered dark:border-status-answered-dark",
    text: "text-status-answered dark:text-status-answered-dark",
    glyph: "✓",
    label: "답변 완료",
  },
  held: {
    border: "border-2 border-status-held dark:border-status-held-dark",
    text: "text-status-held dark:text-status-held-dark",
    glyph: "‖",
    label: "보류",
  },
  flagged: {
    border: "border-2 border-status-review dark:border-status-review-dark",
    text: "text-status-review dark:text-status-review-dark",
    glyph: "⚑",
    label: "다시 볼 문제",
  },
};

function resolveDisplayStatus(status: NavigatorItem["status"], reviewMarked: boolean): DisplayStatus {
  if (reviewMarked) return "flagged";
  if (status === "SKIPPED") return "held";
  if (status === "ANSWERED") return "answered";
  return "unseen";
}

export function QuestionNavigatorGrid({
  items,
  onJump,
}: {
  items: NavigatorItem[];
  onJump: (index: number) => void;
}) {
  return (
    <div className="sticky top-5 self-start rounded-lg border border-border bg-surface p-4.5 dark:border-border-dark dark:bg-surface-dark">
      <div className="mb-3 text-xs font-semibold text-text-secondary dark:text-text-dark-secondary">
        문제 네비게이터
      </div>
      <div className="mb-4 grid grid-cols-5 gap-2">
        {items.map((item) => {
          const display = STATUS_STYLES[resolveDisplayStatus(item.status, item.reviewMarked)];
          return (
            <button
              key={item.questionId}
              type="button"
              onClick={() => onJump(item.index)}
              aria-current={item.isCurrent ? "true" : undefined}
              aria-label={`문제 ${item.questionNumber}, ${display.label}`}
              className={`relative aspect-square rounded-lg font-mono text-[13px] font-semibold ${display.border} ${display.text} ${
                item.isCurrent ? "ring-2 ring-accent ring-offset-1 dark:ring-accent-dark" : ""
              }`}
            >
              {item.questionNumber}
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current bg-surface text-[8px] dark:bg-surface-dark">
                {display.glyph}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-[11.5px] text-text-secondary dark:border-border-dark dark:text-text-dark-secondary">
        <div>○ 점선 = 아직 안 봄</div>
        <div>✓ 초록 = 답변 완료</div>
        <div>‖ 황토 = 보류</div>
        <div>⚑ 로즈 = 다시 볼 문제</div>
        <div>인디고 테두리 = 현재 문제</div>
      </div>
    </div>
  );
}
