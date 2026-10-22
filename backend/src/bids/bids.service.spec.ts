import { BidsService } from './bids.service';
import { RfqsService } from '../rfqs/rfqs.service';
import type { RfqAlertsService } from '../notifications/rfq-alerts.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BidStatus } from '@prisma/client';
import { asPrisma, Row, user } from '../test-utils/users';

const D = (iso: string) => new Date(iso);
const statusMatches = (current: string, cond: unknown) =>
  cond === undefined ? true : typeof cond === 'string' ? current === cond : (cond as { in: string[] }).in.includes(current);

// One in-memory store for RFQs, companies and bids. Interactive transactions
// keep an undo log, so a failure part-way through rolls back like Postgres.
function makeDb(rfqs: Row[], bids: Row[], companies: Row[] = []) {
  const state = {
    rfqs,
    bids,
    companies,
    created: [] as Row[],
    locks: [] as string[],
    failRfqUpdate: false,
    beforeBidUpdate: undefined as undefined | (() => void),
    beforeLock: undefined as undefined | (() => void),
  };
  const build = (undo: Array<() => void>) => ({
    // Only BidsService.create's `SELECT status, deadline ... FOR UPDATE`.
    $queryRaw: async (_sql: TemplateStringsArray, id: string) => {
      state.beforeLock?.();
      state.locks.push(id);
      const r = state.rfqs.find((x) => x.id === id);
      return r ? [{ status: r.status, deadline: r.deadline }] : [];
    },
    rfq: {
      findUnique: async ({ where }: Row) => {
        const r = state.rfqs.find((x) => x.id === where.id);
        return r ? { ...r } : null;
      },
      updateMany: async ({ where, data }: Row) => {
        if (state.failRfqUpdate) throw new Error('simulated rfq update failure');
        let count = 0;
        for (const r of state.rfqs) {
          if (r.id === where.id && statusMatches(r.status, where.status)) {
            const before = { ...r };
            Object.assign(r, data);
            undo.push(() => Object.assign(r, before));
            count++;
          }
        }
        return { count };
      },
    },
    company: {
      findUnique: async ({ where }: Row) => state.companies.find((c) => c.id === where.id) ?? null,
    },
    bid: {
      create: async ({ data }: Row) => {
        const n = state.created.length + 1;
        const row = { id: `new-${n}`, status: 'SUBMITTED', submittedAt: new Date(Date.UTC(2026, 9, 10, 0, 0, n)), ...data };
        state.created.push(row);
        state.bids.push(row);
        undo.push(() => {
          state.created.splice(state.created.indexOf(row), 1);
          state.bids.splice(state.bids.indexOf(row), 1);
        });
        return row;
      },
      findFirst: async ({ where, orderBy }: Row) =>
        state.bids
          .filter((b) => b.rfqId === where.rfqId && b.supplierCompanyId === where.supplierCompanyId && statusMatches(b.status, where.status))
          .sort((a, b) => (orderBy?.submittedAt === 'desc' ? -1 : 1) * (a.submittedAt - b.submittedAt))
          .map((b) => ({ ...b }))[0] ?? null,
      findUnique: async ({ where }: Row) => {
        const b = state.bids.find((x) => x.id === where.id);
        return b ? { ...b, rfq: { ...state.rfqs.find((r) => r.id === b.rfqId) } } : null;
      },
      findUniqueOrThrow: async ({ where }: Row) => ({ ...state.bids.find((x) => x.id === where.id) }),
      updateMany: async ({ where, data }: Row) => {
        state.beforeBidUpdate?.();
        let count = 0;
        for (const b of state.bids) {
          if (b.id === where.id && statusMatches(b.status, where.status)) {
            const before = { ...b };
            Object.assign(b, data);
            undo.push(() => Object.assign(b, before));
            count++;
          }
        }
        return { count };
      },
      findMany: async ({ where, orderBy }: Row) =>
        state.bids
          .filter((b) =>
            (where.rfqId === undefined || b.rfqId === where.rfqId) &&
            (where.supplierCompanyId === undefined || b.supplierCompanyId === where.supplierCompanyId),
          )
          .sort((a, b) => (orderBy?.submittedAt === 'desc' ? -1 : 1) * (a.submittedAt - b.submittedAt))
          .map((b) => ({ ...b, supplier: { id: b.supplierCompanyId }, rfq: { ...state.rfqs.find((r) => r.id === b.rfqId) } })),
    },
  });
  const prisma: Row = build([]);
  prisma.$transaction = async (fn: (tx: Row) => Promise<unknown>) => {
    const undo: Array<() => void> = [];
    try {
      return await fn(build(undo));
    } catch (err) {
      undo.reverse().forEach((u) => u());
      throw err;
    }
  };
  const p = asPrisma<PrismaService>(prisma);
  // Bids never create RFQs, so the alerts dependency is never called here.
  return { state, service: new BidsService(p, new RfqsService(p, {} as RfqAlertsService)) };
}

const rfq = (over: Row = {}): Row => ({
  id: 'r1',
  mineCompanyId: 'mine1',
  categoryId: 'cat1',
  status: 'OPEN',
  deadline: D('2099-01-01T00:00:00Z'),
  ...over,
});
const bid = (over: Row = {}): Row => ({
  id: 'b1',
  rfqId: 'r1',
  supplierCompanyId: 'sup1',
  amount: '100',
  status: 'SUBMITTED',
  submittedAt: D('2026-10-01'),
  ...over,
});
const verified = (id: string): Row => ({ id, verificationStatus: 'VERIFIED', categories: [{ categoryId: 'cat1' }] });
const MINE = user('mine1', 'COMPANY_ADMIN');
const dto = { rfqId: 'r1', amount: 100 };

describe('BidsService.create — who can bid, and when', () => {
  it('creates a bid on an open RFQ from a verified supplier listed in the category', async () => {
    const { state, service } = makeDb([rfq()], [], [verified('sup1')]);
    await service.create('sup1', dto);
    expect(state.created).toHaveLength(1);
    expect(state.created[0].supplierCompanyId).toBe('sup1');
  });

  it.each(['CLOSED', 'AWARDED', 'CANCELLED'])('refuses a %s RFQ with 409 and writes nothing', async (status) => {
    const { state, service } = makeDb([rfq({ status })], [], [verified('sup1')]);
    await expect(service.create('sup1', dto)).rejects.toMatchObject({ status: 409 });
    expect(state.created).toHaveLength(0);
  });

  it('refuses an OPEN RFQ whose deadline has passed (409)', async () => {
    const { state, service } = makeDb([rfq({ deadline: D('2000-01-01T00:00:00Z') })], [], [verified('sup1')]);
    await expect(service.create('sup1', dto)).rejects.toMatchObject({ status: 409 });
    expect(state.created).toHaveLength(0);
  });

  it('returns 404 for an unknown RFQ (not a misleading 403)', async () => {
    const { service } = makeDb([], [], [verified('sup1')]);
    await expect(service.create('sup1', dto)).rejects.toMatchObject({ status: 404 });
  });

  it('still enforces eligibility: an unverified supplier gets 403', async () => {
    const { state, service } = makeDb([rfq()], [], [{ ...verified('sup1'), verificationStatus: 'UNVERIFIED' }]);
    await expect(service.create('sup1', dto)).rejects.toMatchObject({ status: 403 });
    expect(state.created).toHaveLength(0);
  });

  it("refuses the posting mine bidding on its own RFQ, even when it would otherwise be eligible", async () => {
    const { state, service } = makeDb([rfq()], [], [verified('mine1')]);
    await expect(service.create('mine1', dto)).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/own RFQ/) });
    expect(state.created).toHaveLength(0);
  });

  it("does not block another mine bidding on a different mine's RFQ", async () => {
    const { state, service } = makeDb([rfq()], [], [verified('mine2')]);
    await service.create('mine2', dto);
    expect(state.created).toHaveLength(1);
  });

  it('checks the RFQ state first: own CLOSED RFQ is a 409', async () => {
    const { service } = makeDb([rfq({ status: 'CLOSED' })], [], [verified('mine1')]);
    await expect(service.create('mine1', dto)).rejects.toMatchObject({ status: 409 });
  });
});

describe('BidsService.create — a second bid revises the first', () => {
  const companies = [verified('sup1'), verified('sup2')];
  const bidAgain = (service: BidsService, amount = 90) => service.create('sup1', { rfqId: 'r1', amount });

  it('replaces the live bid: the old one becomes SUPERSEDED, the new one points back to it', async () => {
    const { state, service } = makeDb([rfq()], [bid()], companies);
    const out = await bidAgain(service);
    expect(out).toMatchObject({ status: 'SUBMITTED', revisionOfId: 'b1', amount: 90 });
    expect(state.bids.find((b) => b.id === 'b1')!.status).toBe('SUPERSEDED');
  });

  it('sends a revised SHORTLISTED bid back to SUBMITTED', async () => {
    const { state, service } = makeDb([rfq()], [bid({ status: 'SHORTLISTED' })], companies);
    const out = await bidAgain(service);
    expect(out.status).toBe('SUBMITTED');
    expect(state.bids.find((b) => b.id === 'b1')!.status).toBe('SUPERSEDED');
  });

  it('chains: a third bid revises the second, not the first', async () => {
    const { state, service } = makeDb([rfq()], [bid()], companies);
    const second = await bidAgain(service, 95);
    const third = await bidAgain(service, 90);
    expect(third.revisionOfId).toBe(second.id);
    expect(state.bids.filter((b) => b.status === 'SUPERSEDED').map((b) => b.id)).toEqual(['b1', second.id]);
  });

  it.each(['WITHDRAWN', 'REJECTED'])('treats a bid after a %s one as a fresh bid, leaving the old one alone', async (status) => {
    const { state, service } = makeDb([rfq()], [bid({ status })], companies);
    const out = await bidAgain(service);
    expect(out.revisionOfId).toBeUndefined();
    expect(state.bids.find((b) => b.id === 'b1')!.status).toBe(status);
  });

  it("only touches the caller's own live bid on this RFQ", async () => {
    const others = [bid({ id: 'theirs', supplierCompanyId: 'sup2' }), bid({ id: 'elsewhere', rfqId: 'r2' })];
    const { state, service } = makeDb([rfq(), rfq({ id: 'r2' })], others, companies);
    const out = await bidAgain(service);
    expect(out.revisionOfId).toBeUndefined();
    expect(state.bids.filter((b) => b.status === 'SUPERSEDED')).toEqual([]);
  });

  it('takes the RFQ lock before looking for the live bid', async () => {
    const { state, service } = makeDb([rfq()], [bid()], companies);
    await bidAgain(service);
    expect(state.locks).toEqual(['r1']);
  });

  it('answers 409 and changes nothing if the mine reviewed the bid mid-revision', async () => {
    const { state, service } = makeDb([rfq()], [bid()], companies);
    state.beforeBidUpdate = () => {
      state.bids[0].status = 'ACCEPTED';
    };
    await expect(bidAgain(service)).rejects.toMatchObject({ status: 409 });
    expect(state.bids.map((b) => [b.id, b.status])).toEqual([['b1', 'ACCEPTED']]);
    expect(state.created).toEqual([]);
  });

  it.each(['AWARDED', 'CLOSED'])('re-checks the RFQ under the lock: %s since the first check -> 409, nothing changed', async (status) => {
    const { state, service } = makeDb([rfq()], [bid()], companies);
    state.beforeLock = () => {
      state.rfqs[0].status = status;
    };
    await expect(bidAgain(service)).rejects.toMatchObject({ status: 409 });
    expect(state.bids.map((b) => [b.id, b.status])).toEqual([['b1', 'SUBMITTED']]);
    expect(state.created).toEqual([]);
  });

  it('refuses to revise once the deadline has passed (409), leaving the bid as it was', async () => {
    const { state, service } = makeDb([rfq({ deadline: D('2000-01-01T00:00:00Z') })], [bid()], companies);
    await expect(bidAgain(service)).rejects.toMatchObject({ status: 409 });
    expect(state.bids[0].status).toBe('SUBMITTED');
  });
});

describe('BidsService.setStatus — the mine reviewing bids', () => {
  it('shortlists without touching the RFQ', async () => {
    const { state, service } = makeDb([rfq()], [bid()]);
    expect((await service.setStatus('b1', MINE, 'SHORTLISTED')).status).toBe('SHORTLISTED');
    expect(state.rfqs[0].status).toBe('OPEN');
  });

  it('awards an OPEN RFQ when a bid is accepted', async () => {
    const { state, service } = makeDb([rfq()], [bid()]);
    expect((await service.setStatus('b1', MINE, 'ACCEPTED')).status).toBe('ACCEPTED');
    expect(state.rfqs[0].status).toBe('AWARDED');
  });

  it('awards a CLOSED RFQ too', async () => {
    const { state, service } = makeDb([rfq({ status: 'CLOSED' })], [bid({ status: 'SHORTLISTED' })]);
    await service.setStatus('b1', MINE, 'ACCEPTED');
    expect(state.rfqs[0].status).toBe('AWARDED');
  });

  it('allows a split award: a second accept leaves the RFQ AWARDED', async () => {
    const { state, service } = makeDb([rfq()], [bid(), bid({ id: 'b2', supplierCompanyId: 'sup2' })]);
    await service.setStatus('b1', MINE, 'ACCEPTED');
    await service.setStatus('b2', MINE, 'ACCEPTED');
    expect(state.rfqs[0].status).toBe('AWARDED');
    expect(state.bids.map((b) => b.status)).toEqual(['ACCEPTED', 'ACCEPTED']);
  });

  it('does not award the RFQ on a rejection', async () => {
    const { state, service } = makeDb([rfq()], [bid()]);
    await service.setStatus('b1', MINE, 'REJECTED');
    expect(state.rfqs[0].status).toBe('OPEN');
  });

  it('rolls back: if awarding the RFQ fails, the bid is not left ACCEPTED', async () => {
    const { state, service } = makeDb([rfq()], [bid()]);
    state.failRfqUpdate = true;
    await expect(service.setStatus('b1', MINE, 'ACCEPTED')).rejects.toThrow('simulated rfq update failure');
    expect(state.bids[0].status).toBe('SUBMITTED');
    expect(state.rfqs[0].status).toBe('OPEN');
  });

  it('answers 409 when another reviewer changed the bid first, and does not award', async () => {
    const { state, service } = makeDb([rfq()], [bid()]);
    state.beforeBidUpdate = () => {
      state.bids[0].status = 'REJECTED';
    };
    await expect(service.setStatus('b1', MINE, 'ACCEPTED')).rejects.toMatchObject({ status: 409 });
    expect(state.bids[0].status).toBe('REJECTED');
    expect(state.rfqs[0].status).toBe('OPEN');
  });
});

describe('BidsService.setStatus — final states and cancelled RFQs', () => {
  const finalMoves: Array<[string, string]> = [];
  for (const from of ['ACCEPTED', 'REJECTED', 'WITHDRAWN']) {
    for (const to of ['SHORTLISTED', 'ACCEPTED', 'REJECTED']) finalMoves.push([from, to]);
  }

  it.each(finalMoves)('refuses %s -> %s (409)', async (from, to) => {
    const { state, service } = makeDb([rfq()], [bid({ status: from })]);
    await expect(service.setStatus('b1', MINE, to as BidStatus)).rejects.toMatchObject({ status: 409 });
    expect(state.bids[0].status).toBe(from);
  });

  it('refuses SUBMITTED -> SUBMITTED (409)', async () => {
    const { service } = makeDb([rfq()], [bid()]);
    await expect(service.setStatus('b1', MINE, 'SUBMITTED')).rejects.toMatchObject({ status: 409 });
  });

  it.each(['SHORTLISTED', 'ACCEPTED', 'REJECTED'])('refuses %s on a CANCELLED RFQ (409)', async (to) => {
    const { state, service } = makeDb([rfq({ status: 'CANCELLED' })], [bid()]);
    await expect(service.setStatus('b1', MINE, to as BidStatus)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/cancelled/),
    });
    expect(state.bids[0].status).toBe('SUBMITTED');
  });
});

describe('BidsService.setStatus — who may do what', () => {
  it('lets the bidding supplier withdraw a SUBMITTED bid', async () => {
    const { service } = makeDb([rfq()], [bid()]);
    expect((await service.setStatus('b1', user('sup1'), 'WITHDRAWN')).status).toBe('WITHDRAWN');
  });

  it('lets the bidding supplier withdraw even from a CANCELLED RFQ', async () => {
    const { service } = makeDb([rfq({ status: 'CANCELLED' })], [bid()]);
    expect((await service.setStatus('b1', user('sup1'), 'WITHDRAWN')).status).toBe('WITHDRAWN');
  });

  it('refuses withdrawing an ACCEPTED bid (409)', async () => {
    const { service } = makeDb([rfq({ status: 'AWARDED' })], [bid({ status: 'ACCEPTED' })]);
    await expect(service.setStatus('b1', user('sup1'), 'WITHDRAWN')).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a supplier accepting its own bid (403)', async () => {
    const { state, service } = makeDb([rfq()], [bid()]);
    await expect(service.setStatus('b1', user('sup1'), 'ACCEPTED')).rejects.toMatchObject({ status: 403 });
    expect(state.rfqs[0].status).toBe('OPEN');
  });

  it("refuses another supplier withdrawing someone else's bid (403)", async () => {
    const { service } = makeDb([rfq()], [bid()]);
    await expect(service.setStatus('b1', user('sup2'), 'WITHDRAWN')).rejects.toMatchObject({ status: 403 });
  });

  it("refuses the mine withdrawing a supplier's bid (403)", async () => {
    const { service } = makeDb([rfq()], [bid()]);
    await expect(service.setStatus('b1', MINE, 'WITHDRAWN')).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a different mine reviewing (403)', async () => {
    const { state, service } = makeDb([rfq()], [bid()]);
    await expect(service.setStatus('b1', user('mine2', 'COMPANY_ADMIN'), 'ACCEPTED')).rejects.toMatchObject({ status: 403 });
    expect(state.rfqs[0].status).toBe('OPEN');
  });
});

describe('BidsService.findMine', () => {
  const rfqs = [
    rfq({ id: 'live' }),
    rfq({ id: 'expired', deadline: D('2000-01-01T00:00:00Z') }),
    rfq({ id: 'awarded', status: 'AWARDED' }),
  ];
  const bids = [
    bid({ id: 'b-live', rfqId: 'live', submittedAt: D('2026-10-05') }),
    bid({ id: 'b-expired', rfqId: 'expired', submittedAt: D('2026-09-01') }),
    bid({ id: 'b-awarded', rfqId: 'awarded', status: 'ACCEPTED', submittedAt: D('2026-08-01') }),
    bid({ id: 'b-other', rfqId: 'live', supplierCompanyId: 'sup2', submittedAt: D('2026-10-06') }),
  ];

  it("returns only the caller's bids, newest first", async () => {
    const { service } = makeDb(rfqs, bids);
    const out = await service.findMine('sup1');
    expect(out.map((b) => b.id)).toEqual(['b-live', 'b-expired', 'b-awarded']);
  });

  it('returns [] for a company with no bids', async () => {
    const { service } = makeDb(rfqs, bids);
    expect(await service.findMine('nobody')).toEqual([]);
  });

  it("flags each bid's RFQ as biddable only when OPEN and inside its window", async () => {
    const { service } = makeDb(rfqs, bids);
    const flags = Object.fromEntries((await service.findMine('sup1')).map((b) => [b.id, b.rfq.biddingOpen]));
    expect(flags).toEqual({ 'b-live': true, 'b-expired': false, 'b-awarded': false });
  });
});

describe('BidsService listings — one entry per offer', () => {
  const chain = () => [
    bid({ id: 'v1', amount: '100', status: 'SUPERSEDED', submittedAt: D('2026-10-01') }),
    bid({ id: 'v2', amount: '95', status: 'SUPERSEDED', revisionOfId: 'v1', submittedAt: D('2026-10-02') }),
    bid({ id: 'v3', amount: '90', status: 'SHORTLISTED', revisionOfId: 'v2', submittedAt: D('2026-10-03') }),
    bid({ id: 'o1', supplierCompanyId: 'sup2', submittedAt: D('2026-10-02') }),
  ];

  it('gives the mine the current version of each offer, with the replaced ones newest first', async () => {
    const { service } = makeDb([rfq()], chain());
    const out = await service.findByRfq('r1', MINE);
    expect(out.map((b) => b.id)).toEqual(['o1', 'v3']);
    expect(out[1].history.map((b) => b.id)).toEqual(['v2', 'v1']);
    expect(out[0].history).toEqual([]);
  });

  it("gives a bidder its own offer's history, and nobody else's", async () => {
    const { service } = makeDb([rfq()], chain());
    const out = await service.findByRfq('r1', user('sup1'));
    expect(out.map((b) => [b.id, b.history.map((h) => h.id)])).toEqual([['v3', ['v2', 'v1']]]);
  });

  it('lists a revised bid once on My bids', async () => {
    const { service } = makeDb([rfq()], chain());
    const out = await service.findMine('sup1');
    expect(out.map((b) => b.id)).toEqual(['v3']);
    expect(out[0].history.map((b) => b.id)).toEqual(['v2', 'v1']);
  });
});

describe('BidsService.findByRfq — sealed bids', () => {
  const bids = [bid({ id: 'b1' }), bid({ id: 'b2', supplierCompanyId: 'sup2' }), bid({ id: 'b3', supplierCompanyId: 'sup2' })];

  it('gives the posting mine every bid', async () => {
    const { service } = makeDb([rfq()], bids);
    expect((await service.findByRfq('r1', MINE)).map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('gives a bidder only its own', async () => {
    const { service } = makeDb([rfq()], bids);
    expect((await service.findByRfq('r1', user('sup2'))).map((b) => b.id)).toEqual(['b2', 'b3']);
  });

  it('gives a non-bidder nothing', async () => {
    const { service } = makeDb([rfq()], bids);
    expect(await service.findByRfq('r1', user('sup3'))).toEqual([]);
  });

  it('returns 404 for an unknown RFQ', async () => {
    const { service } = makeDb([], bids);
    await expect(service.findByRfq('nope', MINE)).rejects.toMatchObject({ status: 404 });
  });
});
