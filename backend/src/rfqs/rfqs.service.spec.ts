import { RfqsService } from './rfqs.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RfqStatus } from '@prisma/client';
import { asPrisma, Row, user } from '../test-utils/users';

const D = (iso: string) => new Date(iso);
const ids = (list: Row[]) => list.map((r) => r.id);

// Evaluates exactly the `where` shapes RfqsService produces.
function matches(row: Row, where: Row): boolean {
  if (!where) return true;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'string' ? row.status !== where.status : !where.status.in.includes(row.status)) return false;
  }
  for (const key of ['categoryId', 'province', 'mineCompanyId', 'rfqId', 'supplierCompanyId']) {
    if (where[key] !== undefined && row[key] !== where[key]) return false;
  }
  if (where.deadline?.gte !== undefined && !(row.deadline >= where.deadline.gte)) return false;
  if (where.OR && !where.OR.some((clause: Row) => matches(row, clause))) return false;
  return true;
}

function makePrisma(rfqs: Row[], bids: Row[] = []) {
  const calls = { bidFindMany: 0 };
  const fake = {
    calls,
    rfq: {
      findMany: async ({ where, orderBy }: Row) =>
        rfqs
          .filter((r) => matches(r, where))
          .sort((a, b) =>
            orderBy?.createdAt === 'desc' ? b.createdAt - a.createdAt : a.deadline - b.deadline,
          )
          .map((r) => ({ ...r, _count: { bids: bids.filter((b) => b.rfqId === r.id).length } })),
      findUnique: async ({ where }: Row) => {
        const r = rfqs.find((x) => x.id === where.id);
        return r ? { ...r, _count: { bids: bids.filter((b) => b.rfqId === r.id).length } } : null;
      },
      findUniqueOrThrow: async ({ where }: Row) => ({ ...rfqs.find((x) => x.id === where.id) }),
      updateMany: async ({ where, data }: Row) => {
        const hit = rfqs.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      create: async ({ data }: Row) => ({ id: 'new', status: 'OPEN', ...data }),
    },
    bid: {
      findMany: async ({ where }: Row) => {
        calls.bidFindMany++;
        return bids
          .filter((b) => matches(b, where))
          .sort((a, b) => a.submittedAt - b.submittedAt)
          .map((b) => ({ ...b, supplier: { id: b.supplierCompanyId } }));
      },
    },
  };
  return { fake, service: new RfqsService(asPrisma<PrismaService>(fake)) };
}

const rfq = (id: string, over: Row = {}): Row => ({
  id,
  mineCompanyId: 'mine1',
  categoryId: 'c1',
  province: null,
  status: 'OPEN',
  deadline: D('2099-01-01T00:00:00Z'),
  createdAt: D('2026-01-01T00:00:00Z'),
  ...over,
});

describe('RfqsService.assertOpenForBidding', () => {
  const deadline = D('2026-10-20T00:00:00Z');

  it('is still open at 10:00Z on the deadline day (the regression a raw comparison causes)', async () => {
    const { service } = makePrisma([rfq('r1', { deadline })]);
    await expect(service.assertOpenForBidding('r1', D('2026-10-20T10:00:00Z'))).resolves.toBeDefined();
  });

  it('is open at 21:59:59.999Z and closed (409) at 22:00:00Z', async () => {
    const { service } = makePrisma([rfq('r1', { deadline })]);
    await expect(service.assertOpenForBidding('r1', D('2026-10-20T21:59:59.999Z'))).resolves.toBeDefined();
    await expect(service.assertOpenForBidding('r1', D('2026-10-20T22:00:00Z'))).rejects.toMatchObject({ status: 409 });
  });

  it('is open the day before and closed the day after', async () => {
    const { service } = makePrisma([rfq('r1', { deadline })]);
    await expect(service.assertOpenForBidding('r1', D('2026-10-19T12:00:00Z'))).resolves.toBeDefined();
    await expect(service.assertOpenForBidding('r1', D('2026-10-21T09:00:00Z'))).rejects.toMatchObject({ status: 409 });
  });

  it.each(['CLOSED', 'AWARDED', 'CANCELLED'])('refuses a %s RFQ with 409', async (status) => {
    const { service } = makePrisma([rfq('r1', { status })]);
    await expect(service.assertOpenForBidding('r1')).rejects.toMatchObject({ status: 409 });
  });

  it('returns 404 for an unknown RFQ', async () => {
    const { service } = makePrisma([]);
    await expect(service.assertOpenForBidding('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('RfqsService.findOpen — the public board', () => {
  const NOW = D('2026-10-20T10:00:00Z');
  const board = () => [
    rfq('future', { deadline: D('2026-11-15T00:00:00Z') }),
    rfq('today', { deadline: D('2026-10-20T00:00:00Z') }),
    rfq('expiredX', { deadline: D('2026-10-10T00:00:00Z'), mineCompanyId: 'X' }),
    rfq('expiredY', { deadline: D('2026-10-12T00:00:00Z'), mineCompanyId: 'Y' }),
    rfq('closedFuture', { deadline: D('2026-12-01T00:00:00Z'), status: 'CLOSED' }),
  ];

  it('shows anonymous visitors only biddable RFQs, soonest deadline first', async () => {
    const { service } = makePrisma(board());
    const out = await service.findOpen(undefined, undefined, undefined, NOW);
    expect(ids(out)).toEqual(['today', 'future']);
    expect(out.every((r) => r.biddingOpen)).toBe(true);
  });

  it("lists the deadline-day RFQ until 22:00Z and drops it after", async () => {
    const { service } = makePrisma(board());
    expect(ids(await service.findOpen(undefined, undefined, undefined, D('2026-10-20T21:59:59Z')))).toContain('today');
    expect(ids(await service.findOpen(undefined, undefined, undefined, D('2026-10-20T22:00:00Z')))).not.toContain('today');
  });

  it('shows the posting mine its own expired RFQ, after the live ones, flagged not biddable', async () => {
    const { service } = makePrisma(board());
    const out = await service.findOpen(undefined, undefined, 'X', NOW);
    expect(ids(out)).toEqual(['today', 'future', 'expiredX']);
    expect(out.find((r) => r.id === 'expiredX')?.biddingOpen).toBe(false);
  });

  it("never shows a mine another mine's expired RFQ", async () => {
    const { service } = makePrisma(board());
    expect(ids(await service.findOpen(undefined, undefined, 'X', NOW))).not.toContain('expiredY');
    expect(ids(await service.findOpen(undefined, undefined, 'Y', NOW))).toEqual(['today', 'future', 'expiredY']);
  });

  it('never lists a non-OPEN RFQ, even to its owner', async () => {
    const { service } = makePrisma(board());
    expect(ids(await service.findOpen(undefined, undefined, 'mine1', NOW))).not.toContain('closedFuture');
  });

  it('orders expired RFQs most recently expired first', async () => {
    const { service } = makePrisma([
      rfq('old', { deadline: D('2026-09-01T00:00:00Z') }),
      rfq('newer', { deadline: D('2026-10-05T00:00:00Z') }),
      rfq('live', { deadline: D('2026-11-01T00:00:00Z') }),
    ]);
    expect(ids(await service.findOpen(undefined, undefined, 'mine1', NOW))).toEqual(['live', 'newer', 'old']);
  });

  it('still applies the category and province filters', async () => {
    const { service } = makePrisma([
      rfq('a', { categoryId: 'c1', province: 'Harare' }),
      rfq('b', { categoryId: 'c2', province: 'Harare' }),
      rfq('c', { categoryId: 'c1', province: 'Midlands' }),
    ]);
    expect(ids(await service.findOpen('c1', 'Harare', undefined, NOW))).toEqual(['a']);
  });
});

describe('RfqsService.setStatus — transition map', () => {
  const owner = user('mine1', 'COMPANY_ADMIN');

  it.each([
    ['OPEN', 'CLOSED'],
    ['OPEN', 'CANCELLED'],
    ['CLOSED', 'CANCELLED'],
  ])('allows %s -> %s for the posting mine', async (from, to) => {
    const rows = [rfq('r1', { status: from })];
    const { service } = makePrisma(rows);
    const out = await service.setStatus('r1', owner, to as RfqStatus);
    expect(out.status).toBe(to);
    expect(out.biddingOpen).toBe(false);
  });

  it.each([
    ['OPEN', 'AWARDED'],
    ['CLOSED', 'AWARDED'],
    ['CLOSED', 'OPEN'],
    ['OPEN', 'OPEN'],
    ['AWARDED', 'OPEN'],
    ['AWARDED', 'CLOSED'],
    ['AWARDED', 'CANCELLED'],
    ['CANCELLED', 'OPEN'],
    ['CANCELLED', 'CLOSED'],
    ['CANCELLED', 'AWARDED'],
  ])('refuses %s -> %s with 409 and leaves the status alone', async (from, to) => {
    const rows = [rfq('r1', { status: from })];
    const { service } = makePrisma(rows);
    await expect(service.setStatus('r1', owner, to as RfqStatus)).rejects.toMatchObject({ status: 409 });
    expect(rows[0].status).toBe(from);
  });

  it('refuses another mine (403)', async () => {
    const { service } = makePrisma([rfq('r1')]);
    await expect(service.setStatus('r1', user('mine2', 'COMPANY_ADMIN'), 'CLOSED')).rejects.toMatchObject({ status: 403 });
  });

  it('lets a PLATFORM_ADMIN act, within the same map', async () => {
    const { service } = makePrisma([rfq('r1')]);
    await expect(service.setStatus('r1', user('platform', 'PLATFORM_ADMIN'), 'CLOSED')).resolves.toMatchObject({
      status: 'CLOSED',
    });
  });

  it('returns 404 for an unknown RFQ', async () => {
    const { service } = makePrisma([]);
    await expect(service.setStatus('nope', owner, 'CLOSED')).rejects.toMatchObject({ status: 404 });
  });

  it('answers 409 when the RFQ changed between the read and the conditional write', async () => {
    const rows = [rfq('r1')];
    const { fake, service } = makePrisma(rows);
    const realUpdate = fake.rfq.updateMany;
    fake.rfq.updateMany = async (args: Row) => {
      rows[0].status = 'CANCELLED'; // someone else got there first
      return realUpdate(args);
    };
    await expect(service.setStatus('r1', owner, 'CLOSED')).rejects.toMatchObject({ status: 409 });
    expect(rows[0].status).toBe('CANCELLED');
  });
});

describe('RfqsService.findMine', () => {
  it("returns only the caller's RFQs, any status, newest first, with bid counts and biddingOpen", async () => {
    const { service } = makePrisma(
      [
        rfq('a', { createdAt: D('2026-01-01'), status: 'OPEN' }),
        rfq('b', { createdAt: D('2026-03-01'), status: 'AWARDED' }),
        rfq('c', { createdAt: D('2026-02-01'), status: 'CANCELLED' }),
        rfq('x', { mineCompanyId: 'mine2' }),
      ],
      [
        { id: 'b1', rfqId: 'b', supplierCompanyId: 's1', submittedAt: D('2026-03-02') },
        { id: 'b2', rfqId: 'b', supplierCompanyId: 's2', submittedAt: D('2026-03-03') },
      ],
    );
    const out = await service.findMine('mine1');
    expect(ids(out)).toEqual(['b', 'c', 'a']);
    expect(out[0]._count.bids).toBe(2);
    expect(out.map((r) => r.biddingOpen)).toEqual([false, false, true]);
  });
});

describe('RfqsService.findOne — sealed bids', () => {
  const bids = [
    { id: 'b1', rfqId: 'r1', supplierCompanyId: 'sup1', amount: '100', submittedAt: D('2026-10-01') },
    { id: 'b2', rfqId: 'r1', supplierCompanyId: 'sup2', amount: '90', submittedAt: D('2026-10-02') },
    { id: 'b3', rfqId: 'r1', supplierCompanyId: 'sup2', amount: '95', submittedAt: D('2026-10-03') },
    { id: 'z9', rfqId: 'r2', supplierCompanyId: 'sup1', amount: '1', submittedAt: D('2026-10-04') },
  ];
  const view = (requester: Parameters<RfqsService['findOne']>[1]) => {
    const { fake, service } = makePrisma([rfq('r1'), rfq('r2')], bids);
    return service.findOne('r1', requester).then((out) => ({ out, calls: fake.calls }));
  };

  it('gives the posting mine all bids, oldest first, and the count', async () => {
    const { out } = await view(user('mine1', 'COMPANY_ADMIN'));
    expect(ids(out.bids)).toEqual(['b1', 'b2', 'b3']);
    expect(out._count.bids).toBe(3);
  });

  it('gives a PLATFORM_ADMIN all bids', async () => {
    expect(ids((await view(user('platform', 'PLATFORM_ADMIN'))).out.bids)).toEqual(['b1', 'b2', 'b3']);
  });

  it('gives a bidder only its own bid(s), with the full count', async () => {
    const sup1 = await view(user('sup1'));
    expect(ids(sup1.out.bids)).toEqual(['b1']);
    expect(sup1.out._count.bids).toBe(3);
    expect(ids((await view(user('sup2'))).out.bids)).toEqual(['b2', 'b3']);
  });

  it('gives a non-bidder and another mine no bids, but the count', async () => {
    const sup3 = await view(user('sup3'));
    expect(sup3.out.bids).toEqual([]);
    expect(sup3.out._count.bids).toBe(3);
    expect((await view(user('mine2', 'COMPANY_ADMIN'))).out.bids).toEqual([]);
  });

  it('gives anonymous visitors the count only — and never runs the bid query', async () => {
    const { out, calls } = await view(null);
    expect(out.bids).toEqual([]);
    expect(out._count.bids).toBe(3);
    expect(calls.bidFindMany).toBe(0);
  });

  it('never mixes in bids from another RFQ', async () => {
    expect(ids((await view(user('sup1'))).out.bids)).not.toContain('z9');
  });

  it('still carries biddingOpen, and 404s for an unknown RFQ', async () => {
    expect((await view(null)).out.biddingOpen).toBe(true);
    const { service } = makePrisma([]);
    await expect(service.findOne('nope', null)).rejects.toMatchObject({ status: 404 });
  });
});

describe('RfqsService.create', () => {
  it('returns the new RFQ with biddingOpen', async () => {
    const { service } = makePrisma([]);
    const out = await service.create('mine1', {
      title: 'Hard hats',
      categoryId: 'c1',
      description: 'Two hundred hard hats',
      deadline: '2099-01-01T00:00:00.000Z',
    });
    expect(out.biddingOpen).toBe(true);
  });
});
