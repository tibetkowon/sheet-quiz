export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sunken dark:bg-sunken-dark"
    >
      <div className="h-full rounded-full bg-accent dark:bg-accent-dark" style={{ width: `${clamped}%` }} />
    </div>
  );
}
