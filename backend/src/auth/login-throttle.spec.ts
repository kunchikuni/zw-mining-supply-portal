import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { LoginThrottle, MAX_ACCOUNT_FAILURES, MAX_IP_FAILURES, WINDOW_MS } from './login-throttle';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (pw: string) => `hashed:${pw}`),
  compare: jest.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
}));

describe('LoginThrottle', () => {
  const T0 = 1_000_000;
  const limits = (key = 'account:a@x.test'): Array<[string, number]> => [[key, 3]];

  it('allows up to the limit of failures, then answers 429 with how long to wait', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 3; i++) {
      expect(() => t.check(limits(), T0 + i)).not.toThrow();
      t.fail(['account:a@x.test'], T0 + i);
    }
    expect(() => t.check(limits(), T0 + 5)).toThrow(expect.objectContaining({ status: 429, message: 'Too many failed attempts. Try again in 15 minutes.' }));
  });

  it('lets the caller in again once the oldest failure ages out of the window', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 3; i++) t.fail(['account:a@x.test'], T0 + i * 60_000);
    expect(() => t.check(limits(), T0 + WINDOW_MS - 1)).toThrow();
    expect(() => t.check(limits(), T0 + WINDOW_MS + 1)).not.toThrow();
  });

  it('keeps keys apart, and clearing one forgets its failures', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 3; i++) t.fail(['account:a@x.test'], T0);
    expect(() => t.check(limits('account:b@x.test'), T0)).not.toThrow();
    t.clear('account:a@x.test');
    expect(() => t.check(limits(), T0)).not.toThrow();
  });
});

function makeService(users: Row[]) {
  const prisma = {
    user: {
      findUnique: async ({ where }: Row) => users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      update: async ({ where, data }: Row) => Object.assign(users.find((u) => u.id === where.id)!, data),
    },
  };
  return new AuthService(asPrisma<PrismaService>(prisma), new JwtService({ secret: 'test-secret' }));
}

const user = (id: string, email: string): Row => ({
  id,
  email,
  companyId: 'sup1',
  role: 'COMPANY_ADMIN',
  passwordHash: 'hashed:right-password',
  disabledAt: null,
  tokensValidAfter: null,
  mustChangePassword: false,
});
const wrong = (email: string) => ({ email, password: 'wrong-password' });
const right = (email: string) => ({ email, password: 'right-password' });

describe('AuthService.login — throttled', () => {
  it(`locks an account after ${MAX_ACCOUNT_FAILURES} wrong passwords: even the right one gets 429 (from any address)`, async () => {
    const service = makeService([user('u1', 'ann@x.test')]);
    for (let i = 0; i < MAX_ACCOUNT_FAILURES; i++) {
      await expect(service.login(wrong('ann@x.test'), '10.0.0.1')).rejects.toMatchObject({ status: 401 });
    }
    await expect(service.login(right('ann@x.test'), '10.0.0.1')).rejects.toMatchObject({ status: 429 });
    await expect(service.login(right('ann@x.test'), '10.0.0.2')).rejects.toMatchObject({ status: 429 });
  });

  it("counts the email typed, not whether it exists, and ignores case — so it can't reveal which accounts exist", async () => {
    const service = makeService([]);
    for (let i = 0; i < MAX_ACCOUNT_FAILURES; i++) {
      await expect(service.login(wrong(i % 2 ? 'Nobody@X.test' : 'nobody@x.test'), '10.0.0.1')).rejects.toMatchObject({ status: 401 });
    }
    await expect(service.login(wrong('nobody@x.test'), '10.0.0.1')).rejects.toMatchObject({ status: 429 });
  });

  it('a successful sign-in clears the count', async () => {
    const service = makeService([user('u1', 'ann@x.test')]);
    for (let i = 0; i < MAX_ACCOUNT_FAILURES - 1; i++) await service.login(wrong('ann@x.test'), '10.0.0.1').catch(() => undefined);
    await expect(service.login(right('ann@x.test'), '10.0.0.1')).resolves.toHaveProperty('accessToken');
    for (let i = 0; i < MAX_ACCOUNT_FAILURES - 1; i++) {
      await expect(service.login(wrong('ann@x.test'), '10.0.0.1')).rejects.toMatchObject({ status: 401 });
    }
  });

  it(`stops one address spraying many accounts after ${MAX_IP_FAILURES} failures, but not other addresses`, async () => {
    const service = makeService([user('u1', 'ann@x.test')]);
    for (let i = 0; i < MAX_IP_FAILURES; i++) {
      await expect(service.login(wrong(`victim${i}@x.test`), '10.0.0.9')).rejects.toMatchObject({ status: 401 });
    }
    await expect(service.login(right('ann@x.test'), '10.0.0.9')).rejects.toMatchObject({ status: 429 });
    await expect(service.login(right('ann@x.test'), '10.0.0.1')).resolves.toHaveProperty('accessToken');
  });
});

describe('AuthService.changePassword — throttled', () => {
  it(`locks after ${MAX_ACCOUNT_FAILURES} wrong current passwords, so a borrowed session can't guess its way to a takeover`, async () => {
    const users = [user('u1', 'ann@x.test')];
    const service = makeService(users);
    for (let i = 0; i < MAX_ACCOUNT_FAILURES; i++) {
      await expect(service.changePassword('u1', { currentPassword: 'guess', newPassword: 'new-password-1' })).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      service.changePassword('u1', { currentPassword: 'right-password', newPassword: 'new-password-1' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(users[0].passwordHash).toBe('hashed:right-password');
  });
});
