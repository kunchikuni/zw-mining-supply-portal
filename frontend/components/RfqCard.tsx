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
    <Link
      href={`/rfqs/${rfq.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-ink">{rfq.title}</h3>
        <RfqStatusBadge status={rfq.status} biddingOpen={rfq.biddingOpen} />
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {rfq.mine?.name ?? 'Mining company'}
        {rfq.category ? ` · ${rfq.category.name}` : ''}
        {rfq.province ? ` · ${rfq.province}` : ''}
      </p>
      {rfq.biddingOpen ? (
        <p className="mt-3 text-xs font-medium text-copper-600">{formatDeadline(rfq.deadline)}</p>
      ) : (
        <p className="mt-3 text-xs font-medium text-gray-500">Deadline passed</p>
      )}
    </Link>
  );
}
