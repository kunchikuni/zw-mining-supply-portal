import type { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';
import { sessionCutoff } from './session';

// The token is only proof of who signed in; the account is re-read on every request.
function strategyWith(users: Row[]) {
  const prisma = { user: { findUnique: async ({ where }: Row) => users.find((u) => u.id === where.id) ?? null } };
  return new JwtStrategy({ get: () => 'test-secret' } as unknown as ConfigService, asPrisma<PrismaService>(prisma));
}

const account = (over: Row = {}): Row => ({
  id: 'u1',
  email: 'v@portal.test',
  companyId: 'ops',
  role: 'VERIFIER',
  disabledAt: null,
  tokensValidAfter: null,
  ...over,
});
const token = (over: Row = {}) => ({ sub: 'u1', email: 'v@portal.test', companyId: 'ops', role: 'VERIFIER', iat: 1_800_000_000, ...over });

describe('JwtStrategy.validate', () => {
  it('accepts an active account and returns who it is', async () => {
    await expect(strategyWith([account()]).validate(token())).resolves.toEqual({
      sub: 'u1',
      email: 'v@portal.test',
      companyId: 'ops',
      role: 'VERIFIER',
    });
  });

  it("takes the role and company from the database, not the token", async () => {
    const out = await strategyWith([account({ role: 'PLATFORM_ADMIN' })]).validate(token({ role: 'VERIFIER' }));
    expect(out.role).toBe('PLATFORM_ADMIN');
    const demoted = await strategyWith([account({ role: 'VERIFIER' })]).validate(token({ role: 'PLATFORM_ADMIN' }));
    expect(demoted.role).toBe('VERIFIER');
  });

  it('refuses a disabled account (401)', async () => {
    await expect(strategyWith([account({ disabledAt: new Date() })]).validate(token())).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('disabled'),
    });
  });

  it('refuses a token for an account that no longer exists (401)', async () => {
    await expect(strategyWith([]).validate(token())).rejects.toMatchObject({ status: 401 });
  });

  it('refuses a token issued before the password was changed or reset (401)', async () => {
    const changedAt = new Date(1_800_000_100_000);
    const strategy = strategyWith([account({ tokensValidAfter: changedAt })]);
    await expect(strategy.validate(token({ iat: 1_800_000_099 }))).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('session has ended'),
    });
    await expect(strategy.validate(token({ iat: 1_800_000_100 }))).resolves.toMatchObject({ sub: 'u1' });
    await expect(strategy.validate(token({ iat: 1_800_000_500 }))).resolves.toMatchObject({ sub: 'u1' });
  });

  it('keeps a token issued later in the same second as the change (the one change-password returns)', async () => {
    const change = new Date(1_800_000_100_750);
    const strategy = strategyWith([account({ tokensValidAfter: sessionCutoff(change) })]);
    const iat = Math.floor((change.getTime() + 100) / 1000); // signed 100 ms after the change
    await expect(strategy.validate(token({ iat }))).resolves.toMatchObject({ sub: 'u1' });
  });
});
