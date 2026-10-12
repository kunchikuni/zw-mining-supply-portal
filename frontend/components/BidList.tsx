import type { Bid } from '@/lib/types';
import { Badge } from './Badge';
import { BidReviewActions } from './BidReviewActions';
import { EmptyState } from './EmptyState';

const STATUS_TONE: Record<Bid['status'], 'neutral' | 'copper' | 'chrome' | 'danger'> = {
  SUBMITTED: 'neutral',
  SHORTLISTED: 'copper',
  ACCEPTED: 'chrome',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

// `reviewable` is true only for the posting mine on an RFQ that isn't
// cancelled; the server enforces the same rules, this just avoids offering
// buttons that would be refused.
export function BidList({
  bids,
  reviewable = false,
  onChanged,
}: {
  bids: Bid[];
  reviewable?: boolean;
  onChanged?: () => void;
}) {
  if (bids.length === 0) {
    return <EmptyState title="No bids yet" description="Verified suppliers in this category can submit a bid." />;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {bids.map((bid) => (
        <li key={bid.id} className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">{bid.supplier?.name ?? 'Supplier'}</p>
              <p className="text-sm text-gray-500">
                {bid.currency} {bid.amount}
                {bid.leadTimeDays ? ` · ${bid.leadTimeDays} day lead time` : ''}
              </p>
              {bid.notes && <p className="mt-1 text-sm text-gray-600">{bid.notes}</p>}
            </div>
            <Badge tone={STATUS_TONE[bid.status]}>{bid.status.toLowerCase()}</Badge>
          </div>
          {reviewable && onChanged && <BidReviewActions bid={bid} onChanged={onChanged} />}
        </li>
      ))}
    </ul>
  );
}
