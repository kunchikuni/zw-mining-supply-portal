import { RfqStatus } from '@prisma/client';
import { endOfHarareDay, startOfHarareDay } from '../harare-day';

// An RFQ's `deadline` is a calendar date, not an instant (see harare-day.ts):
// comparing the stored midnight-UTC instant to "now" would shut bidders out
// from 02:00 on the day the page tells them they can still bid. So bidding
// stays open through the end of the deadline's calendar day in Zimbabwe.
//
// Everything that needs to know whether an RFQ is "still biddable" — the
// bid check, the board listing, the dashboard count, the `biddingOpen` flag
// the frontend reads — goes through this file so they can't disagree.

// First instant at which bids are no longer accepted: the Harare midnight
// that ends the deadline's calendar day.
export function biddingClosesAt(deadline: Date): Date {
  return endOfHarareDay(deadline);
}

// The same rule expressed for a database filter: an RFQ is still within its
// bidding window at `now` exactly when `deadline >= earliestBiddableDeadline(now)`.
// That's the start of the current Harare calendar day — any deadline on or
// after it has an end-of-day cutoff that's still in the future.
export function earliestBiddableDeadline(now: Date): Date {
  return startOfHarareDay(now);
}

export function isBiddingOpen(
  rfq: { status: RfqStatus; deadline: Date },
  now: Date = new Date(),
): boolean {
  return rfq.status === RfqStatus.OPEN && now < biddingClosesAt(rfq.deadline);
}
