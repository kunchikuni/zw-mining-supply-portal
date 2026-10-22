import { EmailsController } from './emails.controller';
import { FailedEmailsService } from './failed-emails.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { createTestApp, guardsOn, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('EmailsController over HTTP — platform admins only', () => {
  const service = {
    list: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue({ count: 0 }),
    retry: jest.fn().mockResolvedValue({ id: 'e1', status: 'PENDING' }),
  };
  const ADMIN = user('ops', 'PLATFORM_ADMIN');
  const VERIFIER = user('ops', 'VERIFIER');
  const SUPPLIER = user('sup1', 'COMPANY_ADMIN');
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([EmailsController], [{ provide: FailedEmailsService, useValue: service }]);
  });
  afterAll(() => t.close());

  const routes: Array<[string, string]> = [
    ['GET', '/emails/failed'],
    ['GET', '/emails/failed/count'],
    ['POST', '/emails/e1/retry'],
  ];

  it.each(routes)('%s %s: verifiers and companies get 403, anonymous 401, admins 200', async (method, path) => {
    expect((await t.request(method, path, { as: VERIFIER })).status).toBe(403);
    expect((await t.request(method, path, { as: SUPPLIER })).status).toBe(403);
    expect((await t.request(method, path)).status).toBe(401);
    expect((await t.request(method, path, { as: ADMIN })).status).toBe(200);
  });

  it('retries the email in the path', async () => {
    await t.request('POST', '/emails/abc-123/retry', { as: ADMIN });
    expect(service.retry).toHaveBeenLastCalledWith('abc-123');
  });

  it('attaches the auth and role guards to every route', () => {
    for (const handler of ['listFailed', 'countFailed', 'retry']) {
      expect(guardsOn(EmailsController, handler)).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    }
  });
});
