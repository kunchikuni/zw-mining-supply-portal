import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { createTestApp, guardsOn, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('StaffController over HTTP', () => {
  const service = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    setDisabled: jest.fn().mockResolvedValue({}),
    resetPassword: jest.fn().mockResolvedValue({}),
  };
  const ADMIN = user('ops', 'PLATFORM_ADMIN');
  const VERIFIER = user('ops', 'VERIFIER');
  const SUPPLIER = user('sup1', 'COMPANY_ADMIN');
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([StaffController], [{ provide: StaffService, useValue: service }]);
  });
  afterAll(() => t.close());

  // Every row has a body slot: with fewer values than the callback has
  // parameters, it.each would treat the last one as a `done` callback.
  const routes: Array<[string, string, object | undefined]> = [
    ['GET', '/staff', undefined],
    ['POST', '/staff', { email: 'n@portal.test', fullName: 'N', role: 'VERIFIER' }],
    ['PATCH', '/staff/u1/disabled', { disabled: true }],
    ['POST', '/staff/u1/reset-password', undefined],
  ];

  it.each(routes)('%s %s is for platform admins: verifiers and companies get 403, anonymous 401', async (method, path, body) => {
    expect((await t.request(method, path, { as: VERIFIER, body })).status).toBe(403);
    expect((await t.request(method, path, { as: SUPPLIER, body })).status).toBe(403);
    expect((await t.request(method, path, { body })).status).toBe(401);
    expect(Object.values(service).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect([200, 201]).toContain((await t.request(method, path, { as: ADMIN, body })).status);
  });

  it('passes the acting admin to disable and reset (so they can refuse self-service)', async () => {
    await t.request('PATCH', '/staff/u1/disabled', { as: ADMIN, body: { disabled: false } });
    expect(service.setDisabled).toHaveBeenCalledWith('u1', false, ADMIN);
    await t.request('POST', '/staff/u1/reset-password', { as: ADMIN });
    expect(service.resetPassword).toHaveBeenCalledWith('u1', ADMIN);
  });

  it.each([
    { email: 'not-an-email', fullName: 'N', role: 'VERIFIER' },
    { email: 'n@portal.test', fullName: '', role: 'VERIFIER' },
    { email: 'n@portal.test', fullName: 'N', role: 'COMPANY_ADMIN' },
    { email: 'n@portal.test', fullName: 'N' },
  ])('rejects new staff %j with 400', async (body) => {
    expect((await t.request('POST', '/staff', { as: ADMIN, body })).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('strips anything else from a new staff member (no passwordHash, no companyId)', async () => {
    await t.request('POST', '/staff', {
      as: ADMIN,
      body: { email: 'n@portal.test', fullName: 'N', role: 'VERIFIER', passwordHash: 'x', companyId: 'mine1' },
    });
    expect(service.create).toHaveBeenCalledWith({ email: 'n@portal.test', fullName: 'N', role: 'VERIFIER' });
  });

  it.each([{ disabled: 'yes' }, {}])('rejects disable body %j with 400', async (body) => {
    expect((await t.request('PATCH', '/staff/u1/disabled', { as: ADMIN, body })).status).toBe(400);
    expect(service.setDisabled).not.toHaveBeenCalled();
  });

  it('attaches JWT + roles guards to every route', () => {
    for (const handler of ['list', 'create', 'setDisabled', 'resetPassword']) {
      expect(guardsOn(StaffController, handler)).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    }
  });
});
