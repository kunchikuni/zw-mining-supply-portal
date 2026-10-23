import { BidStatus } from '@prisma/client';

// A supplier has at most one live bid per RFQ. Bidding again while it's live
// is a revision: the old row is kept, marked SUPERSEDED, and the new row
// points back to it through revisionOfId (see BidsService.create). The
// database enforces it with a partial unique index over these same statuses
// (the one_live_bid_per_supplier migration): change both together.
export const LIVE_BID_STATUSES: BidStatus[] = [BidStatus.SUBMITTED, BidStatus.SHORTLISTED];

type Versioned = { id: string; status: string; revisionOfId?: string | null };

// Turns a list of bid rows into one entry per offer: each current
// (non-superseded) bid, in the order given, with the versions it replaced
// under `history`, newest first. Every endpoint that lists bids goes through
// this, so none of them shows a replaced price as if it were a live offer.
export function withRevisionHistory<T extends Versioned>(bids: T[]): Array<T & { history: T[] }> {
  const byId = new Map(bids.map((b) => [b.id, b]));
  return bids
    .filter((b) => b.status !== BidStatus.SUPERSEDED)
    .map((b) => {
      const history: T[] = [];
      let previous = b.revisionOfId ? byId.get(b.revisionOfId) : undefined;
      // revisionOfId is unique and always points at an older bid, so this is
      // a simple chain; the length check only guards against bad data.
      while (previous && history.length < bids.length) {
        history.push(previous);
        previous = previous.revisionOfId ? byId.get(previous.revisionOfId) : undefined;
      }
      return { ...b, history };
    });
}
