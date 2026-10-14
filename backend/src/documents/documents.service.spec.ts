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

const pending = (over: Row = {}): Row => ({ id: 'd1', companyId: 'sup1', docType: 'TAX_CLEARANCE', status: 'PENDING', ...over });
const review = (status: DocumentStatus, reviewNote?: string) => ({ status, reviewNote });

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

  it.each(['APPROVED', 'REJECTED', 'EXPIRED'])('refuses to re-review a %s document (409)', async (status) => {
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

describe('DocumentsService.register — submitting puts the company in the verification queue', () => {
  const doc = { docType: 'TAX_CLEARANCE' as const, fileUrl: 'https://example.com/tax.pdf' };

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
