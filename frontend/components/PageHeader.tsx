import { ReactNode } from 'react';

// The standard top of a page: gold-ruled eyebrow, serif title, a short lead,
// and optional actions on the right. Keeps every page's opening consistent.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-gray-200/70 pb-8">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className={`page-title ${eyebrow ? 'mt-4' : ''}`}>{title}</h1>
        {description && <p className="page-lead">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
