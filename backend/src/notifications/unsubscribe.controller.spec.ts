import { ConfigService } from '@nestjs/config';
import { UnsubscribeController } from './unsubscribe.controller';
import { unsubscribeToken } from './unsubscribe';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, TestApp } from '../test-utils/http';
import type { Row } from '../test-utils/users';

const SECRET = 'jwt-secret-for-tests';

describe('GET/POST /email/unsubscribe over HTTP — no sign-in, the token is the key', () => {
  const users: Row[] = [];
  const prisma = {
    user: {
      findUnique: async ({ where }: Row) => {
        const u = users.find((x) => x.id === where.id);
        return u ? { id: u.id, email: u.email, rfqAlerts: u.rfqAlerts } : null;
      },
      update: async ({ where, data }: Row) => Object.assign(users.find((x) => x.id === where.id)!, data),
    },
  };
  let t: TestApp;
  const url = (userId: string) => `/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(SECRET, userId))}`;

  beforeAll(async () => {
    t = await createTestApp(
      [UnsubscribeController],
      [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) } },
      ],
    );
  });
  afterAll(() => t.close());
  beforeEach(() => {
    users.splice(0, users.length, { id: 'u1', email: 'ann@example.test', rfqAlerts: true });
  });

  it('GET shows whose alerts the link is for, and changes nothing (link scanners fetch URLs)', async () => {
    const res = await t.request('GET', url('u1'));
    expect(res).toMatchObject({ status: 200, body: { email: 'ann@example.test', rfqAlerts: true } });
    expect(users[0].rfqAlerts).toBe(true);
  });

  it('POST turns the alerts off, and doing it again is harmless', async () => {
    expect(await t.request('POST', url('u1'))).toMatchObject({ status: 200, body: { email: 'ann@example.test', rfqAlerts: false } });
    expect(users[0].rfqAlerts).toBe(false);
    expect((await t.request('POST', url('u1'))).status).toBe(200);
  });

  it('refuses a missing or forged token with 400, and touches nobody', async () => {
    for (const path of ['/email/unsubscribe', '/email/unsubscribe?token=u1.forged', `/email/unsubscribe?token=${unsubscribeToken('other', 'u1')}`]) {
      expect((await t.request('POST', path)).status).toBe(400);
    }
    expect(users[0].rfqAlerts).toBe(true);
  });

  it('answers 404 for a valid link to an account that no longer exists', async () => {
    expect((await t.request('POST', url('deleted'))).status).toBe(404);
  });
});
