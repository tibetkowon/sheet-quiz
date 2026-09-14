import type { CSSProperties, ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: CSSProperties["maxWidth"];
}

export function PageContainer({
  children,
  className = "",
  maxWidth,
}: PageContainerProps) {
  return (
    <div
      className={`mx-auto w-full min-w-0 px-4 py-5 sm:px-8 sm:py-7 ${className}`.trim()}
      style={{ maxWidth }}
    >
      {children}
    </div>
  );
}
