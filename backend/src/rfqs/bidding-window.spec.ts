import { biddingClosesAt, earliestBiddableDeadline, isBiddingOpen } from './bidding-window';
import type { RfqStatus } from '@prisma/client';

const D = (iso: string) => new Date(iso);

describe('biddingClosesAt — a deadline is a calendar date, closing at the end of that day in Harare', () => {
  // The new-RFQ form stores a date input as midnight UTC of that date.
  const deadline = D('2026-10-20T00:00:00.000Z');

  it('closes at 22:00Z — midnight in Harare (UTC+2) — on the deadline day', () => {
    expect(biddingClosesAt(deadline).toISOString()).toBe('2026-10-20T22:00:00.000Z');
  });

  it('assigns an instant after 22:00Z to the next Harare day', () => {
    expect(biddingClosesAt(D('2026-10-20T23:00:00Z')).toISOString()).toBe('2026-10-21T22:00:00.000Z');
  });
});

describe('earliestBiddableDeadline — the same rule as a database filter', () => {
  it('is the start of the current Harare day', () => {
    expect(earliestBiddableDeadline(D('2026-10-20T10:00:00Z')).toISOString()).toBe('2026-10-19T22:00:00.000Z');
    expect(earliestBiddableDeadline(D('2026-10-20T21:59:59Z')).toISOString()).toBe('2026-10-19T22:00:00.000Z');
    expect(earliestBiddableDeadline(D('2026-10-20T22:00:00Z')).toISOString()).toBe('2026-10-20T22:00:00.000Z');
  });

  // The listing filters on `deadline >= earliestBiddableDeadline(now)`, the bid
  // check compares `now < biddingClosesAt(deadline)`, and the flag the UI reads
  // uses isBiddingOpen. If these ever disagreed, the board would show RFQs the
  // server then refuses bids on.
  it('agrees with biddingClosesAt and isBiddingOpen for every deadline/now combination', () => {
    const deadlines: Date[] = [];
    for (let d = 0; d < 40; d++) deadlines.push(new Date(Date.UTC(2026, 8, 25 + d)));
    for (let h = 0; h < 24 * 5; h += 7) deadlines.push(new Date(Date.UTC(2026, 9, 18) + h * 3600e3 + 13 * 60e3));

    let checked = 0;
    for (let t = Date.UTC(2026, 8, 23); t < Date.UTC(2026, 10, 10); t += 37 * 60e3) {
      const now = new Date(t);
      const cutoff = earliestBiddableDeadline(now);
      for (const deadline of deadlines) {
        const byClose = now < biddingClosesAt(deadline);
        if (deadline >= cutoff !== byClose || isBiddingOpen({ status: 'OPEN', deadline }, now) !== byClose) {
          throw new Error(`disagree at now=${now.toISOString()} deadline=${deadline.toISOString()}`);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100_000);
  });
});

describe('isBiddingOpen', () => {
  it('is never true for a non-OPEN RFQ, whatever the deadline', () => {
    for (const status of ['CLOSED', 'AWARDED', 'CANCELLED'] as RfqStatus[]) {
      expect(isBiddingOpen({ status, deadline: D('2099-01-01T00:00:00Z') }, D('2026-10-20T10:00:00Z'))).toBe(false);
    }
  });
});
