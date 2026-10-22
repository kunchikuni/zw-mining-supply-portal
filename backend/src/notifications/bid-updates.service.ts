import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BidStatus, Prisma } from '@prisma/client';
import {
  BidDecision,
  buildBidDecisionEmail,
  buildBidWithdrawnEmail,
  buildRfqCancelledEmail,
  buildRfqClosedEarlyEmail,
} from './bid-update-emails';
import { appUrlFrom } from './email-layout';

const RFQ_FIELDS = {
  id: true,
  title: true,
  deadline: true,
  mine: { select: { name: true } },
  category: { select: { name: true } },
} as const;

// Every active user at the company: a bid (or RFQ) is the company's, and it
// doesn't record which of them submitted it.
const ACTIVE_USERS = { where: { disabledAt: null }, select: { id: true, email: true, fullName: true } } as const;

const SUPPLIER_FIELDS = { name: true, users: ACTIVE_USERS } as const;

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

// Queues the emails about a bid's fate: to the supplier when the mine
// shortlists, accepts or turns it down, closes the RFQ early or cancels it;
// to the mine when the supplier withdraws. Called inside the transaction that
// makes the change, so a change that rolls back emails nobody;
// EmailOutboxService sends them. These go out whatever the user's new-RFQ
// alert setting: they're about the company's own bid or RFQ.
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

  async enqueueRfqCancelled(tx: Prisma.TransactionClient, rfqId: string) {
    const bids = await this.liveBids(tx, rfqId);
    return this.queue(tx, bids, (b, user) => ({
      key: `rfq-cancelled:${rfqId}:${user.id}`,
      ...buildRfqCancelledEmail(b.rfq, b, this.recipient(b, user), this.appUrl),
    }));
  }

  // The mine stopped taking bids before the deadline. Bidders who planned to
  // revise need to know; the caller only calls this for an early close.
  async enqueueRfqClosedEarly(tx: Prisma.TransactionClient, rfqId: string) {
    const bids = await this.liveBids(tx, rfqId);
    return this.queue(tx, bids, (b, user) => ({
      key: `rfq-closed-early:${rfqId}:${user.id}`,
      ...buildRfqClosedEarlyEmail(b.rfq, b, this.recipient(b, user), this.appUrl),
    }));
  }

  // The other direction: a supplier withdrew, so the mine that's reviewing
  // the bids hears about it — every active user at the mine.
  async enqueueWithdrawal(tx: Prisma.TransactionClient, bidId: string) {
    const bid = await tx.bid.findUniqueOrThrow({
      where: { id: bidId },
      select: {
        amount: true,
        currency: true,
        supplier: { select: { name: true } },
        rfq: { select: { ...RFQ_FIELDS, mine: { select: { name: true, users: ACTIVE_USERS } } } },
      },
    });
    const mine = bid.rfq.mine;
    if (mine.users.length === 0) return 0;
    const { count } = await tx.emailOutbox.createMany({
      data: mine.users.map((user) => ({
        key: `bid-withdrawn:${bidId}:${user.id}`,
        to: user.email,
        ...buildBidWithdrawnEmail(bid.rfq, bid, bid.supplier.name, { fullName: user.fullName, company: { name: mine.name } }, this.appUrl),
      })),
      skipDuplicates: true,
    });
    return count;
  }

  // Only bids still in play hear about a cancel or an early close: a withdrawn
  // or rejected bidder has nothing riding on the RFQ (and an RFQ with an
  // accepted bid is AWARDED, which can be neither cancelled nor closed).
  private liveBids(tx: Prisma.TransactionClient, rfqId: string) {
    return tx.bid.findMany({
      where: { rfqId, status: { in: [BidStatus.SUBMITTED, BidStatus.SHORTLISTED] } },
      select: BID_FIELDS,
    });
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
