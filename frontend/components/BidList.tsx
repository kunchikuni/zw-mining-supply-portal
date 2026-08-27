import type { Bid } from '@/lib/types';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';

const STATUS_TONE: Record<Bid['status'], 'neutral' | 'copper' | 'chrome' | 'danger'> = {
  SUBMITTED: 'neutral',
  SHORTLISTED: 'copper',
  ACCEPTED: 'chrome',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

export function BidList({ bids }: { bids: Bid[] }) {
  if (bids.length === 0) {
    return <EmptyState title="No bids yet" description="Verified suppliers in this category can submit a bid." />;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {bids.map((bid) => (
        <li key={bid.id} className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium text-ink">{bid.supplier?.name ?? 'Supplier'}</p>
            <p className="text-sm text-gray-500">
              {bid.currency} {bid.amount}
              {bid.leadTimeDays ? ` · ${bid.leadTimeDays} day lead time` : ''}
            </p>
            {bid.notes && <p className="mt-1 text-sm text-gray-600">{bid.notes}</p>}
          </div>
          <Badge tone={STATUS_TONE[bid.status]}>{bid.status.toLowerCase()}</Badge>
        </li>
      ))}
    </ul>
  );
}
