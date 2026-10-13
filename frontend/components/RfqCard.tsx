import Link from 'next/link';
import type { Rfq } from '@/lib/types';
import { RfqStatusBadge } from './RfqStatusBadge';

function formatDeadline(iso: string) {
  const date = new Date(iso);
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return 'Deadline passed';
  if (daysLeft === 0) return 'Closes today';
  if (daysLeft === 1) return 'Closes tomorrow';
  return `Closes in ${daysLeft} days`;
}

export function RfqCard({ rfq }: { rfq: Rfq }) {
  return (
    <Link href={`/rfqs/${rfq.id}`} className="card-link flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="card-title">{rfq.title}</h3>
        <RfqStatusBadge status={rfq.status} biddingOpen={rfq.biddingOpen} />
      </div>
      <p className="mt-1.5 text-sm text-gray-500">
        {rfq.mine?.name ?? 'Mining company'}
        {rfq.category ? ` · ${rfq.category.name}` : ''}
        {rfq.province ? ` · ${rfq.province}` : ''}
      </p>
      <div className="mt-auto pt-6">
        <p
          className={`border-t border-gray-100 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] ${
            rfq.biddingOpen ? 'text-copper-600' : 'text-gray-400'
          }`}
        >
          {rfq.biddingOpen ? formatDeadline(rfq.deadline) : 'Deadline passed'}
        </p>
      </div>
    </Link>
  );
}
