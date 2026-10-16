import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { createTestApp, guardsOn, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('POST /auth/change-password over HTTP', () => {
  const service = {
    register: jest.fn(),
    login: jest.fn(),
    changePassword: jest.fn().mockResolvedValue({ accessToken: 't' }),
  };
  const ME = user('sup1', 'COMPANY_ADMIN');
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([AuthController], [{ provide: AuthService, useValue: service }]);
  });
  afterAll(() => t.close());

  it("changes the caller's own password — the account comes from the token", async () => {
    const res = await t.request('POST', '/auth/change-password', {
      as: ME,
      body: { currentPassword: 'old-password', newPassword: 'new-password', userId: 'someone-else' },
    });
    expect(res.status).toBe(201);
    expect(service.changePassword).toHaveBeenCalledWith(ME.sub, { currentPassword: 'old-password', newPassword: 'new-password' });
  });

  it('needs sign-in (401)', async () => {
    expect((await t.request('POST', '/auth/change-password', { body: { currentPassword: 'a', newPassword: 'new-password' } })).status).toBe(401);
    expect(service.changePassword).not.toHaveBeenCalled();
  });

  it.each([{ currentPassword: 'old-password', newPassword: 'short' }, { newPassword: 'new-password' }, {}])(
    'rejects body %j with 400 before the service runs',
    async (body) => {
      expect((await t.request('POST', '/auth/change-password', { as: ME, body })).status).toBe(400);
      expect(service.changePassword).not.toHaveBeenCalled();
    },
  );

  it('has the JWT guard attached', () => {
    expect(guardsOn(AuthController, 'changePassword')).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });
});
