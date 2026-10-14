import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { createTestApp, guardsOn, TestApp } from '../test-utils/http';
import { user } from '../test-utils/users';

describe('DocumentsController over HTTP', () => {
  const service = {
    register: jest.fn().mockResolvedValue({}),
    findByCompany: jest.fn().mockResolvedValue([]),
    findPendingReview: jest.fn().mockResolvedValue([]),
    review: jest.fn().mockResolvedValue({}),
  };
  const VERIFIER = user('ops', 'VERIFIER');
  const SUPPLIER = user('sup1');
  let t: TestApp;

  beforeAll(async () => {
    // The real RolesGuard runs after the (fake) JWT guard has set req.user.
    t = await createTestApp([DocumentsController], [{ provide: DocumentsService, useValue: service }]);
  });
  afterAll(() => t.close());

  describe('GET /documents/review-queue', () => {
    it('is for verifiers', async () => {
      expect((await t.request('GET', '/documents/review-queue', { as: VERIFIER })).status).toBe(200);
      expect(service.findPendingReview).toHaveBeenCalled();
    });

    it('refuses suppliers (403) and anonymous callers (401)', async () => {
      expect((await t.request('GET', '/documents/review-queue', { as: SUPPLIER })).status).toBe(403);
      expect((await t.request('GET', '/documents/review-queue')).status).toBe(401);
      expect(service.findPendingReview).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /documents/:id/review', () => {
    it('passes the decision through with the verifier email from the token', async () => {
      const res = await t.request('PATCH', '/documents/d1/review', {
        as: VERIFIER,
        body: { status: 'REJECTED', reviewNote: 'Blurry scan', reviewedBy: 'someone-else@x.test' },
      });
      expect(res.status).toBe(200);
      expect(service.review).toHaveBeenCalledWith('d1', { status: 'REJECTED', reviewNote: 'Blurry scan' }, VERIFIER.email);
    });

    it.each([{ status: 'PENDING' }, { status: 'EXPIRED' }, { status: 'banana' }, {}, { status: 'APPROVED', reviewNote: 'x'.repeat(1001) }])(
      'rejects body %j with 400 before the service runs',
      async (body) => {
        expect((await t.request('PATCH', '/documents/d1/review', { as: VERIFIER, body })).status).toBe(400);
        expect(service.review).not.toHaveBeenCalled();
      },
    );

    it('refuses a supplier reviewing its own document (403)', async () => {
      expect((await t.request('PATCH', '/documents/d1/review', { as: SUPPLIER, body: { status: 'APPROVED' } })).status).toBe(403);
      expect(service.review).not.toHaveBeenCalled();
    });
  });

  it('registers a document for the token’s company only', async () => {
    await t.request('POST', '/documents', {
      as: SUPPLIER,
      body: { docType: 'TAX_CLEARANCE', fileUrl: 'https://example.com/t.pdf', companyId: 'someone-else' },
    });
    expect(service.register).toHaveBeenCalledWith('sup1', expect.not.objectContaining({ companyId: expect.anything() }));
  });

  it('attaches JWT + roles guards to the verifier routes', () => {
    for (const handler of ['findPendingReview', 'review']) {
      expect(guardsOn(DocumentsController, handler)).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    }
  });
});
