import { isCurrentApproval, isLapsed, lapsedBefore, lapsedDocumentTypes } from './document-expiry';
import { endOfHarareDay, startOfHarareDay } from '../harare-day';

const D = (iso: string) => new Date(iso);

describe('Harare calendar days', () => {
  it('start at 22:00Z the evening before and end 24h later', () => {
    // 31 Dec stored as midnight UTC is 02:00 on 31 Dec in Harare.
    expect(startOfHarareDay(D('2026-12-31T00:00:00Z'))).toEqual(D('2026-12-30T22:00:00Z'));
    expect(endOfHarareDay(D('2026-12-31T00:00:00Z'))).toEqual(D('2026-12-31T22:00:00Z'));
    // 23:30Z on the 30th is already the 31st in Harare.
    expect(startOfHarareDay(D('2026-12-30T23:30:00Z'))).toEqual(D('2026-12-30T22:00:00Z'));
  });
});

describe('isLapsed — an expiry date lasts through its whole Harare day', () => {
  const expires = D('2026-12-31T00:00:00Z');

  it('is valid all day on the expiry date, until Harare midnight', () => {
    expect(isLapsed(expires, D('2026-12-31T00:00:00Z'))).toBe(false);
    expect(isLapsed(expires, D('2026-12-31T21:59:59.999Z'))).toBe(false);
  });

  it('has lapsed from 22:00Z (midnight in Harare)', () => {
    expect(isLapsed(expires, D('2026-12-31T22:00:00Z'))).toBe(true);
    expect(isLapsed(expires, D('2027-06-01T00:00:00Z'))).toBe(true);
  });

  it('never lapses without a date', () => {
    expect(isLapsed(null, D('2999-01-01'))).toBe(false);
    expect(isLapsed(undefined, D('2999-01-01'))).toBe(false);
  });

  it('agrees with the database filter (expiresAt < lapsedBefore(now)) across a sweep of times', () => {
    const start = D('2026-12-29T00:00:00Z').getTime();
    for (let t = start; t < start + 4 * 864e5; t += 15 * 60e3) {
      const now = new Date(t);
      for (const day of ['2026-12-30', '2026-12-31', '2027-01-01']) {
        const e = D(`${day}T00:00:00Z`);
        expect(isLapsed(e, now)).toBe(e < lapsedBefore(now));
      }
    }
  });
});

describe('lapsedDocumentTypes', () => {
  const now = D('2026-10-15T10:00:00Z');
  const doc = (docType: string, status: string, expiresAt: string | null, reviewedBy: string | null = 'v') => ({
    docType: docType as any,
    status: status as any,
    expiresAt: expiresAt ? D(expiresAt) : null,
    reviewedBy,
  });

  it('is empty when every approved type is current', () => {
    expect(lapsedDocumentTypes([doc('COMPANY_REGISTRATION', 'APPROVED', null), doc('TAX_CLEARANCE', 'APPROVED', '2027-01-01')], now)).toEqual([]);
  });

  it('names a type whose approval expired with no renewal', () => {
    expect(lapsedDocumentTypes([doc('COMPANY_REGISTRATION', 'APPROVED', null), doc('TAX_CLEARANCE', 'EXPIRED', '2026-01-01')], now)).toEqual(['TAX_CLEARANCE']);
  });

  it('treats an APPROVED document past its date as lapsed before the sweep runs', () => {
    expect(lapsedDocumentTypes([doc('TAX_CLEARANCE', 'APPROVED', '2026-10-14')], now)).toEqual(['TAX_CLEARANCE']);
    // …but the expiry date itself is still a valid day.
    expect(lapsedDocumentTypes([doc('TAX_CLEARANCE', 'APPROVED', '2026-10-15')], now)).toEqual([]);
  });

  it('is satisfied by an approved renewal of the same type, not by a pending one or another type', () => {
    const old = doc('TAX_CLEARANCE', 'EXPIRED', '2026-01-01');
    expect(lapsedDocumentTypes([old, doc('TAX_CLEARANCE', 'APPROVED', '2027-01-01')], now)).toEqual([]);
    expect(lapsedDocumentTypes([old, doc('TAX_CLEARANCE', 'PENDING', '2027-01-01', null)], now)).toEqual(['TAX_CLEARANCE']);
    expect(lapsedDocumentTypes([old, doc('NSSA_COMPLIANCE', 'APPROVED', '2027-01-01')], now)).toEqual(['TAX_CLEARANCE']);
  });

  it('ignores documents that expired while pending, and rejected ones', () => {
    expect(lapsedDocumentTypes([doc('TAX_CLEARANCE', 'EXPIRED', '2026-01-01', null), doc('NSSA_COMPLIANCE', 'REJECTED', '2026-01-01')], now)).toEqual([]);
  });

  it('isCurrentApproval: approved and in date', () => {
    expect(isCurrentApproval(doc('TAX_CLEARANCE', 'APPROVED', '2027-01-01'), now)).toBe(true);
    expect(isCurrentApproval(doc('TAX_CLEARANCE', 'APPROVED', '2026-01-01'), now)).toBe(false);
    expect(isCurrentApproval(doc('TAX_CLEARANCE', 'PENDING', '2027-01-01'), now)).toBe(false);
  });
});
