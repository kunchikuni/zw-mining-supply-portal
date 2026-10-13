import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { createTestApp, guardsOn, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('RatingsController over HTTP', () => {
  const service = {
    create: jest.fn().mockResolvedValue({ ok: true }),
    averageForCompany: jest.fn().mockResolvedValue({ average: 4, count: 1 }),
  };
  const MINE = user('mine1', 'COMPANY_ADMIN');
  const good = { rfqId: 'r1', ratedCompanyId: 'sup1', score: 4 };
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([RatingsController], [{ provide: RatingsService, useValue: service }]);
  });
  afterAll(() => t.close());

  it('refuses anonymous ratings before the service runs (it used to be public)', async () => {
    expect((await t.request('POST', '/ratings', { body: good })).status).toBe(401);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('strips an injected authorCompanyId; the author comes only from the token', async () => {
    const res = await t.request('POST', '/ratings', { as: MINE, body: { ...good, authorCompanyId: 'mine2' } });
    expect(res.status).toBe(201);
    const [requester, dto] = service.create.mock.calls[0];
    expect(requester.companyId).toBe('mine1');
    expect(dto).not.toHaveProperty('authorCompanyId');
  });

  it.each([0, 6, -5, 999, 2.5, '5', null])('rejects score %p with 400 before the service runs', async (score) => {
    expect((await t.request('POST', '/ratings', { as: MINE, body: { ...good, score } })).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([1, 5])('accepts boundary score %p', async (score) => {
    expect((await t.request('POST', '/ratings', { as: MINE, body: { ...good, score } })).status).toBe(201);
  });

  it.each([
    ['rfqId', { ratedCompanyId: 'sup1', score: 4 }],
    ['ratedCompanyId', { rfqId: 'r1', score: 4 }],
  ])('rejects a missing %s with 400', async (_field, body) => {
    expect((await t.request('POST', '/ratings', { as: MINE, body })).status).toBe(400);
  });

  it('caps comments at 1000 characters', async () => {
    expect((await t.request('POST', '/ratings', { as: MINE, body: { ...good, comment: 'x'.repeat(1001) } })).status).toBe(400);
    expect((await t.request('POST', '/ratings', { as: MINE, body: { ...good, comment: 'x'.repeat(1000) } })).status).toBe(201);
  });

  it('keeps the average endpoint public', async () => {
    const res = await t.request('GET', '/ratings/company/sup1/average');
    expect(res.status).toBe(200);
    expect(service.averageForCompany).toHaveBeenCalledWith('sup1');
    expect(guardsOn(RatingsController, 'averageForCompany')).toHaveLength(0);
  });

  it('guards POST /ratings', () => {
    expect(guardsOn(RatingsController, 'create')).toContain(JwtAuthGuard);
  });
});
