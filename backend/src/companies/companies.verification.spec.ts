import { CompaniesService } from './companies.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { VerificationStatus } from '@prisma/client';
import { asPrisma, Row } from '../test-utils/users';
import type { CompanyUpdatesService } from '../notifications/company-updates.service';

function makePrisma(companies: Row[], documents: Row[] = []) {
  const calls: Row = {};
  const fake = {
    calls,
    company: {
      findUnique: async ({ where }: Row) => {
        const c = companies.find((x) => x.id === where.id);
        return c ? { id: c.id, type: c.type, verificationStatus: c.verificationStatus } : null;
      },
      update: async ({ where, data }: Row) => Object.assign(companies.find((c) => c.id === where.id)!, data),
      findMany: async (args: Row) => {
        calls.findMany = args;
        return calls.queueRows ?? [];
      },
    },
    document: {
      findMany: async ({ where }: Row) =>
        documents
          .filter((d) => d.companyId === where.companyId)
          .map((d) => ({ docType: 'TAX_CLEARANCE', expiresAt: null, reviewedBy: null, ...d })),
    },
  };
  (fake as Row).$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn({ ...fake, isTx: true });
  // Records the verification emails queued, and on which client.
  const companyUpdates = {
    enqueueVerificationChange: async (tx: Row, companyId: string, from: string, to: string) => {
      if (calls.failEmail) throw new Error('simulated outbox failure');
      (calls.emails ??= []).push({ companyId, from, to, inTransaction: tx.isTx === true });
      return 1;
    },
  } as unknown as CompanyUpdatesService;
  return { fake, service: new CompaniesService(asPrisma<PrismaService>(fake), companyUpdates) };
}

const supplier = (over: Row = {}): Row => ({ id: 'sup1', type: 'SUPPLIER', verificationStatus: 'PENDING', ...over });

describe('CompaniesService.setVerificationStatus — telling the company', () => {
  it('hands the old and new status to the emails, inside the same transaction as the change', async () => {
    const { fake, service } = makePrisma([supplier()], [{ companyId: 'sup1', status: 'APPROVED' }]);
    await service.setVerificationStatus('sup1', 'VERIFIED');
    expect(fake.calls.emails).toEqual([{ companyId: 'sup1', from: 'PENDING', to: 'VERIFIED', inTransaction: true }]);
  });

  it('queues nothing when the change is refused (409)', async () => {
    const { fake, service } = makePrisma([supplier()], [{ companyId: 'sup1', status: 'PENDING' }]);
    await expect(service.setVerificationStatus('sup1', 'VERIFIED')).rejects.toMatchObject({ status: 409 });
    expect(fake.calls.emails).toBeUndefined();
  });

  it("fails the change if its email can't be queued (Postgres rolls the update back)", async () => {
    const { fake, service } = makePrisma([supplier({ verificationStatus: 'VERIFIED' })]);
    fake.calls.failEmail = true;
    await expect(service.setVerificationStatus('sup1', 'REJECTED')).rejects.toThrow('simulated outbox failure');
  });
});

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

  describe('expired documents', () => {
    const D = (iso: string) => new Date(iso);
    const approved = (over: Row = {}): Row => ({ companyId: 'sup1', status: 'APPROVED', reviewedBy: 'v', ...over });

    it("refuses VERIFIED while an approved type has lapsed with no renewal, naming it (409)", async () => {
      const rows = [supplier()];
      const docs = [
        approved({ docType: 'COMPANY_REGISTRATION' }),
        approved({ docType: 'TAX_CLEARANCE', status: 'EXPIRED', expiresAt: D('2001-01-01') }),
      ];
      const { service } = makePrisma(rows, docs);
      await expect(service.setVerificationStatus('sup1', 'VERIFIED')).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Tax clearance has expired'),
      });
      expect(rows[0].verificationStatus).toBe('PENDING');
    });

    it('counts an APPROVED document past its date as lapsed even before the sweep marks it', async () => {
      const docs = [approved({ docType: 'COMPANY_REGISTRATION' }), approved({ expiresAt: D('2001-01-01') })];
      const { service } = makePrisma([supplier()], docs);
      await expect(service.setVerificationStatus('sup1', 'VERIFIED')).rejects.toMatchObject({ status: 409 });
    });

    it('allows VERIFIED once the renewal is approved', async () => {
      const docs = [
        approved({ status: 'EXPIRED', expiresAt: D('2001-01-01') }),
        approved({ expiresAt: D('2099-01-01') }),
      ];
      const { service } = makePrisma([supplier()], docs);
      await expect(service.setVerificationStatus('sup1', 'VERIFIED')).resolves.toMatchObject({ verificationStatus: 'VERIFIED' });
    });

    it("doesn't count a document that expired while pending against the company", async () => {
      const docs = [approved({ docType: 'COMPANY_REGISTRATION' }), { companyId: 'sup1', status: 'EXPIRED', expiresAt: D('2001-01-01') }];
      const { service } = makePrisma([supplier()], docs);
      await expect(service.setVerificationStatus('sup1', 'VERIFIED')).resolves.toMatchObject({ verificationStatus: 'VERIFIED' });
    });

    it('needs a current approval: an approved-but-lapsed document alone is not enough (409)', async () => {
      const { service } = makePrisma([supplier()], [approved({ expiresAt: D('2001-01-01') })]);
      await expect(service.setVerificationStatus('sup1', 'VERIFIED')).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Approve at least one'),
      });
    });
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
    expect(Object.keys(args.select.documents.select).sort()).toEqual([
      'docType',
      'expiresAt',
      'id',
      'reviewedBy',
      'status',
      'uploadedAt',
    ]);
  });

  it('adds lapsedDocTypes to each company and drops reviewedBy from its documents', async () => {
    const { fake, service } = makePrisma([]);
    fake.calls.queueRows = [
      {
        id: 'sup1',
        documents: [
          { id: 'a', docType: 'TAX_CLEARANCE', status: 'EXPIRED', expiresAt: new Date('2001-01-01'), reviewedBy: 'v' },
          { id: 'b', docType: 'TAX_CLEARANCE', status: 'PENDING', expiresAt: new Date('2099-01-01'), reviewedBy: null },
        ],
      },
    ];
    const [entry] = await service.verificationQueue();
    expect(entry.lapsedDocTypes).toEqual(['TAX_CLEARANCE']);
    expect(entry.documents.map((d: Row) => Object.keys(d).includes('reviewedBy'))).toEqual([false, false]);
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
