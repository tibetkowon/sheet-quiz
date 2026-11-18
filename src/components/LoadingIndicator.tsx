import { Spinner } from "@astryxdesign/core/Spinner";

export function LoadingIndicator() {
  return (
    <div className="flex justify-center py-10">
      <Spinner label="불러오는 중…" />
    </div>
  );
}
