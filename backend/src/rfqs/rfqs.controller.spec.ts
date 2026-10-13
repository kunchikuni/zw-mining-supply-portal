import { RfqsController } from './rfqs.controller';
import { RfqsService } from './rfqs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtOptionalAuthGuard } from '../auth/jwt-optional-auth.guard';
import { createTestApp, guardsOn, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('RfqsController over HTTP', () => {
  const service = {
    findMine: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    findOpen: jest.fn().mockResolvedValue([]),
    setStatus: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  };
  const MINE = user('mine1', 'COMPANY_ADMIN');
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([RfqsController], [{ provide: RfqsService, useValue: service }]);
  });
  afterAll(() => t.close());

  describe('routing', () => {
    it('sends GET /rfqs/mine to findMine with the caller company — not to findOne("mine")', async () => {
      const res = await t.request('GET', '/rfqs/mine', { as: MINE });
      expect(res.status).toBe(200);
      expect(service.findMine).toHaveBeenCalledWith('mine1');
      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('requires sign-in for GET /rfqs/mine', async () => {
      expect((await t.request('GET', '/rfqs/mine')).status).toBe(401);
      expect(service.findMine).not.toHaveBeenCalled();
    });

    it('passes the caller (or null) to findOne for sealed bids', async () => {
      await t.request('GET', '/rfqs/abc-123');
      expect(service.findOne).toHaveBeenLastCalledWith('abc-123', null);
      await t.request('GET', '/rfqs/abc-123', { as: MINE });
      expect(service.findOne).toHaveBeenLastCalledWith('abc-123', MINE);
    });

    it('passes the caller company to findOpen (the board)', async () => {
      await t.request('GET', '/rfqs?categoryId=c1', { as: MINE });
      expect(service.findOpen).toHaveBeenCalledWith('c1', undefined, 'mine1');
    });
  });

  describe('PATCH /rfqs/:id/status validation', () => {
    it('passes a valid status through with the caller', async () => {
      const res = await t.request('PATCH', '/rfqs/r1/status', { as: MINE, body: { status: 'CLOSED' } });
      expect(res.status).toBe(200);
      expect(service.setStatus).toHaveBeenCalledWith('r1', MINE, 'CLOSED');
    });

    it.each([{ status: 'banana' }, {}])('rejects body %j with 400 before the service runs', async (body) => {
      const res = await t.request('PATCH', '/rfqs/r1/status', { as: MINE, body });
      expect(res.status).toBe(400);
      expect(service.setStatus).not.toHaveBeenCalled();
    });

    it('requires sign-in', async () => {
      expect((await t.request('PATCH', '/rfqs/r1/status', { body: { status: 'CLOSED' } })).status).toBe(401);
    });
  });

  it('attaches the expected guards', () => {
    expect(guardsOn(RfqsController, 'findMine')).toContain(JwtAuthGuard);
    expect(guardsOn(RfqsController, 'setStatus')).toContain(JwtAuthGuard);
    expect(guardsOn(RfqsController, 'create')).toContain(JwtAuthGuard);
    expect(guardsOn(RfqsController, 'findOne')).toContain(JwtOptionalAuthGuard);
  });
});
