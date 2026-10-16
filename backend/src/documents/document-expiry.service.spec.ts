import { DocumentExpiryService, msUntilNextHour } from './document-expiry.service';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row } from '../test-utils/users';

const D = (iso: string) => new Date(iso);
// Mid-morning on 15 Oct 2026 in Harare: anything dated 14 Oct or earlier has lapsed.
const NOW = D('2026-10-15T08:00:00Z');
const inList = (value: string, cond: Row | string) => (typeof cond === 'string' ? value === cond : cond.in.includes(value));

function makeDb(documents: Row[], companies: Row[]) {
  const fake = {
    document: {
      findMany: async ({ where }: Row) =>
        documents
          .filter((d) =>
            where.companyId !== undefined
              ? d.companyId === where.companyId
              : inList(d.status, where.status) && d.expiresAt != null && d.expiresAt < where.expiresAt.lt,
          )
          .map((d) => ({ ...d })),
      updateMany: async ({ where, data }: Row) => {
        const hit = documents.filter((d) => where.id.in.includes(d.id) && inList(d.status, where.status));
        hit.forEach((d) => Object.assign(d, data));
        return { count: hit.length };
      },
    },
    company: {
      updateMany: async ({ where, data }: Row) => {
        const hit = companies.filter((c) => c.id === where.id && c.verificationStatus === where.verificationStatus);
        hit.forEach((c) => Object.assign(c, data));
        return { count: hit.length };
      },
    },
  };
  return new DocumentExpiryService(asPrisma<PrismaService>(fake));
}

let n = 0;
const doc = (companyId: string, docType: string, status: string, expiresAt: string | null, reviewedBy: string | null = 'v') => ({
  id: `d${++n}`,
  companyId,
  docType,
  status,
  expiresAt: expiresAt ? D(expiresAt) : null,
  reviewedBy,
});
const company = (id: string, verificationStatus = 'VERIFIED') => ({ id, verificationStatus });

describe('DocumentExpiryService.run', () => {
  it('marks lapsed APPROVED and PENDING documents EXPIRED, and leaves the rest', async () => {
    const docs = [
      doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-14'),
      doc('a', 'NSSA_COMPLIANCE', 'PENDING', '2026-09-30', null),
      doc('a', 'PRAZ_REGISTRATION', 'APPROVED', '2026-10-15'), // its last valid day
      doc('a', 'COMPANY_REGISTRATION', 'APPROVED', null),
      doc('a', 'SAFETY_CERTIFICATE', 'REJECTED', '2026-01-01'),
    ];
    const out = await makeDb(docs, [company('a', 'PENDING')]).run(NOW);
    expect(docs.map((d) => d.status)).toEqual(['EXPIRED', 'EXPIRED', 'APPROVED', 'APPROVED', 'REJECTED']);
    expect(out.expired).toBe(2);
  });

  it('takes verification away when an approved type lapses with nothing to replace it', async () => {
    const companies = [company('a')];
    const docs = [doc('a', 'COMPANY_REGISTRATION', 'APPROVED', null), doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-14')];
    const out = await makeDb(docs, companies).run(NOW);
    expect(companies[0].verificationStatus).toBe('UNVERIFIED');
    expect(out.companiesUnverified).toEqual(['a']);
  });

  it('sends it to PENDING instead when a renewal is already waiting for review', async () => {
    const companies = [company('a')];
    const docs = [doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-14'), doc('a', 'TAX_CLEARANCE', 'PENDING', '2027-10-14', null)];
    await makeDb(docs, companies).run(NOW);
    expect(companies[0].verificationStatus).toBe('PENDING');
  });

  it('keeps it VERIFIED when the renewal was approved before the old one lapsed', async () => {
    const companies = [company('a')];
    const docs = [doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-14'), doc('a', 'TAX_CLEARANCE', 'APPROVED', '2027-10-14')];
    const out = await makeDb(docs, companies).run(NOW);
    expect(docs[0].status).toBe('EXPIRED');
    expect(companies[0].verificationStatus).toBe('VERIFIED');
    expect(out.companiesUnverified).toEqual([]);
  });

  it("doesn't touch a company when only a pending document lapsed", async () => {
    const companies = [company('a')];
    const docs = [doc('a', 'TAX_CLEARANCE', 'APPROVED', '2027-01-01'), doc('a', 'NSSA_COMPLIANCE', 'PENDING', '2026-10-01', null)];
    await makeDb(docs, companies).run(NOW);
    expect(companies[0].verificationStatus).toBe('VERIFIED');
  });

  it("only changes VERIFIED companies — a PENDING or REJECTED one keeps its status", async () => {
    const companies = [company('a', 'PENDING'), company('b', 'REJECTED')];
    const docs = [doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-01'), doc('b', 'TAX_CLEARANCE', 'APPROVED', '2026-10-01')];
    await makeDb(docs, companies).run(NOW);
    expect(companies.map((c) => c.verificationStatus)).toEqual(['PENDING', 'REJECTED']);
  });

  it('keeps companies apart: one losing verification leaves another alone', async () => {
    const companies = [company('a'), company('b')];
    const docs = [doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-01'), doc('b', 'TAX_CLEARANCE', 'APPROVED', '2027-10-01')];
    await makeDb(docs, companies).run(NOW);
    expect(companies.map((c) => c.verificationStatus)).toEqual(['UNVERIFIED', 'VERIFIED']);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const companies = [company('a')];
    const docs = [doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-01')];
    const service = makeDb(docs, companies);
    await service.run(NOW);
    const before = JSON.stringify({ docs, companies });
    expect(await service.run(NOW)).toEqual({ expired: 0, companiesUnverified: [] });
    expect(JSON.stringify({ docs, companies })).toBe(before);
  });

  it('lapses at Harare midnight: still valid at 21:59Z on the date, expired at 22:00Z', async () => {
    const companies = [company('a')];
    const docs = [doc('a', 'TAX_CLEARANCE', 'APPROVED', '2026-10-15')];
    const service = makeDb(docs, companies);
    await service.run(D('2026-10-15T21:59:00Z'));
    expect(docs[0].status).toBe('APPROVED');
    await service.run(D('2026-10-15T22:00:01Z'));
    expect(docs[0].status).toBe('EXPIRED');
    expect(companies[0].verificationStatus).toBe('UNVERIFIED');
  });
});

describe('msUntilNextHour', () => {
  it('lands one second after the next top of the hour', () => {
    expect(msUntilNextHour(D('2026-10-15T21:59:00Z'))).toBe(61_000);
    expect(msUntilNextHour(D('2026-10-15T22:00:00Z'))).toBe(3_601_000);
    expect(msUntilNextHour(D('2026-10-15T21:30:00.500Z'))).toBe(30 * 60_000 - 500 + 1000);
  });
});
