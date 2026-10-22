import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import { createTestApp, TestApp } from '../test-utils/http';
import { asPrisma, Row, user } from '../test-utils/users';

describe('AuthService.me / updateMe', () => {
  const users: Row[] = [
    { id: 'u1', email: 'a@example.test', fullName: 'A', role: 'COMPANY_ADMIN', rfqAlerts: true, passwordHash: 'h', company: { id: 'sup1', name: 'Sup', type: 'SUPPLIER' } },
  ];
  const pick = (u: Row, select: Row) => Object.fromEntries(Object.keys(select).map((k) => [k, u[k]]));
  const prisma = {
    user: {
      findUnique: async ({ where, select }: Row) => {
        const u = users.find((x) => x.id === where.id);
        return u ? pick(u, select) : null;
      },
      update: async ({ where, data, select }: Row) => pick(Object.assign(users.find((u) => u.id === where.id)!, data), select),
    },
  };
  const service = new AuthService(asPrisma<PrismaService>(prisma), new JwtService({ secret: 's' }));

  it("returns the caller's account and preferences, never the password hash", async () => {
    const me = await service.me('u1');
    expect(me).toMatchObject({ email: 'a@example.test', rfqAlerts: true, company: { name: 'Sup' } });
    expect(me).not.toHaveProperty('passwordHash');
  });

  it('turns RFQ alerts off and on', async () => {
    expect((await service.updateMe('u1', { rfqAlerts: false })).rfqAlerts).toBe(false);
    expect(users[0].rfqAlerts).toBe(false);
    expect((await service.updateMe('u1', { rfqAlerts: true })).rfqAlerts).toBe(true);
  });

  it('401s for an account that no longer exists', async () => {
    await expect(service.me('gone')).rejects.toMatchObject({ status: 401 });
  });
});

describe('GET/PATCH /auth/me over HTTP', () => {
  const service = {
    register: jest.fn(),
    login: jest.fn(),
    changePassword: jest.fn(),
    me: jest.fn().mockResolvedValue({}),
    updateMe: jest.fn().mockResolvedValue({}),
  };
  const ME = user('sup1', 'COMPANY_MEMBER');
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([AuthController], [{ provide: AuthService, useValue: service }]);
  });
  afterAll(() => t.close());

  it("reads and updates the token's own account", async () => {
    expect((await t.request('GET', '/auth/me', { as: ME })).status).toBe(200);
    expect(service.me).toHaveBeenCalledWith(ME.sub);
    expect((await t.request('PATCH', '/auth/me', { as: ME, body: { rfqAlerts: false } })).status).toBe(200);
    expect(service.updateMe).toHaveBeenCalledWith(ME.sub, { rfqAlerts: false });
  });

  it('only lets preferences through: role, email and company are stripped', async () => {
    await t.request('PATCH', '/auth/me', { as: ME, body: { rfqAlerts: true, role: 'PLATFORM_ADMIN', email: 'x@y.test', companyId: 'mine1' } });
    expect(service.updateMe).toHaveBeenCalledWith(ME.sub, { rfqAlerts: true });
  });

  it('rejects a non-boolean preference (400)', async () => {
    expect((await t.request('PATCH', '/auth/me', { as: ME, body: { rfqAlerts: 'no' } })).status).toBe(400);
    expect(service.updateMe).not.toHaveBeenCalled();
  });

  it('needs sign-in (401)', async () => {
    expect((await t.request('GET', '/auth/me')).status).toBe(401);
    expect((await t.request('PATCH', '/auth/me', { body: { rfqAlerts: false } })).status).toBe(401);
  });
});
