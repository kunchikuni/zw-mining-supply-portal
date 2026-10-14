import { seesEveryBid, visibleBidsWhere } from './bid-visibility';
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

// The same rule, for anything else that would reveal who won (e.g. ratings).
describe('seesEveryBid', () => {
  const rfq = { mineCompanyId: 'mine1' };

  it('is true for the posting mine and a PLATFORM_ADMIN', () => {
    expect(seesEveryBid(rfq, user('mine1', 'COMPANY_MEMBER'))).toBe(true);
    expect(seesEveryBid(rfq, user('platform', 'PLATFORM_ADMIN'))).toBe(true);
  });

  it('is false for a supplier, another mine, a verifier and anonymous callers', () => {
    expect(seesEveryBid(rfq, user('sup1'))).toBe(false);
    expect(seesEveryBid(rfq, user('mine2', 'COMPANY_ADMIN'))).toBe(false);
    expect(seesEveryBid(rfq, user('verifierco', 'VERIFIER'))).toBe(false);
    expect(seesEveryBid(rfq, null)).toBe(false);
    expect(seesEveryBid(rfq, undefined)).toBe(false);
  });
});
