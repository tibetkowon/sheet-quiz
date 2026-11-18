import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="mb-4 min-w-0">
      <Banner
        status="error"
        title={message}
        collapsible={false}
        endContent={onRetry && <Button label="다시 시도" size="sm" onClick={onRetry} />}
      />
    </div>
  );
}
