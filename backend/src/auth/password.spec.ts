import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (pw: string) => `hashed:${pw}`),
  compare: jest.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
}));

function makeService(users: Row[]) {
  const prisma = {
    user: {
      findUnique: async ({ where }: Row) => users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      update: async ({ where, data }: Row) => Object.assign(users.find((u) => u.id === where.id)!, data),
    },
  };
  const jwt = new JwtService({ secret: 'test-secret' });
  return { jwt, service: new AuthService(asPrisma<PrismaService>(prisma), jwt) };
}

const user = (over: Row = {}): Row => ({
  id: 'u1',
  email: 'v@portal.test',
  companyId: 'ops',
  role: 'VERIFIER',
  passwordHash: 'hashed:old-password',
  disabledAt: null,
  tokensValidAfter: null,
  mustChangePassword: false,
  ...over,
});

describe('AuthService.login — disabled accounts and temporary passwords', () => {
  it('signs in an active account and says whether its password is temporary', async () => {
    const { service } = makeService([user({ mustChangePassword: true })]);
    const out = await service.login({ email: 'v@portal.test', password: 'old-password' });
    expect(out.accessToken).toEqual(expect.any(String));
    expect(out.mustChangePassword).toBe(true);
  });

  it('refuses a disabled account with the right password (401, says disabled)', async () => {
    const { service } = makeService([user({ disabledAt: new Date() })]);
    await expect(service.login({ email: 'v@portal.test', password: 'old-password' })).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('disabled'),
    });
  });

  it("doesn't reveal that a disabled account exists to someone with the wrong password", async () => {
    const { service } = makeService([user({ disabledAt: new Date() })]);
    await expect(service.login({ email: 'v@portal.test', password: 'guess' })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    });
  });
});

describe('AuthService.changePassword', () => {
  it('needs the current password (400, nothing changed)', async () => {
    const users = [user()];
    const { service } = makeService(users);
    await expect(service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'new-password' })).rejects.toMatchObject({ status: 400 });
    expect(users[0].passwordHash).toBe('hashed:old-password');
  });

  it('refuses the same password again (400)', async () => {
    const { service } = makeService([user()]);
    await expect(service.changePassword('u1', { currentPassword: 'old-password', newPassword: 'old-password' })).rejects.toMatchObject({ status: 400 });
  });

  it('changes it, clears the temporary flag, ends other sessions and returns a token for this one', async () => {
    const users = [user({ mustChangePassword: true })];
    const { service, jwt } = makeService(users);
    const before = Date.now();
    const out = await service.changePassword('u1', { currentPassword: 'old-password', newPassword: 'new-password' });

    expect(users[0].passwordHash).toBe('hashed:new-password');
    expect(users[0].mustChangePassword).toBe(false);
    // Cut off at the whole second, so tokens from before now are refused.
    expect(users[0].tokensValidAfter.getTime()).toBe(Math.floor(before / 1000) * 1000);
    const claims = jwt.verify(out.accessToken);
    expect(claims).toMatchObject({ sub: 'u1', role: 'VERIFIER' });
    expect(claims.iat * 1000).toBeGreaterThanOrEqual(users[0].tokensValidAfter.getTime());
  });

  it('401s if the account has gone', async () => {
    const { service } = makeService([]);
    await expect(service.changePassword('u1', { currentPassword: 'x', newPassword: 'new-password' })).rejects.toMatchObject({ status: 401 });
  });
});
