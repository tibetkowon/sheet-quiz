export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="현재 위치"
      className="mb-4 flex items-center gap-1.5 font-mono text-[13px] text-text-secondary dark:text-text-dark-secondary"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="cursor-pointer underline-offset-2 hover:underline"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={isLast ? "font-semibold text-text dark:text-text-dark" : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && <span aria-hidden="true">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
