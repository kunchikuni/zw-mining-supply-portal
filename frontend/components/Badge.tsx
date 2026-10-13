import { ReactNode } from 'react';

type Tone = 'neutral' | 'copper' | 'chrome' | 'danger';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-gray-100/80 text-gray-700 ring-gray-200',
  copper: 'bg-copper-50 text-copper-800 ring-copper-200/70',
  chrome: 'bg-chrome-50 text-chrome-800 ring-chrome-100',
  danger: 'bg-red-50 text-red-800 ring-red-200/70',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
