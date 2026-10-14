import type { Bid } from '@/lib/types';
import { BidHistory } from './BidHistory';
import { BidReviewActions } from './BidReviewActions';
import { BidStatusBadge } from './BidStatusBadge';
import { EmptyState } from './EmptyState';
import { formatMoney } from '@/lib/format';

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
    <ul className="card divide-y divide-gray-100">
      {bids.map((bid) => (
        <li key={bid.id} className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-ink">{bid.supplier?.name ?? 'Supplier'}</p>
              <p className="mt-1 text-sm text-gray-500">
                <span className="font-semibold text-ink">
                  {formatMoney(bid.amount, bid.currency)}
                </span>
                {bid.leadTimeDays ? ` · ${bid.leadTimeDays} day lead time` : ''}
              </p>
              {bid.notes && <p className="mt-2 text-sm leading-relaxed text-gray-600">{bid.notes}</p>}
              <BidHistory history={bid.history} />
            </div>
            <BidStatusBadge status={bid.status} />
          </div>
          {reviewable && onChanged && <BidReviewActions bid={bid} onChanged={onChanged} />}
        </li>
      ))}
    </ul>
  );
}
