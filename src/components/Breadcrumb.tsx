import { Breadcrumbs, BreadcrumbItem as AstryxBreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div className="mb-4 min-w-0">
      <Breadcrumbs label="현재 위치">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <AstryxBreadcrumbItem
              key={`${item.label}-${index}`}
              onClick={isLast ? undefined : item.onClick}
            >
              {item.label}
            </AstryxBreadcrumbItem>
          );
        })}
      </Breadcrumbs>
    </div>
  );
}
