export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-4 flex min-w-0 flex-col items-start justify-between gap-3 rounded-lg border border-danger bg-surface p-4 text-sm text-danger sm:flex-row sm:items-center dark:bg-surface-dark"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 shrink-0 rounded border border-danger px-3 py-2.5 text-xs font-semibold"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
