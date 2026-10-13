import { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  helpText,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  helpText?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p
        className={`mt-3 font-display text-4xl font-semibold leading-none lining-nums tabular-nums ${
          accent ? 'text-chrome-600' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {helpText && <p className="mt-2 text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}
