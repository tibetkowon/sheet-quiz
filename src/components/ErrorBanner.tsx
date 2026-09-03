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
      className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger bg-surface p-4 text-sm text-danger dark:bg-surface-dark"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-danger px-3 py-1.5 text-xs font-semibold"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
