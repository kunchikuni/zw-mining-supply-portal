// What a supplier is told when the mine decides on its bid, or cancels the RFQ
// it bid on. Pure, like rfq-alert.ts; the layout escapes everything.
import { formatDay, renderEmail } from './email-layout';

export type BidDecision = 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED';

export interface UpdateBid {
  amount: { toString(): string } | string | number; // Prisma.Decimal in practice
  currency: string;
  leadTimeDays?: number | null;
}

export interface UpdateRfq {
  id: string;
  title: string;
  deadline: Date;
  mine: { name: string };
  category: { name: string };
}

export interface UpdateRecipient {
  fullName: string;
  company: { name: string };
}

// "USD 1,234.50"
export function formatAmount(bid: UpdateBid): string {
  const n = Number(bid.amount.toString());
  return `${bid.currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DECISIONS: Record<BidDecision, { subject: string; eyebrow: string; intro: (mine: string) => string; status: string }> = {
  SHORTLISTED: {
    subject: 'Your bid was shortlisted',
    eyebrow: 'Bid shortlisted',
    intro: (mine) => `${mine} has shortlisted your bid on this request for quote. No final decision has been made yet.`,
    status: 'Shortlisted',
  },
  ACCEPTED: {
    subject: 'Your bid was accepted',
    eyebrow: 'Bid accepted',
    intro: (mine) => `${mine} has accepted your bid on this request for quote.`,
    status: 'Accepted',
  },
  REJECTED: {
    subject: 'Your bid was not selected',
    eyebrow: 'Bid not selected',
    intro: (mine) => `${mine} has decided not to go ahead with your bid on this request for quote.`,
    status: 'Not selected',
  },
};

function bidDetails(rfq: UpdateRfq, bid: UpdateBid): Array<[string, string]> {
  return [
    ['Posted by', rfq.mine.name],
    ['Category', rfq.category.name],
    ['Your bid', formatAmount(bid)],
    ...(bid.leadTimeDays != null ? [['Lead time', `${bid.leadTimeDays} days`] as [string, string]] : []),
  ];
}

function footer(recipient: UpdateRecipient, appUrl: string) {
  return {
    footer: `You're receiving this because ${recipient.company.name} bid on this RFQ on ZW Supplier Portal.`,
    footerLink: { label: 'See all your bids', href: `${appUrl}/bids/mine` },
  };
}

export function buildBidDecisionEmail(
  decision: BidDecision,
  rfq: UpdateRfq,
  bid: UpdateBid,
  recipient: UpdateRecipient,
  appUrl: string,
) {
  const d = DECISIONS[decision];
  return renderEmail(`${d.subject}: ${rfq.title}`, {
    eyebrow: d.eyebrow,
    title: rfq.title,
    greeting: `Hi ${recipient.fullName},`,
    intro: d.intro(rfq.mine.name),
    details: [...bidDetails(rfq, bid), ['Status', d.status]],
    button: { label: 'View the RFQ', href: `${appUrl}/rfqs/${rfq.id}` },
    ...footer(recipient, appUrl),
  });
}

export function buildRfqClosedEarlyEmail(rfq: UpdateRfq, bid: UpdateBid, recipient: UpdateRecipient, appUrl: string) {
  return renderEmail(`Bidding closed early: ${rfq.title}`, {
    eyebrow: 'Bidding closed early',
    title: rfq.title,
    greeting: `Hi ${recipient.fullName},`,
    intro: `${rfq.mine.name} has closed this request for quote to new bids before its deadline. Your bid stands and can still be shortlisted or accepted, but it can no longer be revised.`,
    details: [...bidDetails(rfq, bid), ['Was due to close', formatDay(rfq.deadline)]],
    button: { label: 'View the RFQ', href: `${appUrl}/rfqs/${rfq.id}` },
    ...footer(recipient, appUrl),
  });
}

// To the mine: a supplier pulled its bid. `recipient.company` is the mine.
export function buildBidWithdrawnEmail(
  rfq: UpdateRfq,
  bid: UpdateBid,
  supplierName: string,
  recipient: UpdateRecipient,
  appUrl: string,
) {
  return renderEmail(`Bid withdrawn: ${rfq.title}`, {
    eyebrow: 'Bid withdrawn',
    title: rfq.title,
    greeting: `Hi ${recipient.fullName},`,
    intro: `${supplierName} has withdrawn its bid on your request for quote.`,
    details: [
      ['Supplier', supplierName],
      ['Category', rfq.category.name],
      ['Their bid', formatAmount(bid)],
    ],
    button: { label: 'View the RFQ', href: `${appUrl}/rfqs/${rfq.id}` },
    footer: `You're receiving this because ${recipient.company.name} posted this RFQ on ZW Supplier Portal.`,
    footerLink: { label: 'See all your RFQs', href: `${appUrl}/rfqs/mine` },
  });
}

export function buildRfqCancelledEmail(rfq: UpdateRfq, bid: UpdateBid, recipient: UpdateRecipient, appUrl: string) {
  return renderEmail(`RFQ cancelled: ${rfq.title}`, {
    eyebrow: 'Request for quote cancelled',
    title: rfq.title,
    greeting: `Hi ${recipient.fullName},`,
    intro: `${rfq.mine.name} has cancelled this request for quote, so your bid won't be considered.`,
    details: [...bidDetails(rfq, bid), ['Was due to close', formatDay(rfq.deadline)]],
    button: { label: 'View the RFQ', href: `${appUrl}/rfqs/${rfq.id}` },
    ...footer(recipient, appUrl),
  });
}
