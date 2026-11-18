import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { AutosaveStatus } from "../quiz/QuizContext";

const LABELS: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패",
};

const DOT_VARIANT = {
  saving: "accent",
  saved: "success",
  error: "error",
} as const;

export function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;
  return (
    <span className="flex flex-shrink-0 items-center gap-1.5">
      <span aria-hidden="true" className="flex">
        <StatusDot variant={DOT_VARIANT[status]} label={LABELS[status]} isPulsing={status === "saving"} />
      </span>
      <Text type="supporting">{LABELS[status]}</Text>
    </span>
  );
}
