import { ForbiddenException } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RfqStatus } from '@prisma/client';
import { asPrisma, Row, user } from '../test-utils/users';
import type { RfqAlertsService } from '../notifications/rfq-alerts.service';
import type { BidUpdatesService } from '../notifications/bid-updates.service';

const D = (iso: string) => new Date(iso);
const ids = (list: Row[]) => list.map((r) => r.id);

// Evaluates exactly the `where` shapes RfqsService produces.
function matches(row: Row, where: Row): boolean {
  if (!where) return true;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'string' ? row.status !== where.status : !where.status.in.includes(row.status)) return false;
  }
  for (const key of ['categoryId', 'province', 'mineCompanyId', 'rfqId', 'supplierCompanyId', 'authorCompanyId']) {
    if (where[key] !== undefined && row[key] !== where[key]) return false;
  }
  if (where.deadline?.gte !== undefined && !(row.deadline >= where.deadline.gte)) return false;
  if (where.OR && !where.OR.some((clause: Row) => matches(row, clause))) return false;
  return true;
}

// Who may post: only a MINE. 'mine1' is the mine the fixtures use throughout.
const COMPANIES: Row[] = [
  { id: 'mine1', type: 'MINE' },
  { id: 'sup1', type: 'SUPPLIER' },
  { id: 'staff1', type: 'PLATFORM' },
];

function makePrisma(rfqs: Row[], bids: Row[] = [], ratings: Row[] = []) {
  const calls = { bidFindMany: 0, ratingFindMany: 0, rfqCreate: 0, alerts: [] as Row[], cancelled: [] as Row[], closedEarly: [] as Row[], inTransaction: false, failCreate: false, failAlerts: false };
  // `_count: { select: { bids: ... } }`, honouring a `status: { not }` filter.
  const countBids = (rfqId: string, include?: Row) => {
    const not = include?._count?.select?.bids?.where?.status?.not;
    return bids.filter((b) => b.rfqId === rfqId && (not === undefined || b.status !== not)).length;
  };
  const fake = {
    calls,
    rfq: {
      findMany: async ({ where, orderBy, include }: Row) =>
        rfqs
          .filter((r) => matches(r, where))
          .sort((a, b) =>
            orderBy?.createdAt === 'desc' ? b.createdAt - a.createdAt : a.deadline - b.deadline,
          )
          .map((r) => ({ ...r, _count: { bids: countBids(r.id, include) } })),
      findUnique: async ({ where, include }: Row) => {
        const r = rfqs.find((x) => x.id === where.id);
        return r ? { ...r, _count: { bids: countBids(r.id, include) } } : null;
      },
      findUniqueOrThrow: async ({ where }: Row) => ({ ...rfqs.find((x) => x.id === where.id) }),
      updateMany: async ({ where, data }: Row) => {
        const hit = rfqs.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      create: async ({ data }: Row) => {
        calls.rfqCreate++;
        if (calls.failCreate) throw new Error('simulated insert failure');
        return { id: 'new', status: 'OPEN', ...data, mine: { name: 'Mine One' }, category: { name: 'PPE' } };
      },
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
    company: {
      findUnique: async ({ where, select }: Row) => {
        const c = COMPANIES.find((x) => x.id === where.id);
        return c && select ? Object.fromEntries(Object.keys(select).map((k) => [k, c[k]])) : (c ?? null);
      },
    },
    rating: {
      findMany: async ({ where, select, orderBy }: Row) => {
        calls.ratingFindMany++;
        return ratings
          .filter((r) => matches(r, where))
          .sort((a, b) => (orderBy?.createdAt === 'asc' ? a.createdAt - b.createdAt : 0))
          .map((r) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : r));
      },
    },
  };
  (fake as Row).$transaction = async (fn: (tx: Row) => Promise<unknown>) => {
    calls.inTransaction = true;
    try {
      return await fn({ ...fake, isTx: true });
    } finally {
      calls.inTransaction = false;
    }
  };
  const alerts = {
    enqueue: async (tx: Row, rfq: Row) => {
      if (calls.failAlerts) throw new Error('simulated outbox failure');
      calls.alerts.push({ inTransaction: calls.inTransaction, sameTx: tx.isTx === true, rfq });
      return 1;
    },
  };
  const bidUpdates = {
    enqueueRfqCancelled: async (tx: Row, rfqId: string) => {
      calls.cancelled.push({ rfqId, inTransaction: calls.inTransaction, sameTx: tx.isTx === true });
      return 1;
    },
    enqueueRfqClosedEarly: async (tx: Row, rfqId: string) => {
      calls.closedEarly.push({ rfqId, inTransaction: calls.inTransaction, sameTx: tx.isTx === true });
      return 1;
    },
  };
  return {
    fake,
    service: new RfqsService(
      asPrisma<PrismaService>(fake),
      alerts as unknown as RfqAlertsService,
      bidUpdates as unknown as BidUpdatesService,
    ),
  };
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

  it('shows only biddable RFQs, soonest deadline first: no expired or non-OPEN ones', async () => {
    const { service } = makePrisma(board());
    const out = await service.findOpen(undefined, undefined, NOW);
    expect(ids(out)).toEqual(['today', 'future']);
    expect(out.every((r) => r.biddingOpen)).toBe(true);
  });

  it("lists the deadline-day RFQ until 22:00Z and drops it after", async () => {
    const { service } = makePrisma(board());
    expect(ids(await service.findOpen(undefined, undefined, D('2026-10-20T21:59:59Z')))).toContain('today');
    expect(ids(await service.findOpen(undefined, undefined, D('2026-10-20T22:00:00Z')))).not.toContain('today');
  });

  it('still applies the category and province filters', async () => {
    const { service } = makePrisma([
      rfq('a', { categoryId: 'c1', province: 'Harare' }),
      rfq('b', { categoryId: 'c2', province: 'Harare' }),
      rfq('c', { categoryId: 'c1', province: 'Midlands' }),
    ]);
    expect(ids(await service.findOpen('c1', 'Harare', NOW))).toEqual(['a']);
  });
});

describe('RfqsService.setStatus — telling the bidders', () => {
  const owner = user('mine1', 'COMPANY_ADMIN');

  it.each(['OPEN', 'CLOSED'])('cancelling a %s RFQ queues the bidders\' emails in the same transaction', async (from) => {
    const { fake, service } = makePrisma([rfq('r1', { status: from })]);
    await service.setStatus('r1', owner, 'CANCELLED');
    expect(fake.calls.cancelled).toEqual([{ rfqId: 'r1', inTransaction: true, sameTx: true }]);
  });

  it('closing while bidding is still open tells the bidders, in the same transaction', async () => {
    const { fake, service } = makePrisma([rfq('r1')]);
    await service.setStatus('r1', owner, 'CLOSED');
    expect(fake.calls.closedEarly).toEqual([{ rfqId: 'r1', inTransaction: true, sameTx: true }]);
    expect(fake.calls.cancelled).toEqual([]);
  });

  it('closing after the deadline tells nobody: bidding had already stopped', async () => {
    const { fake, service } = makePrisma([rfq('r1', { deadline: D('2000-01-01T00:00:00Z') })]);
    await service.setStatus('r1', owner, 'CLOSED');
    expect(fake.calls.closedEarly).toEqual([]);
  });

  it('a refused cancel or close tells nobody', async () => {
    const { fake, service } = makePrisma([rfq('r1', { status: 'AWARDED' })]);
    await expect(service.setStatus('r1', owner, 'CANCELLED')).rejects.toMatchObject({ status: 409 });
    await expect(service.setStatus('r1', owner, 'CLOSED')).rejects.toMatchObject({ status: 409 });
    expect(fake.calls.cancelled).toEqual([]);
    expect(fake.calls.closedEarly).toEqual([]);
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

describe('RfqsService — revised bids', () => {
  const bids = [
    { id: 'v1', rfqId: 'r1', supplierCompanyId: 'sup1', status: 'SUPERSEDED', submittedAt: D('2026-10-01') },
    { id: 'o1', rfqId: 'r1', supplierCompanyId: 'sup2', status: 'SUBMITTED', submittedAt: D('2026-10-02') },
    { id: 'v2', rfqId: 'r1', supplierCompanyId: 'sup1', status: 'SUBMITTED', revisionOfId: 'v1', submittedAt: D('2026-10-03') },
  ];

  it('lists one entry per offer on the RFQ page, replaced versions under history', async () => {
    const { service } = makePrisma([rfq('r1')], bids);
    const out: Row = await service.findOne('r1', user('mine1', 'COMPANY_ADMIN'));
    expect(ids(out.bids)).toEqual(['o1', 'v2']);
    expect(ids(out.bids[1].history)).toEqual(['v1']);
    expect(ids((await service.findOne('r1', user('sup1'))).bids)).toEqual(['v2']);
  });

  it('counts offers, not versions — for everyone, and on My RFQs', async () => {
    const { service } = makePrisma([rfq('r1')], bids);
    expect((await service.findOne('r1', null))._count.bids).toBe(2);
    expect((await service.findMine('mine1'))[0]._count.bids).toBe(2);
  });
});

describe('RfqsService.findOne — the ratings its mine gave', () => {
  const bids = [
    { id: 'b1', rfqId: 'r1', supplierCompanyId: 'sup1', status: 'ACCEPTED', submittedAt: D('2026-10-01') },
    { id: 'b2', rfqId: 'r1', supplierCompanyId: 'sup2', status: 'ACCEPTED', submittedAt: D('2026-10-02') },
  ];
  const ratings = [
    { id: 'g2', rfqId: 'r1', authorCompanyId: 'mine1', ratedCompanyId: 'sup2', score: 3, comment: null, createdAt: D('2026-10-06') },
    { id: 'g1', rfqId: 'r1', authorCompanyId: 'mine1', ratedCompanyId: 'sup1', score: 5, comment: 'On time', createdAt: D('2026-10-05') },
    // Left over from before ratings were locked down: not the posting mine's.
    { id: 'x1', rfqId: 'r1', authorCompanyId: 'mine2', ratedCompanyId: 'sup1', score: 1, comment: null, createdAt: D('2026-10-04') },
    { id: 'z1', rfqId: 'r2', authorCompanyId: 'mine1', ratedCompanyId: 'sup1', score: 4, comment: null, createdAt: D('2026-10-03') },
  ];
  const view = (requester: Parameters<RfqsService['findOne']>[1], status: RfqStatus = 'AWARDED') => {
    const { fake, service } = makePrisma([rfq('r1', { status }), rfq('r2', { status: 'AWARDED' })], bids, ratings);
    return service.findOne('r1', requester).then((out: Row) => ({ out, calls: fake.calls }));
  };

  it('gives the posting mine the ratings it gave on this RFQ, oldest first, and nothing else', async () => {
    const { out } = await view(user('mine1', 'COMPANY_ADMIN'));
    expect(ids(out.ratings)).toEqual(['g1', 'g2']);
    expect(out.ratings[0]).toEqual({
      id: 'g1',
      ratedCompanyId: 'sup1',
      score: 5,
      comment: 'On time',
      createdAt: D('2026-10-05'),
    });
  });

  it('gives a PLATFORM_ADMIN them too', async () => {
    expect(ids((await view(user('platform', 'PLATFORM_ADMIN'))).out.ratings)).toEqual(['g1', 'g2']);
  });

  it('never gives them to a rated supplier, another mine, a verifier or anonymous — and never queries', async () => {
    for (const requester of [user('sup1'), user('mine2', 'COMPANY_ADMIN'), user('verifierco', 'VERIFIER'), null]) {
      const { out, calls } = await view(requester);
      expect(out).not.toHaveProperty('ratings');
      expect(calls.ratingFindMany).toBe(0);
    }
  });

  it("gives the owner an empty list without querying when the RFQ isn't awarded", async () => {
    for (const status of ['OPEN', 'CLOSED', 'CANCELLED'] as RfqStatus[]) {
      const { out, calls } = await view(user('mine1', 'COMPANY_ADMIN'), status);
      expect(out.ratings).toEqual([]);
      expect(calls.ratingFindMany).toBe(0);
    }
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

  const dto = { title: 'Hard hats', categoryId: 'c1', description: 'Two hundred hard hats', deadline: '2099-01-01T00:00:00.000Z' };

  it("queues the suppliers' alerts inside the same transaction, with the mine and category names", async () => {
    const { fake, service } = makePrisma([]);
    await service.create('mine1', dto);
    expect(fake.calls.alerts).toHaveLength(1);
    expect(fake.calls.alerts[0]).toMatchObject({ inTransaction: true, sameTx: true });
    expect(fake.calls.alerts[0].rfq).toMatchObject({
      mineCompanyId: 'mine1',
      categoryId: 'c1',
      mine: { name: 'Mine One' },
      category: { name: 'PPE' },
    });
  });

  it('fails the whole create if the alerts cannot be queued (so Postgres rolls the RFQ back)', async () => {
    const { fake, service } = makePrisma([]);
    fake.calls.failAlerts = true;
    await expect(service.create('mine1', dto)).rejects.toThrow('simulated outbox failure');
  });

  it('queues nothing if the RFQ itself fails to save', async () => {
    const { fake, service } = makePrisma([]);
    fake.calls.failCreate = true;
    await expect(service.create('mine1', dto)).rejects.toThrow('simulated insert failure');
    expect(fake.calls.alerts).toEqual([]);
  });

  it.each([
    ['a supplier', 'sup1'],
    ['portal staff', 'staff1'],
    ['a company that no longer exists', 'gone'],
  ])('refuses %s with 403, saving no RFQ and queuing no alerts', async (_who, companyId) => {
    const { fake, service } = makePrisma([]);
    const attempt = service.create(companyId, dto);
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow('Only mining companies can post RFQs');
    expect(fake.calls.rfqCreate).toBe(0);
    expect(fake.calls.alerts).toEqual([]);
  });

  it('lets a mine post', async () => {
    const { fake, service } = makePrisma([]);
    await service.create('mine1', dto);
    expect(fake.calls.rfqCreate).toBe(1);
  });
});
