import type { Prisma } from '@prisma/client';

// Sealed bids: who may see which bids on an RFQ. Both GET /rfqs/:id and
// GET /bids?rfqId= go through this, so the two can't drift apart.
//
//   - the mine that posted the RFQ, or a PLATFORM_ADMIN: every bid
//   - any other signed-in company: only its own bids on that RFQ
//   - anonymous: none (GET /rfqs/:id still reports how many there are)
//
// Returns the filter to apply, or null when the requester may see no bids at
// all — callers should skip the query entirely rather than run an empty one.
export function visibleBidsWhere(
  rfq: { id: string; mineCompanyId: string },
  requester: { companyId: string; role: string } | null | undefined,
): Prisma.BidWhereInput | null {
  if (!requester) return null;
  if (requester.companyId === rfq.mineCompanyId || requester.role === 'PLATFORM_ADMIN') {
    return { rfqId: rfq.id };
  }
  return { rfqId: rfq.id, supplierCompanyId: requester.companyId };
}
