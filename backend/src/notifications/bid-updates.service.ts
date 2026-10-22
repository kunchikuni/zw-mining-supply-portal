import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BidStatus, Prisma } from '@prisma/client';
import { BidDecision, buildBidDecisionEmail, buildRfqCancelledEmail } from './bid-update-emails';
import { appUrlFrom } from './email-layout';

const RFQ_FIELDS = {
  id: true,
  title: true,
  deadline: true,
  mine: { select: { name: true } },
  category: { select: { name: true } },
} as const;

// Every active user at the bidding supplier: the bid is the company's, and it
// doesn't record which of them submitted it.
const SUPPLIER_FIELDS = {
  name: true,
  users: { where: { disabledAt: null }, select: { id: true, email: true, fullName: true } },
} as const;

const BID_FIELDS = {
  id: true,
  amount: true,
  currency: true,
  leadTimeDays: true,
  rfq: { select: RFQ_FIELDS },
  supplier: { select: SUPPLIER_FIELDS },
} as const;

type LoadedBid = Prisma.BidGetPayload<{ select: typeof BID_FIELDS }>;
type Recipient = LoadedBid['supplier']['users'][number];

// Queues the emails that tell a supplier what happened to its bid: the mine
// shortlisted, accepted or turned it down, or cancelled the RFQ. Called inside
// the transaction that makes the change, so a change that rolls back emails
// nobody; EmailOutboxService sends them. These go out whatever the user's
// new-RFQ alert setting: they're about the company's own bid.
@Injectable()
export class BidUpdatesService {
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    this.appUrl = appUrlFrom(config);
  }

  async enqueueDecision(tx: Prisma.TransactionClient, bidId: string, decision: BidDecision) {
    const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId }, select: BID_FIELDS });
    return this.queue(tx, [bid], (b, user) => ({
      key: `bid-${decision.toLowerCase()}:${b.id}:${user.id}`,
      ...buildBidDecisionEmail(decision, b.rfq, b, this.recipient(b, user), this.appUrl),
    }));
  }

  // Only bids still in play hear about it: a withdrawn or rejected bidder has
  // nothing riding on the RFQ (and an RFQ with an accepted bid is AWARDED,
  // which can't be cancelled).
  async enqueueRfqCancelled(tx: Prisma.TransactionClient, rfqId: string) {
    const bids = await tx.bid.findMany({
      where: { rfqId, status: { in: [BidStatus.SUBMITTED, BidStatus.SHORTLISTED] } },
      select: BID_FIELDS,
    });
    return this.queue(tx, bids, (b, user) => ({
      key: `rfq-cancelled:${rfqId}:${user.id}`,
      ...buildRfqCancelledEmail(b.rfq, b, this.recipient(b, user), this.appUrl),
    }));
  }

  private recipient(bid: LoadedBid, user: Recipient) {
    return { fullName: user.fullName, company: { name: bid.supplier.name } };
  }

  // One email per active user at each bid's supplier, keyed so the same
  // notification is never queued twice. Returns how many were queued.
  private async queue(
    tx: Prisma.TransactionClient,
    bids: LoadedBid[],
    build: (bid: LoadedBid, user: Recipient) => { key: string; subject: string; text: string; html: string },
  ) {
    const data = bids.flatMap((bid) => bid.supplier.users.map((user) => ({ to: user.email, ...build(bid, user) })));
    if (data.length === 0) return 0;
    const { count } = await tx.emailOutbox.createMany({ data, skipDuplicates: true });
    return count;
  }
}
