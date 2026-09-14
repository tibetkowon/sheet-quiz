export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="현재 위치"
      className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[13px] text-text-secondary dark:text-text-dark-secondary"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex min-w-0 max-w-full items-center gap-1.5">
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="min-w-0 truncate cursor-pointer underline-offset-2 hover:underline"
                title={item.label}
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`min-w-0 truncate ${isLast ? "font-semibold text-text dark:text-text-dark" : ""}`}
                title={item.label}
              >
                {item.label}
              </span>
            )}
            {!isLast && <span className="flex-shrink-0" aria-hidden="true">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
