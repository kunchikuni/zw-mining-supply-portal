import { ReactNode } from 'react';

type Tone = 'neutral' | 'copper' | 'chrome' | 'danger';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  copper: 'bg-copper-50 text-copper-800',
  chrome: 'bg-chrome-50 text-chrome-800',
  danger: 'bg-red-50 text-red-700',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
