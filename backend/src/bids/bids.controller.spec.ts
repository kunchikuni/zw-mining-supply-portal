import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { createTestApp, guardsOn, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('BidsController over HTTP', () => {
  const service = {
    findMine: jest.fn().mockResolvedValue([]),
    findByRfq: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    setStatus: jest.fn().mockResolvedValue({}),
  };
  const SUPPLIER = user('sup1');
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([BidsController], [{ provide: BidsService, useValue: service }]);
  });
  afterAll(() => t.close());

  describe('GET /bids/mine', () => {
    it("uses the token's company", async () => {
      const res = await t.request('GET', '/bids/mine', { as: SUPPLIER });
      expect(res.status).toBe(200);
      expect(service.findMine).toHaveBeenCalledWith('sup1');
    });

    it('cannot be pointed at another company with a query parameter', async () => {
      await t.request('GET', '/bids/mine?supplierCompanyId=sup2&companyId=sup2', { as: SUPPLIER });
      expect(service.findMine).toHaveBeenCalledWith('sup1');
    });

    it('requires sign-in', async () => {
      expect((await t.request('GET', '/bids/mine')).status).toBe(401);
    });
  });

  describe('GET /bids?rfqId= (sealed)', () => {
    it('refuses anonymous callers before the service runs', async () => {
      expect((await t.request('GET', '/bids?rfqId=r1')).status).toBe(401);
      expect(service.findByRfq).not.toHaveBeenCalled();
    });

    it.each(['/bids', '/bids?rfqId='])(
      'rejects %s with 400 — no more listing every bid on the platform',
      async (path) => {
        expect((await t.request('GET', path, { as: SUPPLIER })).status).toBe(400);
        expect(service.findByRfq).not.toHaveBeenCalled();
      },
    );

    it('passes rfqId and the caller, and strips extra query parameters', async () => {
      const res = await t.request('GET', '/bids?rfqId=r1&supplierCompanyId=sup2', { as: SUPPLIER });
      expect(res.status).toBe(200);
      expect(service.findByRfq).toHaveBeenCalledWith('r1', SUPPLIER);
    });
  });

  describe('PATCH /bids/:id/status validation', () => {
    it('passes a valid status through with the caller', async () => {
      const res = await t.request('PATCH', '/bids/b1/status', { as: SUPPLIER, body: { status: 'WITHDRAWN' } });
      expect(res.status).toBe(200);
      expect(service.setStatus).toHaveBeenCalledWith('b1', SUPPLIER, 'WITHDRAWN');
    });

    // SUPERSEDED is a real BidStatus, but only a revision (POST /bids) sets it.
    it.each([{ status: 'banana' }, {}, { status: 'SUPERSEDED' }])('rejects body %j with 400 before the service runs', async (body) => {
      expect((await t.request('PATCH', '/bids/b1/status', { as: SUPPLIER, body })).status).toBe(400);
      expect(service.setStatus).not.toHaveBeenCalled();
    });
  });

  it('places the bid as the token’s company, never one in the body', async () => {
    await t.request('POST', '/bids', { as: SUPPLIER, body: { rfqId: 'r1', amount: 100, supplierCompanyId: 'sup2' } });
    expect(service.create).toHaveBeenCalledWith('sup1', expect.not.objectContaining({ supplierCompanyId: expect.anything() }));
  });

  it('strips a revisionOfId from the body: which bid is revised is decided server-side', async () => {
    await t.request('POST', '/bids', { as: SUPPLIER, body: { rfqId: 'r1', amount: 100, revisionOfId: 'someone-elses-bid' } });
    expect(service.create).toHaveBeenCalledWith('sup1', expect.not.objectContaining({ revisionOfId: expect.anything() }));
  });

  it('attaches the expected guards', () => {
    for (const handler of ['create', 'findMine', 'findByRfq', 'setStatus']) {
      expect(guardsOn(BidsController, handler)).toContain(JwtAuthGuard);
    }
  });
});
