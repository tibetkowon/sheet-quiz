import type { NavigatorItem } from "../quiz/navigation";

type DisplayStatus = "unseen" | "answered" | "held" | "flagged";

const STATUS_STYLES: Record<DisplayStatus, { border: string; text: string; glyph: string; label: string }> = {
  unseen: {
    border: "border-2 border-dashed border-[var(--color-border-emphasized)]",
    text: "text-[var(--color-text-secondary)]",
    glyph: "○",
    label: "아직 안 봄",
  },
  answered: {
    border: "border-2 border-[var(--color-border-success)]",
    text: "text-[var(--color-text-success)]",
    glyph: "✓",
    label: "답변 완료",
  },
  held: {
    border: "border-2 border-[var(--color-border-warning)]",
    text: "text-[var(--color-text-warning)]",
    glyph: "‖",
    label: "보류",
  },
  flagged: {
    border: "border-2 border-[var(--color-border-error)]",
    text: "text-[var(--color-text-error)]",
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
    <div className="lg:sticky lg:top-5 w-full min-w-0 self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-background-surface)] p-4">
      <div className="mb-3 text-xs font-semibold text-[var(--color-text-secondary)]">
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
              className={`relative aspect-square min-h-11 min-w-11 rounded-lg font-mono text-[13px] font-semibold ${display.border} ${display.text} ${
                item.isCurrent ? "ring-2 ring-[color:var(--color-text-accent)] ring-offset-1" : ""
              }`}
            >
              {item.questionNumber}
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current bg-[var(--color-background-surface)] text-[8px]">
                {display.glyph}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3 text-[11.5px] text-[var(--color-text-secondary)]">
        <div>○ 점선 = 아직 안 봄</div>
        <div>✓ 초록 = 답변 완료</div>
        <div>‖ 노랑 = 보류</div>
        <div>⚑ 빨강 = 다시 볼 문제</div>
        <div>강조 링 = 현재 문제</div>
      </div>
    </div>
  );
}
