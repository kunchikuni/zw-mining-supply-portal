import type { ConfigService } from '@nestjs/config';
import { RfqAlertsService } from './rfq-alerts.service';
import type { Row } from '../test-utils/users';

// Users with their company inlined. `findMany` evaluates exactly the `where`
// shape RfqAlertsService builds, so these tests check who actually gets mail.
function makeTx(users: Row[]) {
  const outbox: Row[] = [];
  const tx = {
    user: {
      findMany: async ({ where, select }: Row) =>
        users
          .filter(
            (u) =>
              (where.disabledAt === null ? u.disabledAt == null : true) &&
              (where.rfqAlerts === undefined || u.rfqAlerts === where.rfqAlerts) &&
              u.company.id !== where.company.id.not &&
              u.company.type === where.company.type &&
              u.company.verificationStatus === where.company.verificationStatus &&
              u.company.categoryIds.includes(where.company.categories.some.categoryId),
          )
          .map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, company: { name: u.company.name }, ...(select ? {} : u) })),
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

const service = (appUrl?: string) =>
  new RfqAlertsService({ get: (k: string) => (k === 'APP_URL' ? appUrl : undefined) } as unknown as ConfigService);

const company = (id: string, over: Row = {}): Row => ({
  id,
  name: `${id} Ltd`,
  type: 'SUPPLIER',
  verificationStatus: 'VERIFIED',
  categoryIds: ['ppe'],
  ...over,
});
const person = (id: string, co: Row, over: Row = {}): Row => ({
  id,
  email: `${id}@example.test`,
  fullName: id,
  disabledAt: null,
  rfqAlerts: true,
  company: co,
  ...over,
});
const rfq = {
  id: 'r1',
  title: 'Hard hats',
  description: '200 hard hats',
  deadline: new Date('2026-10-24T00:00:00Z'),
  mineCompanyId: 'mine1',
  categoryId: 'ppe',
  mine: { name: 'Mine One' },
  category: { name: 'PPE' },
};

describe('RfqAlertsService.enqueue — who is told about a new RFQ', () => {
  const sup = company('sup');
  const users = [
    person('alice', sup),
    person('bob', sup), // every user at the company, not just admins
    person('quiet', sup, { rfqAlerts: false }),
    person('gone', sup, { disabledAt: new Date() }),
    person('unverified', company('newco', { verificationStatus: 'PENDING' })),
    person('elsewhere', company('fuel', { categoryIds: ['fuel'] })),
    person('poster', company('mine1', { type: 'MINE' })), // the posting mine's own staff
    // A verified mine listing the category: mines don't bid, so no email.
    person('othermine', company('mine2', { type: 'MINE' })),
    person('staff', company('platform', { type: 'PLATFORM' })),
  ];

  it('queues one email per eligible, opted-in, active user — and nobody else', async () => {
    const { tx, outbox } = makeTx(users);
    const count = await service().enqueue(tx as never, rfq);
    expect(outbox.map((o) => o.to).sort()).toEqual(['alice@example.test', 'bob@example.test']);
    expect(count).toBe(2);
  });

  it('keys each email by RFQ and user, so the same alert is never queued twice', async () => {
    const { tx, outbox } = makeTx(users);
    await service().enqueue(tx as never, rfq);
    expect(await service().enqueue(tx as never, rfq)).toBe(0);
    expect(outbox.map((o) => o.key)).toContain('rfq-alert:r1:alice');
    expect(new Set(outbox.map((o) => o.key)).size).toBe(outbox.length);
  });

  it("stops trying once bidding has closed: sendBefore is the deadline's Harare midnight", async () => {
    const { tx, outbox } = makeTx(users);
    await service().enqueue(tx as never, rfq);
    expect(outbox[0].sendBefore).toEqual(new Date('2026-10-24T22:00:00Z'));
  });

  it('writes the subject, text and HTML, linking to APP_URL (trailing slash trimmed)', async () => {
    const { tx, outbox } = makeTx(users);
    await service('https://portal.example/').enqueue(tx as never, rfq);
    expect(outbox[0].subject).toBe('New RFQ in PPE: Hard hats');
    expect(outbox[0].text).toContain('https://portal.example/rfqs/r1');
    expect(outbox[0].html).toContain('https://portal.example/rfqs/r1');
  });

  it('falls back to the local frontend when APP_URL is unset', async () => {
    const { tx, outbox } = makeTx(users);
    await service().enqueue(tx as never, rfq);
    expect(outbox[0].text).toContain('http://localhost:3001/rfqs/r1');
  });

  it('queues nothing when nobody matches', async () => {
    const { tx, outbox } = makeTx([person('quiet', sup, { rfqAlerts: false })]);
    expect(await service().enqueue(tx as never, rfq)).toBe(0);
    expect(outbox).toEqual([]);
  });
});
