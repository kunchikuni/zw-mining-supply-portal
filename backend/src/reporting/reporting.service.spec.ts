import { ReportingService } from './reporting.service';
import { earliestBiddableDeadline } from '../rfqs/bidding-window';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';

describe('ReportingService.localContentSummary — "Open RFQs" means currently accepting bids', () => {
  it('counts only OPEN RFQs still inside their bidding window, for the caller’s company', async () => {
    const day = 864e5;
    const rfqs: Row[] = [
      { id: 'live', mineCompanyId: 'X', status: 'OPEN', deadline: new Date(Date.now() + 5 * day) },
      { id: 'expired', mineCompanyId: 'X', status: 'OPEN', deadline: new Date(Date.now() - 5 * day) },
      { id: 'closed', mineCompanyId: 'X', status: 'CLOSED', deadline: new Date(Date.now() + 5 * day) },
      { id: 'otherMine', mineCompanyId: 'Y', status: 'OPEN', deadline: new Date(Date.now() + 5 * day) },
    ];
    const countArgs: Row[] = [];
    const fake = {
      bid: { findMany: async () => [] },
      rfq: {
        count: async ({ where }: Row) => {
          countArgs.push(where);
          return rfqs.filter(
            (r) => r.mineCompanyId === where.mineCompanyId && r.status === where.status && r.deadline >= where.deadline.gte,
          ).length;
        },
      },
    };

    const summary = await new ReportingService(asPrisma<PrismaService>(fake)).localContentSummary('X');

    expect(summary.openRfqCount).toBe(1);
    const where = countArgs[0];
    expect(where).toMatchObject({ mineCompanyId: 'X', status: 'OPEN' });
    // The cutoff is the start of the current Harare day (22:00Z the day before).
    expect(where.deadline.gte.getUTCHours()).toBe(22);
    expect(Math.abs(where.deadline.gte.getTime() - earliestBiddableDeadline(new Date()).getTime())).toBeLessThan(5000);
  });
});
