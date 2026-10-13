import { visibleBidsWhere } from './bid-visibility';
import { user } from '../test-utils/users';

// Sealed bids: the single rule behind GET /rfqs/:id and GET /bids?rfqId=.
describe('visibleBidsWhere', () => {
  const rfq = { id: 'r1', mineCompanyId: 'mine1' };

  it('gives the posting mine every bid on the RFQ', () => {
    expect(visibleBidsWhere(rfq, user('mine1', 'COMPANY_ADMIN'))).toEqual({ rfqId: 'r1' });
  });

  it('gives a PLATFORM_ADMIN every bid on the RFQ', () => {
    expect(visibleBidsWhere(rfq, user('platform', 'PLATFORM_ADMIN'))).toEqual({ rfqId: 'r1' });
  });

  it("gives a supplier only its own bids on the RFQ", () => {
    expect(visibleBidsWhere(rfq, user('sup1'))).toEqual({ rfqId: 'r1', supplierCompanyId: 'sup1' });
  });

  it('gives another mine only its own (i.e. none)', () => {
    expect(visibleBidsWhere(rfq, user('mine2', 'COMPANY_ADMIN'))).toEqual({ rfqId: 'r1', supplierCompanyId: 'mine2' });
  });

  it('treats a VERIFIER like any other company', () => {
    expect(visibleBidsWhere(rfq, user('verifierco', 'VERIFIER'))).toEqual({ rfqId: 'r1', supplierCompanyId: 'verifierco' });
  });

  it('gives anonymous callers nothing — null, so the query can be skipped', () => {
    expect(visibleBidsWhere(rfq, null)).toBeNull();
    expect(visibleBidsWhere(rfq, undefined)).toBeNull();
  });
});
