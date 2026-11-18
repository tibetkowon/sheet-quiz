import { ProgressBar as AstryxProgressBar } from "@astryxdesign/core/ProgressBar";

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div className="w-full max-w-xs">
      <AstryxProgressBar label={label ?? "진행률"} value={Math.round(clamped)} isLabelHidden />
    </div>
  );
}
