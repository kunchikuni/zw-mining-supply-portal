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
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? 'text-chrome-600' : 'text-ink'}`}>
        {value}
      </p>
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}
