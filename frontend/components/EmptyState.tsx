import { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white/50 px-6 py-14 text-center">
      <p className="font-display text-2xl font-semibold text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">{description}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
