import { EmailOutboxService } from './email-outbox.service';
import type { Mailer, OutgoingEmail } from './mailer';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';

const NOW = new Date('2026-10-16T10:00:00Z');
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow);
const MIN = 60_000;

function makeOutbox(rows: Row[], opts: { failWith?: string; beforeClaim?: () => void } = {}) {
  const sent: OutgoingEmail[] = [];
  const mailer = {
    configured: true,
    send: async (email: OutgoingEmail) => {
      if (opts.failWith) throw new Error(opts.failWith);
      sent.push(email);
    },
  } as Mailer;
  const matches = (r: Row, where: Row) =>
    r.id === where.id && r.status === where.status && (where.attempts === undefined || r.attempts === where.attempts);
  const prisma = {
    emailOutbox: {
      findMany: async ({ where, take }: Row) =>
        rows
          .filter((r) => r.status === where.status && r.nextAttemptAt <= where.nextAttemptAt.lte)
          .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
          .slice(0, take)
          .map((r) => ({ ...r })),
      updateMany: async ({ where, data }: Row) => {
        opts.beforeClaim?.();
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) {
          const { attempts, ...rest } = data;
          Object.assign(r, rest);
          if (attempts?.increment) r.attempts += attempts.increment;
        }
        return { count: hit.length };
      },
      update: async ({ where, data }: Row) => Object.assign(rows.find((r) => r.id === where.id)!, data),
    },
  };
  return { sent, service: new EmailOutboxService(asPrisma<PrismaService>(prisma), mailer) };
}

const email = (id: string, over: Row = {}): Row => ({
  id,
  to: `${id}@example.test`,
  subject: `Subject ${id}`,
  text: 'text',
  html: '<p>html</p>',
  status: 'PENDING',
  attempts: 0,
  nextAttemptAt: at(-MIN),
  sendBefore: null,
  lastError: null,
  sentAt: null,
  ...over,
});

describe('EmailOutboxService.deliverDue', () => {
  it('sends due emails and marks them SENT', async () => {
    const rows = [email('a'), email('b')];
    const { sent, service } = makeOutbox(rows);
    expect(await service.deliverDue(NOW)).toMatchObject({ sent: 2 });
    expect(sent.map((e) => e.to)).toEqual(['a@example.test', 'b@example.test']);
    expect(rows.map((r) => [r.status, r.attempts])).toEqual([
      ['SENT', 1],
      ['SENT', 1],
    ]);
    expect(rows[0].sentAt).toEqual(expect.any(Date));
  });

  it("sends an email's stored headers (e.g. List-Unsubscribe), and none for one without", async () => {
    const headers = { 'List-Unsubscribe': '<https://api.example/email/unsubscribe?token=t>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
    const { sent, service } = makeOutbox([email('a', { headers }), email('b', { headers: null })]);
    await service.deliverDue(NOW);
    expect(sent.find((e) => e.to === 'a@example.test')!.headers).toEqual(headers);
    expect(sent.find((e) => e.to === 'b@example.test')!).not.toHaveProperty('headers');
  });

  it('leaves emails that are not due yet, and ones already sent', async () => {
    const rows = [email('later', { nextAttemptAt: at(5 * MIN) }), email('done', { status: 'SENT' })];
    const { sent, service } = makeOutbox(rows);
    await service.deliverDue(NOW);
    expect(sent).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(['PENDING', 'SENT']);
  });

  it('on failure keeps it PENDING, records the error and backs off (1 min after the first try)', async () => {
    const rows = [email('a')];
    const { service } = makeOutbox(rows, { failWith: 'connect ECONNREFUSED 127.0.0.1:1025' });
    expect(await service.deliverDue(NOW)).toMatchObject({ retrying: 1 });
    expect(rows[0]).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'connect ECONNREFUSED 127.0.0.1:1025' });
    expect(rows[0].nextAttemptAt).toEqual(at(MIN));
  });

  it('backs off further each time: 5 minutes after the second failure, 6 hours after the fifth', async () => {
    const second = [email('a', { attempts: 1 })];
    await makeOutbox(second, { failWith: 'x' }).service.deliverDue(NOW);
    expect(second[0].nextAttemptAt).toEqual(at(5 * MIN));
    const fifth = [email('a', { attempts: 4 })];
    await makeOutbox(fifth, { failWith: 'x' }).service.deliverDue(NOW);
    expect(fifth[0].nextAttemptAt).toEqual(at(6 * 60 * MIN));
  });

  it('gives up after the sixth failed attempt: FAILED, with the last error', async () => {
    const rows = [email('a', { attempts: 5 })];
    const { service } = makeOutbox(rows, { failWith: 'mailbox unavailable' });
    expect(await service.deliverDue(NOW)).toMatchObject({ failed: 1 });
    expect(rows[0]).toMatchObject({ status: 'FAILED', attempts: 6, lastError: 'mailbox unavailable' });
  });

  it("skips (doesn't send) an email past its sendBefore — e.g. an RFQ whose bidding closed", async () => {
    const rows = [email('stale', { sendBefore: at(-1) }), email('fresh', { sendBefore: at(60 * MIN) })];
    const { sent, service } = makeOutbox(rows);
    expect(await service.deliverDue(NOW)).toMatchObject({ sent: 1, skipped: 1 });
    expect(sent.map((e) => e.to)).toEqual(['fresh@example.test']);
    expect(rows.map((r) => r.status)).toEqual(['SKIPPED', 'SENT']);
  });

  it("doesn't send an email another sender claimed first", async () => {
    const rows = [email('a')];
    const { sent, service } = makeOutbox(rows, {
      beforeClaim: () => {
        rows[0].attempts = 1; // someone else's claim landed first
      },
    });
    expect(await service.deliverDue(NOW)).toMatchObject({ sent: 0 });
    expect(sent).toEqual([]);
  });

  it('takes a lease while sending: a claimed email is not due again for 10 minutes', async () => {
    const rows = [email('a')];
    let leaseSeen: Date | undefined;
    const { service } = makeOutbox(rows);
    // Peek at the row between claim and send.
    (service as unknown as { mailer: Mailer }).mailer.send = async () => {
      leaseSeen = rows[0].nextAttemptAt;
    };
    await service.deliverDue(NOW);
    expect(leaseSeen).toEqual(at(10 * MIN));
  });

  it('sends at most 20 per run, oldest first', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => email(`e${i}`, { nextAttemptAt: at(-(25 - i) * MIN) }));
    const { sent, service } = makeOutbox(rows);
    await service.deliverDue(NOW);
    expect(sent).toHaveLength(20);
    expect(sent[0].to).toBe('e0@example.test');
  });
});

describe('EmailOutboxService start-up', () => {
  it('does not start sending without a configured mail server (emails wait in the outbox)', () => {
    const mailer = { configured: false, send: jest.fn() } as unknown as Mailer;
    const service = new EmailOutboxService(asPrisma<PrismaService>({}), mailer);
    const spy = jest.spyOn(service, 'deliverDue');
    service.onApplicationBootstrap();
    expect(spy).not.toHaveBeenCalled();
    service.onApplicationShutdown();
  });
});
