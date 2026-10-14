import { CompaniesService } from './companies.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { VerificationStatus } from '@prisma/client';
import { asPrisma, Row } from '../test-utils/users';

function makePrisma(companies: Row[], documents: Row[] = []) {
  const calls: Row = {};
  const fake = {
    calls,
    company: {
      findUnique: async ({ where }: Row) => {
        const c = companies.find((x) => x.id === where.id);
        return c ? { id: c.id, type: c.type } : null;
      },
      update: async ({ where, data }: Row) => Object.assign(companies.find((c) => c.id === where.id)!, data),
      findMany: async (args: Row) => {
        calls.findMany = args;
        return [];
      },
    },
    document: {
      count: async ({ where }: Row) =>
        documents.filter((d) => d.companyId === where.companyId && d.status === where.status).length,
    },
  };
  return { fake, service: new CompaniesService(asPrisma<PrismaService>(fake)) };
}

const supplier = (over: Row = {}): Row => ({ id: 'sup1', type: 'SUPPLIER', verificationStatus: 'PENDING', ...over });

describe('CompaniesService.setVerificationStatus', () => {
  it('refuses to mark a company VERIFIED with no approved document (409)', async () => {
    const rows = [supplier()];
    const { service } = makePrisma(rows, [{ companyId: 'sup1', status: 'PENDING' }, { companyId: 'sup1', status: 'REJECTED' }]);
    await expect(service.setVerificationStatus('sup1', 'VERIFIED')).rejects.toMatchObject({ status: 409 });
    expect(rows[0].verificationStatus).toBe('PENDING');
  });

  it('marks it VERIFIED once at least one document is approved', async () => {
    const rows = [supplier()];
    const { service } = makePrisma(rows, [{ companyId: 'sup1', status: 'APPROVED' }]);
    await expect(service.setVerificationStatus('sup1', 'VERIFIED')).resolves.toMatchObject({ verificationStatus: 'VERIFIED' });
  });

  it("doesn't count another company's approved documents", async () => {
    const { service } = makePrisma([supplier()], [{ companyId: 'other', status: 'APPROVED' }]);
    await expect(service.setVerificationStatus('sup1', 'VERIFIED')).rejects.toMatchObject({ status: 409 });
  });

  it.each(['REJECTED', 'PENDING', 'UNVERIFIED'])('always allows %s, documents or not', async (status) => {
    const rows = [supplier({ verificationStatus: 'VERIFIED' })];
    const { service } = makePrisma(rows);
    await expect(service.setVerificationStatus('sup1', status as VerificationStatus)).resolves.toMatchObject({
      verificationStatus: status,
    });
  });

  it('returns 404 for an unknown company and for the platform staff company', async () => {
    const { service } = makePrisma([{ id: 'ops', type: 'PLATFORM', verificationStatus: 'UNVERIFIED' }]);
    await expect(service.setVerificationStatus('nope', 'REJECTED')).rejects.toMatchObject({ status: 404 });
    await expect(service.setVerificationStatus('ops', 'REJECTED')).rejects.toMatchObject({ status: 404 });
  });
});

describe('CompaniesService.verificationQueue', () => {
  it('asks for PENDING companies, excluding the platform company, oldest first, with a document summary', async () => {
    const { fake, service } = makePrisma([]);
    await service.verificationQueue();
    const args = fake.calls.findMany;
    expect(args.where).toEqual({ verificationStatus: 'PENDING', type: { not: 'PLATFORM' } });
    expect(args.orderBy).toEqual({ updatedAt: 'asc' });
    // A summary only — no file links in the queue payload.
    expect(Object.keys(args.select.documents.select).sort()).toEqual(['docType', 'id', 'status', 'uploadedAt']);
  });
});

describe('CompaniesService.search', () => {
  it('never lists the platform staff company when no type is chosen', async () => {
    const { fake, service } = makePrisma([]);
    await service.search({});
    expect(fake.calls.findMany.where.type).toEqual({ not: 'PLATFORM' });
  });

  it('passes an explicit MINE / SUPPLIER filter through', async () => {
    const { fake, service } = makePrisma([]);
    await service.search({ type: 'SUPPLIER' });
    expect(fake.calls.findMany.where.type).toBe('SUPPLIER');
  });
});
