import type { Bid } from '@/lib/types';
import { BidList } from './BidList';

// What everyone except the posting mine sees in place of the bid list: how
// many bids there are, and — for a supplier that bid — its own bid(s). The
// server only ever sends this viewer their own bids, so `ownBids` is exactly
// what came back.
export function SealedBidSummary({
  bidCount,
  ownBids,
  mineName,
}: {
  bidCount: number;
  ownBids: Bid[];
  mineName?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p className="font-medium text-ink">
          {bidCount === 0 ? 'No bids yet' : `${bidCount} bid${bidCount === 1 ? '' : 's'} submitted`}
        </p>
        <p className="mt-1">
          Bids are sealed: only {mineName ?? 'the mine that posted this RFQ'} can see who bid and for
          how much.
        </p>
      </div>
      {ownBids.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">
            Your bid{ownBids.length === 1 ? '' : 's'}
          </h3>
          <BidList bids={ownBids} />
        </div>
      )}
    </div>
  );
}
