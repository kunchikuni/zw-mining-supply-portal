import { DocumentsService } from './documents.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { DocumentStatus } from '@prisma/client';
import { asPrisma, Row } from '../test-utils/users';

const statusMatches = (current: string, cond: unknown) =>
  cond === undefined ? true : typeof cond === 'string' ? current === cond : (cond as { in: string[] }).in.includes(current);

function makePrisma(documents: Row[] = [], companies: Row[] = []) {
  const state = { documents, companies, beforeUpdate: undefined as undefined | (() => void) };
  const client: Row = {
    document: {
      create: async ({ data }: Row) => {
        const row = { id: `d${state.documents.length + 1}`, status: 'PENDING', ...data };
        state.documents.push(row);
        return row;
      },
      findUnique: async ({ where }: Row) => state.documents.find((d) => d.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: Row) => ({ ...state.documents.find((d) => d.id === where.id) }),
      updateMany: async ({ where, data }: Row) => {
        state.beforeUpdate?.();
        const hit = state.documents.filter((d) => d.id === where.id && statusMatches(d.status, where.status));
        hit.forEach((d) => Object.assign(d, data));
        return { count: hit.length };
      },
    },
    company: {
      updateMany: async ({ where, data }: Row) => {
        const hit = state.companies.filter((c) => c.id === where.id && statusMatches(c.verificationStatus, where.verificationStatus));
        hit.forEach((c) => Object.assign(c, data));
        return { count: hit.length };
      },
    },
  };
  client.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(client);
  return { state, service: new DocumentsService(asPrisma<PrismaService>(client)) };
}

const D = (iso: string) => new Date(iso);
const FUTURE = D('2099-03-31T00:00:00Z');
const pending = (over: Row = {}): Row => ({
  id: 'd1',
  companyId: 'sup1',
  docType: 'TAX_CLEARANCE',
  status: 'PENDING',
  expiresAt: FUTURE,
  ...over,
});
const review = (status: DocumentStatus, reviewNote?: string, expiresAt?: string) => ({ status, reviewNote, expiresAt });

describe('DocumentsService.review — a document is reviewed once', () => {
  it('approves a pending document and records the reviewer from the token', async () => {
    const { service } = makePrisma([pending()]);
    const out = await service.review('d1', review('APPROVED'), 'v@portal.test');
    expect(out).toMatchObject({ status: 'APPROVED', reviewedBy: 'v@portal.test' });
  });

  it('rejects with a note, trimmed', async () => {
    const { service } = makePrisma([pending()]);
    const out = await service.review('d1', review('REJECTED', '  Expired certificate  '), 'v@portal.test');
    expect(out).toMatchObject({ status: 'REJECTED', reviewNote: 'Expired certificate' });
  });

  it.each([undefined, '', '   '])('refuses a rejection without a reason (note %p) with 400', async (note) => {
    const { state, service } = makePrisma([pending()]);
    await expect(service.review('d1', review('REJECTED', note), 'v@portal.test')).rejects.toMatchObject({ status: 400 });
    expect(state.documents[0].status).toBe('PENDING');
  });

  it('returns 404 for an unknown document', async () => {
    const { service } = makePrisma([]);
    await expect(service.review('nope', review('APPROVED'), 'v@portal.test')).rejects.toMatchObject({ status: 404 });
  });

  it.each(['APPROVED', 'REJECTED', 'EXPIRED'])('refuses to review a %s document (409)', async (status) => {
    const { state, service } = makePrisma([pending({ status })]);
    await expect(service.review('d1', review('APPROVED'), 'v@portal.test')).rejects.toMatchObject({ status: 409 });
    expect(state.documents[0].status).toBe(status);
  });

  it('answers 409 when another verifier decided it first', async () => {
    const { state, service } = makePrisma([pending()]);
    state.beforeUpdate = () => {
      state.documents[0].status = 'REJECTED';
    };
    await expect(service.review('d1', review('APPROVED'), 'v@portal.test')).rejects.toMatchObject({ status: 409 });
    expect(state.documents[0].status).toBe('REJECTED');
  });
});

describe('DocumentsService.review — the verifier confirms the expiry date', () => {
  it("approving keeps the company's date when the verifier leaves it", async () => {
    const { service } = makePrisma([pending()]);
    expect((await service.review('d1', review('APPROVED'), 'v')).expiresAt).toEqual(FUTURE);
  });

  it("approving with a date replaces the company's", async () => {
    const { service } = makePrisma([pending()]);
    const out = await service.review('d1', review('APPROVED', undefined, '2099-01-31'), 'v');
    expect(out.expiresAt).toEqual(D('2099-01-31'));
  });

  it.each(['TAX_CLEARANCE', 'NSSA_COMPLIANCE', 'PRAZ_REGISTRATION'])(
    "won't approve a %s with no expiry date (400), and leaves it pending",
    async (docType) => {
      const { state, service } = makePrisma([pending({ docType, expiresAt: null })]);
      await expect(service.review('d1', review('APPROVED'), 'v')).rejects.toMatchObject({ status: 400 });
      expect(state.documents[0].status).toBe('PENDING');
    },
  );

  it('approves a document type that may go without an expiry date', async () => {
    const { service } = makePrisma([pending({ docType: 'SAFETY_CERTIFICATE', expiresAt: null })]);
    await expect(service.review('d1', review('APPROVED'), 'v')).resolves.toMatchObject({ status: 'APPROVED', expiresAt: null });
  });

  it("won't approve a document whose date has passed (400) — whoever's date it is", async () => {
    const lapsed = makePrisma([pending({ expiresAt: D('2001-01-01') })]);
    await expect(lapsed.service.review('d1', review('APPROVED'), 'v')).rejects.toMatchObject({ status: 400 });
    const corrected = makePrisma([pending()]);
    await expect(corrected.service.review('d1', review('APPROVED', undefined, '2001-01-01'), 'v')).rejects.toMatchObject({ status: 400 });
    expect(corrected.state.documents[0].status).toBe('PENDING');
  });

  it('refuses an expiry date on a company registration (400)', async () => {
    const { service } = makePrisma([pending({ docType: 'COMPANY_REGISTRATION', expiresAt: null })]);
    await expect(service.review('d1', review('APPROVED', undefined, '2099-01-01'), 'v')).rejects.toMatchObject({ status: 400 });
  });

  it("rejecting ignores the date: a rejected document keeps what the company entered", async () => {
    const { service } = makePrisma([pending()]);
    const out = await service.review('d1', review('REJECTED', 'Blurry', '2099-01-31'), 'v');
    expect(out).toMatchObject({ status: 'REJECTED', expiresAt: FUTURE });
  });

  it("explains that an EXPIRED document expired before review", async () => {
    const { service } = makePrisma([pending({ status: 'EXPIRED' })]);
    await expect(service.review('d1', review('APPROVED'), 'v')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('expired before it was reviewed'),
    });
  });
});

describe('DocumentsService.register — expiry dates', () => {
  const add = (service: DocumentsService, docType: string, expiresAt?: string) =>
    service.register('sup1', { docType: docType as any, fileUrl: 'https://example.com/x.pdf', expiresAt });

  it('stores the date it was given', async () => {
    const { state, service } = makePrisma([], [{ id: 'sup1', verificationStatus: 'UNVERIFIED' }]);
    await add(service, 'TAX_CLEARANCE', '2099-12-31');
    expect(state.documents[0].expiresAt).toEqual(D('2099-12-31'));
  });

  it('refuses a document that has already expired (400), and changes nothing', async () => {
    const { state, service } = makePrisma([], [{ id: 'sup1', verificationStatus: 'UNVERIFIED' }]);
    await expect(add(service, 'TAX_CLEARANCE', '2001-01-01')).rejects.toMatchObject({ status: 400 });
    expect(state.documents).toEqual([]);
    expect(state.companies[0].verificationStatus).toBe('UNVERIFIED');
  });

  it('refuses an expiry date on a company registration (400)', async () => {
    const { service } = makePrisma([], [{ id: 'sup1', verificationStatus: 'UNVERIFIED' }]);
    await expect(add(service, 'COMPANY_REGISTRATION', '2099-12-31')).rejects.toMatchObject({ status: 400 });
  });

  it('stores no date for a document without one', async () => {
    const { state, service } = makePrisma([], [{ id: 'sup1', verificationStatus: 'UNVERIFIED' }]);
    await add(service, 'COMPANY_REGISTRATION');
    expect(state.documents[0].expiresAt).toBeNull();
  });
});

describe('DocumentsService.register — submitting puts the company in the verification queue', () => {
  const doc = { docType: 'TAX_CLEARANCE' as const, fileUrl: 'https://example.com/tax.pdf', expiresAt: '2099-12-31' };

  it.each([
    ['UNVERIFIED', 'PENDING'],
    ['REJECTED', 'PENDING'],
    ['PENDING', 'PENDING'],
    ['VERIFIED', 'VERIFIED'],
  ])('moves a %s company to %s', async (from, to) => {
    const { state, service } = makePrisma([], [{ id: 'sup1', verificationStatus: from }]);
    await service.register('sup1', doc);
    expect(state.companies[0].verificationStatus).toBe(to);
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]).toMatchObject({ companyId: 'sup1', status: 'PENDING' });
  });
});
