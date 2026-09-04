import type { AutosaveStatus } from "../quiz/QuizContext";

const LABELS: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패",
};

const DOT_CLASS: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "bg-accent motion-safe:animate-pulse dark:bg-accent-dark",
  saved: "bg-status-answered dark:bg-status-answered-dark",
  error: "bg-danger",
};

export function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;
  return (
    <span className="flex flex-shrink-0 items-center gap-1.5 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
