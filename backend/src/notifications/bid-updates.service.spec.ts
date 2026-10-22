import type { ConfigService } from '@nestjs/config';
import { BidUpdatesService } from './bid-updates.service';
import type { Row } from '../test-utils/users';

// Bids with their RFQ and supplier (and its users) inlined. The fake applies
// the `where` filters BidUpdatesService asks for — live statuses, active users
// — so these tests check who actually gets mail.
function makeTx(bids: Row[]) {
  const outbox: Row[] = [];
  const shape = (b: Row, select: Row) => {
    const usersWhere = select.supplier.select.users.where;
    return {
      id: b.id,
      amount: b.amount,
      currency: b.currency,
      leadTimeDays: b.leadTimeDays,
      rfq: b.rfq,
      supplier: {
        name: b.supplier.name,
        users: b.supplier.users.filter((u: Row) => (usersWhere?.disabledAt === null ? u.disabledAt == null : true)),
      },
    };
  };
  const tx = {
    bid: {
      findUniqueOrThrow: async ({ where, select }: Row) => {
        const b = bids.find((x) => x.id === where.id);
        if (!b) throw new Error('No Bid found');
        return shape(b, select);
      },
      findMany: async ({ where, select }: Row) =>
        bids.filter((b) => b.rfqId === where.rfqId && where.status.in.includes(b.status)).map((b) => shape(b, select)),
    },
    emailOutbox: {
      createMany: async ({ data, skipDuplicates }: Row) => {
        let count = 0;
        for (const row of data) {
          if (outbox.some((o) => o.key === row.key)) {
            if (!skipDuplicates) throw new Error('duplicate key');
            continue;
          }
          outbox.push(row);
          count++;
        }
        return { count };
      },
    },
  };
  return { tx, outbox };
}

const service = () =>
  new BidUpdatesService({ get: (k: string) => (k === 'APP_URL' ? 'https://portal.example/' : undefined) } as unknown as ConfigService);

const rfq = { id: 'r1', title: 'Hard hats', deadline: new Date('2026-11-30T00:00:00Z'), mine: { name: 'Mine One' }, category: { name: 'PPE' } };
const person = (id: string, over: Row = {}): Row => ({ id, email: `${id}@example.test`, fullName: id, disabledAt: null, ...over });
const bidFrom = (id: string, supplier: string, users: Row[], over: Row = {}): Row => ({
  id,
  rfqId: 'r1',
  status: 'SUBMITTED',
  amount: '100',
  currency: 'USD',
  leadTimeDays: null,
  rfq,
  supplier: { name: `${supplier} Ltd`, users },
  ...over,
});

describe('BidUpdatesService.enqueueDecision — telling a supplier about its bid', () => {
  const bids = [bidFrom('b1', 'sup1', [person('ann'), person('bob'), person('gone', { disabledAt: new Date() })])];

  it("emails every active user at the bidding supplier, whatever their alert setting", async () => {
    const { tx, outbox } = makeTx(bids);
    expect(await service().enqueueDecision(tx as never, 'b1', 'ACCEPTED')).toBe(2);
    expect(outbox.map((o) => o.to).sort()).toEqual(['ann@example.test', 'bob@example.test']);
    expect(outbox[0].subject).toBe('Your bid was accepted: Hard hats');
    expect(outbox[0].text).toContain('https://portal.example/rfqs/r1');
  });

  it('keys each email by decision, bid and user, so it is never queued twice', async () => {
    const { tx, outbox } = makeTx(bids);
    await service().enqueueDecision(tx as never, 'b1', 'SHORTLISTED');
    expect(await service().enqueueDecision(tx as never, 'b1', 'SHORTLISTED')).toBe(0);
    expect(outbox.map((o) => o.key).sort()).toEqual(['bid-shortlisted:b1:ann', 'bid-shortlisted:b1:bob']);
    // A later decision on the same bid is a different email.
    expect(await service().enqueueDecision(tx as never, 'b1', 'ACCEPTED')).toBe(2);
  });

  it('queues nothing when the supplier has no active users', async () => {
    const { tx, outbox } = makeTx([bidFrom('b1', 'sup1', [person('gone', { disabledAt: new Date() })])]);
    expect(await service().enqueueDecision(tx as never, 'b1', 'REJECTED')).toBe(0);
    expect(outbox).toEqual([]);
  });
});

describe('BidUpdatesService.enqueueRfqCancelled — telling the bidders', () => {
  const bids = [
    bidFrom('b1', 'sup1', [person('ann')]),
    bidFrom('b2', 'sup2', [person('cat')], { status: 'SHORTLISTED' }),
    bidFrom('b3', 'sup3', [person('dan')], { status: 'WITHDRAWN' }),
    bidFrom('b4', 'sup4', [person('eve')], { status: 'REJECTED' }),
    bidFrom('b5', 'sup5', [person('fay')], { status: 'SUPERSEDED' }),
    bidFrom('b6', 'sup6', [person('gus')], { rfqId: 'other' }),
  ];

  it('emails the users behind every bid still in play, and nobody else', async () => {
    const { tx, outbox } = makeTx(bids);
    expect(await service().enqueueRfqCancelled(tx as never, 'r1')).toBe(2);
    expect(outbox.map((o) => o.to).sort()).toEqual(['ann@example.test', 'cat@example.test']);
    expect(outbox.map((o) => o.key).sort()).toEqual(['rfq-cancelled:r1:ann', 'rfq-cancelled:r1:cat']);
    expect(outbox[0].subject).toBe('RFQ cancelled: Hard hats');
  });

  it('queues nothing when no bid is still in play', async () => {
    const { tx, outbox } = makeTx([bids[2], bids[3]]);
    expect(await service().enqueueRfqCancelled(tx as never, 'r1')).toBe(0);
    expect(outbox).toEqual([]);
  });
});
