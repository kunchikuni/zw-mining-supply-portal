import { Prisma } from '@prisma/client';
import { StaffService } from './staff.service';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row, user } from '../test-utils/users';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (pw: string) => `hashed:${pw}`),
  compare: jest.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
}));

// Users with their company type inlined, enough for the `company: { type }` filters.
function makeDb(users: Row[], companies: Row[] = [{ id: 'ops', type: 'PLATFORM', name: 'ZW Supplier Portal operations' }]) {
  const typeOf = (u: Row) => companies.find((c) => c.id === u.companyId)?.type;
  const pick = (u: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, u[k]])) : { ...u });
  const prisma = {
    company: {
      findFirst: async ({ where }: Row) => companies.find((c) => c.type === where.type) ?? null,
      create: async ({ data }: Row) => {
        const c = { id: `co${companies.length + 1}`, ...data };
        companies.push(c);
        return c;
      },
    },
    user: {
      findMany: async ({ where, select }: Row) => users.filter((u) => typeOf(u) === where.company.type).map((u) => pick(u, select)),
      findFirst: async ({ where, select }: Row) => {
        const u = users.find((x) => x.id === where.id && typeOf(x) === where.company.type);
        return u ? pick(u, select) : null;
      },
      create: async ({ data, select }: Row) => {
        if (users.some((u) => u.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
        }
        const u = { id: `u${users.length + 1}`, createdAt: new Date(), disabledAt: null, tokensValidAfter: null, ...data };
        users.push(u);
        return pick(u, select);
      },
      update: async ({ where, data, select }: Row) => pick(Object.assign(users.find((u) => u.id === where.id)!, data), select),
    },
  };
  return new StaffService(asPrisma<PrismaService>(prisma));
}

const staff = (id: string, over: Row = {}): Row => ({
  id,
  companyId: 'ops',
  email: `${id}@portal.test`,
  fullName: id,
  role: 'VERIFIER',
  passwordHash: 'hashed:secret',
  createdAt: new Date('2026-10-01'),
  disabledAt: null,
  tokensValidAfter: null,
  mustChangePassword: false,
  ...over,
});
const ADMIN = { ...user('ops', 'PLATFORM_ADMIN'), sub: 'admin' };

describe('StaffService.list', () => {
  it('lists only portal staff, without password hashes', async () => {
    const users = [staff('admin', { role: 'PLATFORM_ADMIN' }), staff('v1'), { ...staff('miner'), companyId: 'mine1' }];
    const out = await makeDb(users, [{ id: 'ops', type: 'PLATFORM' }, { id: 'mine1', type: 'MINE' }]).list();
    expect(out.map((u: Row) => u.id)).toEqual(['admin', 'v1']);
    expect(out.every((u: Row) => !('passwordHash' in u) && !('tokensValidAfter' in u))).toBe(true);
  });
});

describe('StaffService.create', () => {
  it('creates a staff member with a temporary password, returned once and stored hashed', async () => {
    const users: Row[] = [];
    const out = await makeDb(users).create({ email: ' new@portal.test ', fullName: ' New Person ', role: 'VERIFIER' as any });
    expect(out.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(out.user).toMatchObject({ email: 'new@portal.test', fullName: 'New Person', role: 'VERIFIER', mustChangePassword: true });
    expect(users[0]).toMatchObject({ companyId: 'ops', passwordHash: `hashed:${out.temporaryPassword}` });
    expect('passwordHash' in out.user).toBe(false);
  });

  it('creates the portal company on first use', async () => {
    const companies: Row[] = [];
    await makeDb([], companies).create({ email: 'first@portal.test', fullName: 'First', role: 'PLATFORM_ADMIN' as any });
    expect(companies).toEqual([expect.objectContaining({ type: 'PLATFORM', name: 'ZW Supplier Portal operations' })]);
  });

  it('refuses an email that already has an account (409)', async () => {
    await expect(makeDb([staff('v1')]).create({ email: 'v1@portal.test', fullName: 'Again', role: 'VERIFIER' as any })).rejects.toMatchObject({ status: 409 });
  });
});

describe('StaffService.setDisabled', () => {
  it('disables and re-enables another staff member', async () => {
    const users = [staff('admin', { role: 'PLATFORM_ADMIN' }), staff('v1')];
    const service = makeDb(users);
    const off = await service.setDisabled('v1', true, ADMIN);
    expect(off.disabledAt).toEqual(expect.any(Date));
    const on = await service.setDisabled('v1', false, ADMIN);
    expect(on.disabledAt).toBeNull();
  });

  it('keeps the original date when disabling twice', async () => {
    const when = new Date('2026-10-01T09:00:00Z');
    const out = await makeDb([staff('v1', { disabledAt: when })]).setDisabled('v1', true, ADMIN);
    expect(out.disabledAt).toEqual(when);
  });

  it("refuses an admin disabling their own account (400) — so the last admin can't lock everyone out", async () => {
    const users = [staff('admin', { role: 'PLATFORM_ADMIN' })];
    await expect(makeDb(users).setDisabled('admin', true, ADMIN)).rejects.toMatchObject({ status: 400 });
    expect(users[0].disabledAt).toBeNull();
  });

  it("can't reach mine or supplier users, or unknown ids (404)", async () => {
    const service = makeDb([{ ...staff('miner'), companyId: 'mine1' }], [{ id: 'ops', type: 'PLATFORM' }, { id: 'mine1', type: 'MINE' }]);
    await expect(service.setDisabled('miner', true, ADMIN)).rejects.toMatchObject({ status: 404 });
    await expect(service.setDisabled('nobody', true, ADMIN)).rejects.toMatchObject({ status: 404 });
  });
});

describe('StaffService.resetPassword', () => {
  it('issues a new temporary password and signs out existing sessions', async () => {
    const users = [staff('v1')];
    const before = Date.now();
    const out = await makeDb(users).resetPassword('v1', ADMIN);
    expect(users[0].passwordHash).toBe(`hashed:${out.temporaryPassword}`);
    expect(users[0].mustChangePassword).toBe(true);
    expect(users[0].tokensValidAfter.getTime()).toBe(Math.floor(before / 1000) * 1000);
    expect(out.user.mustChangePassword).toBe(true);
  });

  it('refuses resetting your own password here (400) — that is what Change password is for', async () => {
    await expect(makeDb([staff('admin', { role: 'PLATFORM_ADMIN' })]).resetPassword('admin', ADMIN)).rejects.toMatchObject({ status: 400 });
  });

  it("can't reset a mine or supplier user's password (404)", async () => {
    const service = makeDb([{ ...staff('miner'), companyId: 'mine1' }], [{ id: 'ops', type: 'PLATFORM' }, { id: 'mine1', type: 'MINE' }]);
    await expect(service.resetPassword('miner', ADMIN)).rejects.toMatchObject({ status: 404 });
  });
});
