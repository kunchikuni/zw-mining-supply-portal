import { FailedEmailsService } from './failed-emails.service';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';

const NOW = new Date('2026-10-22T10:00:00Z');
const D = (iso: string) => new Date(iso);

function makeService(rows: Row[]) {
  const prisma = {
    emailOutbox: {
      findMany: async ({ where, orderBy, take }: Row) =>
        rows
          .filter((r) => r.status === where.status)
          .sort((a, b) => (orderBy.createdAt === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
          .slice(0, take)
          .map((r) => ({ ...r })),
      count: async ({ where }: Row) => rows.filter((r) => r.status === where.status).length,
      findUnique: async ({ where }: Row) => rows.find((r) => r.id === where.id) ?? null,
      updateMany: async ({ where, data }: Row) => {
        const hit = rows.filter((r) => r.id === where.id && r.status === where.status);
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
  };
  return new FailedEmailsService(asPrisma<PrismaService>(prisma));
}

const email = (id: string, over: Row = {}): Row => ({
  id,
  key: `bid-accepted:b-${id}:u1`,
  to: `${id}@example.test`,
  subject: `Subject ${id}`,
  status: 'FAILED',
  attempts: 6,
  lastError: 'connect ECONNREFUSED 127.0.0.1:1025',
  nextAttemptAt: D('2026-10-21T09:00:00Z'),
  createdAt: D('2026-10-21T08:00:00Z'),
  sendBefore: null,
  ...over,
});

describe('FailedEmailsService.list / count', () => {
  const rows = () => [
    email('old', { createdAt: D('2026-10-01T08:00:00Z') }),
    email('new', { key: 'rfq-alert:r1:u1', sendBefore: D('2026-10-25T22:00:00Z') }),
    email('closed', { key: 'rfq-alert:r2:u1', sendBefore: D('2026-10-20T22:00:00Z'), createdAt: D('2026-10-20T08:00:00Z') }),
    email('sent', { status: 'SENT' }),
    email('pending', { status: 'PENDING', attempts: 2 }),
  ];

  it('lists only failed emails, newest first, with what each is about and whether it can be sent again', async () => {
    const list = await makeService(rows()).list(NOW);
    expect(list.map((e) => [e.id, e.kind, e.retryable])).toEqual([
      ['new', 'rfq-alert', true],
      ['closed', 'rfq-alert', false],
      ['old', 'bid-accepted', true],
    ]);
    expect(list[0]).toMatchObject({ to: 'new@example.test', attempts: 6, lastError: 'connect ECONNREFUSED 127.0.0.1:1025' });
    expect(list[0]).not.toHaveProperty('key');
  });

  it('counts them', async () => {
    expect(await makeService(rows()).count()).toEqual({ count: 3 });
  });
});

describe('FailedEmailsService.retry', () => {
  it('puts a failed email back in the queue, due now, with a fresh set of attempts', async () => {
    const rows = [email('a')];
    expect(await makeService(rows).retry('a', NOW)).toEqual({ id: 'a', status: 'PENDING' });
    expect(rows[0]).toMatchObject({ status: 'PENDING', attempts: 0, nextAttemptAt: NOW, lastError: 'connect ECONNREFUSED 127.0.0.1:1025' });
  });

  it.each(['SENT', 'PENDING', 'SKIPPED'])('refuses a %s email (409)', async (status) => {
    const rows = [email('a', { status })];
    await expect(makeService(rows).retry('a', NOW)).rejects.toMatchObject({ status: 409 });
    expect(rows[0].status).toBe(status);
  });

  it('refuses an RFQ alert whose bidding has closed (409): the outbox would only skip it', async () => {
    const rows = [email('a', { key: 'rfq-alert:r1:u1', sendBefore: D('2026-10-20T22:00:00Z') })];
    await expect(makeService(rows).retry('a', NOW)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/bidding/) });
    expect(rows[0].status).toBe('FAILED');
  });

  it('answers 404 for an unknown email', async () => {
    await expect(makeService([]).retry('nope', NOW)).rejects.toMatchObject({ status: 404 });
  });
});
