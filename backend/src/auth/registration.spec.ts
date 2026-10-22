import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { CompaniesService } from '../companies/companies.service';
import type { CompanyUpdatesService } from '../notifications/company-updates.service';
import { hashInviteCode } from './invite-code';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';

// bcrypt's cost makes real hashing slow and its native binding is a build
// concern, not a registration-logic one.
jest.mock('bcrypt', () => ({
  hash: jest.fn(async (pw: string) => `hashed:${pw}`),
  compare: jest.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
}));

// In-memory stand-in for the Prisma calls registration makes. Interactive
// transactions keep an undo log, so a failure inside one rolls back like the
// real database would — which is what the "duplicate email doesn't burn the
// invite" rule depends on.
function makeDb() {
  const db = { companies: [] as Row[], invites: [] as Row[], users: [] as Row[] };
  let seq = 0;
  const id = () => `id-${++seq}`;
  const tick = () => new Promise((r) => setImmediate(r));

  const build = (undo: Array<() => void>) => ({
    invite: {
      findUnique: async ({ where }: Row) => {
        await tick();
        const row = db.invites.find((i) => i.codeHash === where.codeHash);
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }: Row) => {
        await tick();
        let count = 0;
        for (const inv of db.invites) {
          if (inv.id === where.id && inv.usedAt === null) {
            const before = { ...inv };
            Object.assign(inv, data);
            undo.push(() => Object.assign(inv, before));
            count++;
          }
        }
        return { count };
      },
      create: async ({ data }: Row) => {
        const row = { id: id(), usedAt: null, ...data };
        db.invites.push(row);
        return row;
      },
    },
    user: {
      create: async ({ data }: Row) => {
        await tick();
        if (db.users.some((u) => u.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = { id: id(), ...data };
        db.users.push(row);
        undo.push(() => db.users.splice(db.users.indexOf(row), 1));
        return row;
      },
    },
    company: {
      create: async ({ data }: Row) => {
        const { invites, ...rest } = data;
        const row = { id: id(), verificationStatus: 'UNVERIFIED', ...rest };
        db.companies.push(row);
        if (invites?.create) {
          db.invites.push({ id: id(), usedAt: null, companyId: row.id, ...invites.create });
        }
        return row;
      },
      findUnique: async ({ where }: Row) => db.companies.find((c) => c.id === where.id) ?? null,
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
  return { db, prisma: asPrisma<PrismaService>(prisma) };
}

const jwt = new JwtService({ secret: 'test-secret' });
const claims = (token: string) => jwt.decode(token) as Row;

function setup() {
  const { db, prisma } = makeDb();
  return {
    db,
    // Registration never changes verification, so the company emails are never queued here.
    companies: new CompaniesService(prisma, {} as CompanyUpdatesService),
    auth: new AuthService(prisma, jwt),
  };
}

const signup = (inviteCode: string, email: string) => ({
  inviteCode,
  email,
  password: 'password123',
  fullName: 'Test User',
});

describe('company creation + first admin', () => {
  it('mints a COMPANY_ADMIN invite and stores only its hash', async () => {
    const { db, companies } = setup();
    const created = await companies.create({ name: 'Acme Supplies', type: 'SUPPLIER' });

    expect(created.inviteCode.length).toBeGreaterThanOrEqual(32);
    expect(db.invites).toHaveLength(1);
    expect(db.invites[0].role).toBe('COMPANY_ADMIN');
    expect(db.invites[0].codeHash).toBe(hashInviteCode(created.inviteCode));
    expect(JSON.stringify(db)).not.toContain(created.inviteCode);
  });

  it("makes the first user that company's COMPANY_ADMIN", async () => {
    const { companies, auth } = setup();
    const co = await companies.create({ name: 'Acme', type: 'SUPPLIER' });

    const { accessToken } = await auth.register(signup(co.inviteCode, 'a@acme.test'));

    expect(claims(accessToken)).toMatchObject({ companyId: co.id, role: 'COMPANY_ADMIN' });
  });
});

describe('AuthService.register — invite redemption', () => {
  it('refuses a code that has already been used', async () => {
    const { db, companies, auth } = setup();
    const co = await companies.create({ name: 'Acme', type: 'SUPPLIER' });
    await auth.register(signup(co.inviteCode, 'a@acme.test'));

    await expect(auth.register(signup(co.inviteCode, 'b@acme.test'))).rejects.toMatchObject({ status: 403 });
    expect(db.users).toHaveLength(1);
  });

  it('lets exactly one of two concurrent registrations redeem the same code', async () => {
    const { db, companies, auth } = setup();
    const co = await companies.create({ name: 'Acme', type: 'SUPPLIER' });

    const results = await Promise.allSettled([
      auth.register(signup(co.inviteCode, 'x@acme.test')),
      auth.register(signup(co.inviteCode, 'y@acme.test')),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.users).toHaveLength(1);
  });

  it('refuses an unknown code, including a public company id used as one', async () => {
    const { db, companies, auth } = setup();
    const co = await companies.create({ name: 'Acme', type: 'SUPPLIER' });

    await expect(auth.register(signup('not-a-real-code', 'e@evil.test'))).rejects.toMatchObject({ status: 403 });
    await expect(auth.register(signup(co.id, 'e@evil.test'))).rejects.toMatchObject({ status: 403 });
    expect(db.users).toHaveLength(0);
  });

  it('refuses an expired code', async () => {
    const { db, companies, auth } = setup();
    const co = await companies.create({ name: 'Acme', type: 'SUPPLIER' });
    db.invites[0].expiresAt = new Date(Date.now() - 1000);

    await expect(auth.register(signup(co.inviteCode, 'a@acme.test'))).rejects.toMatchObject({ status: 403 });
  });

  it('answers a duplicate email with 409 and leaves the invite usable', async () => {
    const { db, companies, auth } = setup();
    const first = await companies.create({ name: 'One', type: 'SUPPLIER' });
    await auth.register(signup(first.inviteCode, 'taken@x.test'));
    const second = await companies.create({ name: 'Two', type: 'MINE' });

    await expect(auth.register(signup(second.inviteCode, 'taken@x.test'))).rejects.toMatchObject({ status: 409 });
    expect(db.invites.find((i) => i.companyId === second.id)?.usedAt).toBeNull();

    // ...so retrying with a different email works.
    await expect(auth.register(signup(second.inviteCode, 'fresh@x.test'))).resolves.toHaveProperty('accessToken');
  });
});

describe('CompaniesService.createInvite', () => {
  async function companyWithAdmin() {
    const ctx = setup();
    const co = await ctx.companies.create({ name: 'Acme', type: 'SUPPLIER' });
    const { accessToken } = await ctx.auth.register(signup(co.inviteCode, 'admin@acme.test'));
    return { ...ctx, co, admin: claims(accessToken) as any };
  }

  it('lets a company admin invite a member, who joins that company as COMPANY_MEMBER', async () => {
    const { companies, auth, co, admin } = await companyWithAdmin();
    const invite = await companies.createInvite(co.id, admin, undefined);

    const { accessToken } = await auth.register(signup(invite.inviteCode, 'm@acme.test'));

    expect(claims(accessToken)).toMatchObject({ companyId: co.id, role: 'COMPANY_MEMBER' });
  });

  it('refuses a plain member (403)', async () => {
    const { companies, auth, co, admin } = await companyWithAdmin();
    const invite = await companies.createInvite(co.id, admin, undefined);
    const { accessToken } = await auth.register(signup(invite.inviteCode, 'm@acme.test'));

    await expect(companies.createInvite(co.id, claims(accessToken) as any, undefined)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("refuses another company's admin (403)", async () => {
    const { companies, auth, co } = await companyWithAdmin();
    const rival = await companies.create({ name: 'Rival', type: 'SUPPLIER' });
    const { accessToken } = await auth.register(signup(rival.inviteCode, 'boss@rival.test'));

    await expect(companies.createInvite(co.id, claims(accessToken) as any, undefined)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('locks an email-bound invite to that address (case-insensitively)', async () => {
    const { companies, auth, co, admin } = await companyWithAdmin();
    const invite = await companies.createInvite(co.id, admin, 'Only@Acme.test');

    await expect(auth.register(signup(invite.inviteCode, 'other@acme.test'))).rejects.toMatchObject({ status: 403 });
    await expect(auth.register(signup(invite.inviteCode, 'only@acme.test'))).resolves.toHaveProperty('accessToken');
  });
});
