import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { createTestApp, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('CompaniesController over HTTP', () => {
  const service = {
    create: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    verificationQueue: jest.fn().mockResolvedValue([]),
    setVerificationStatus: jest.fn().mockResolvedValue({}),
    attachCategories: jest.fn().mockResolvedValue([]),
    setCategories: jest.fn().mockResolvedValue([]),
    createInvite: jest.fn().mockResolvedValue({}),
  };
  const VERIFIER = user('ops', 'VERIFIER');
  const SUPPLIER = user('sup1');
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([CompaniesController], [{ provide: CompaniesService, useValue: service }]);
  });
  afterAll(() => t.close());

  describe('GET /companies/verification-queue', () => {
    it('routes to the queue, not to findOne("verification-queue")', async () => {
      expect((await t.request('GET', '/companies/verification-queue', { as: VERIFIER })).status).toBe(200);
      expect(service.verificationQueue).toHaveBeenCalled();
      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('refuses suppliers (403) and anonymous callers (401)', async () => {
      expect((await t.request('GET', '/companies/verification-queue', { as: SUPPLIER })).status).toBe(403);
      expect((await t.request('GET', '/companies/verification-queue')).status).toBe(401);
      expect(service.verificationQueue).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /companies/:id/verification-status', () => {
    it('passes a valid status through for a verifier', async () => {
      expect((await t.request('PATCH', '/companies/sup1/verification-status', { as: VERIFIER, body: { status: 'VERIFIED' } })).status).toBe(200);
      expect(service.setVerificationStatus).toHaveBeenCalledWith('sup1', 'VERIFIED');
    });

    it.each([{ status: 'banana' }, {}])('rejects body %j with 400', async (body) => {
      expect((await t.request('PATCH', '/companies/sup1/verification-status', { as: VERIFIER, body })).status).toBe(400);
      expect(service.setVerificationStatus).not.toHaveBeenCalled();
    });

    it('refuses a supplier verifying itself (403)', async () => {
      expect((await t.request('PATCH', '/companies/sup1/verification-status', { as: SUPPLIER, body: { status: 'VERIFIED' } })).status).toBe(403);
      expect(service.setVerificationStatus).not.toHaveBeenCalled();
    });
  });

  describe('the PLATFORM company type is never public', () => {
    it('cannot be chosen at signup (400)', async () => {
      expect((await t.request('POST', '/companies', { body: { name: 'Sneaky Ltd', type: 'PLATFORM' } })).status).toBe(400);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('cannot be used as a directory filter (400)', async () => {
      expect((await t.request('GET', '/companies?type=PLATFORM')).status).toBe(400);
      expect(service.search).not.toHaveBeenCalled();
    });

    it('still accepts MINE and SUPPLIER at signup', async () => {
      for (const type of ['MINE', 'SUPPLIER']) {
        expect((await t.request('POST', '/companies', { body: { name: 'Acme Ltd', type } })).status).toBe(201);
      }
    });
  });
});
