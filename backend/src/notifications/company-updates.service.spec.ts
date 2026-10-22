import type { ConfigService } from '@nestjs/config';
import { CompanyUpdatesService } from './company-updates.service';
import type { Row } from '../test-utils/users';

const D = (iso: string) => new Date(iso);
// Mid-morning on 15 Oct 2026 in Harare.
const NOW = D('2026-10-15T08:00:00Z');

// Companies (with users) and documents. The fake applies the `where` filters
// CompanyUpdatesService asks for — active users, the reminder window, newer
// renewals — so these tests check who actually gets which email.
function makeDb(companies: Row[], documents: Row[] = []) {
  const outbox: Row[] = [];
  const shapeCompany = (c: Row, select: Row) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    verificationStatus: c.verificationStatus,
    users: c.users.filter((u: Row) => (select.users.where.disabledAt === null ? u.disabledAt == null : true)),
    ...(select.documents
      ? {
          documents: documents.filter(
            (d) => d.companyId === c.id && select.documents.where.status.in.includes(d.status),
          ),
        }
      : {}),
  });
  const companyOf = (d: Row) => companies.find((c) => c.id === d.companyId)!;
  const shapeDoc = (d: Row, select: Row) => ({ ...d, company: shapeCompany(companyOf(d), select.company.select) });
  const db = {
    company: {
      findUniqueOrThrow: async ({ where, select }: Row) => shapeCompany(companies.find((c) => c.id === where.id)!, select),
    },
    document: {
      findUniqueOrThrow: async ({ where, select }: Row) => shapeDoc(documents.find((d) => d.id === where.id)!, select),
      findMany: async ({ where, select }: Row) =>
        documents
          .filter((d) =>
            where.id
              ? where.id.in.includes(d.id)
              : d.status === where.status && d.expiresAt >= where.expiresAt.gte && d.expiresAt <= where.expiresAt.lte,
          )
          .map((d) => shapeDoc(d, select)),
    },
    emailOutbox: {
      createMany: async ({ data, skipDuplicates }: Row) => {
        let count = 0;
        for (const row of data) {
          if (outbox.some((o) => o.key === row.key)) {
            if (!skipDuplicates) throw new Error('duplicate key');
            continue;
          }
          outbox.push(row);
          count++;
        }
        return { count };
      },
    },
  };
  return { db, outbox };
}

const service = () =>
  new CompanyUpdatesService({ get: (k: string) => (k === 'APP_URL' ? 'https://portal.example' : undefined) } as unknown as ConfigService);

const person = (id: string, over: Row = {}): Row => ({ id, email: `${id}@example.test`, fullName: id, disabledAt: null, ...over });
const supplier = (over: Row = {}): Row => ({
  id: 'sup1',
  name: 'Sup & Co',
  type: 'SUPPLIER',
  verificationStatus: 'VERIFIED',
  users: [person('ann'), person('bob'), person('gone', { disabledAt: D('2026-01-01') })],
  ...over,
});
let n = 0;
const doc = (over: Row = {}): Row => ({
  id: `d${++n}`,
  companyId: 'sup1',
  docType: 'TAX_CLEARANCE',
  status: 'APPROVED',
  reviewNote: null,
  expiresAt: D('2026-12-31T00:00:00Z'),
  uploadedAt: D('2026-01-10T00:00:00Z'),
  ...over,
});
const to = (outbox: Row[]) => outbox.map((o) => o.to).sort();

describe('CompanyUpdatesService.enqueueVerificationChange', () => {
  const AT = D('2026-10-15T09:30:00Z');

  it.each([
    ['PENDING', 'VERIFIED', 'Sup & Co is verified on ZW Supplier Portal', 'company-verified'],
    ['PENDING', 'REJECTED', 'Verification declined: Sup & Co', 'company-declined'],
    ['VERIFIED', 'REJECTED', 'Verification declined: Sup & Co', 'company-declined'],
    ['VERIFIED', 'PENDING', 'Sup & Co is no longer verified', 'company-no-longer-verified'],
    ['VERIFIED', 'UNVERIFIED', 'Sup & Co is no longer verified', 'company-no-longer-verified'],
  ])('%s -> %s emails every active user: "%s"', async (from, toStatus, subject, kind) => {
    const { db, outbox } = makeDb([supplier({ verificationStatus: toStatus })]);
    expect(await service().enqueueVerificationChange(db as never, 'sup1', from as never, toStatus as never, AT)).toBe(2);
    expect(to(outbox)).toEqual(['ann@example.test', 'bob@example.test']);
    expect(outbox[0].subject).toBe(subject);
    expect(outbox.map((o) => o.key).sort()).toEqual([`${kind}:sup1:${AT.getTime()}:ann`, `${kind}:sup1:${AT.getTime()}:bob`]);
  });

  it.each([
    ['UNVERIFIED', 'PENDING'],
    ['PENDING', 'UNVERIFIED'],
    ['VERIFIED', 'VERIFIED'],
  ])('%s -> %s tells nobody', async (from, toStatus) => {
    const { db, outbox } = makeDb([supplier()]);
    expect(await service().enqueueVerificationChange(db as never, 'sup1', from as never, toStatus as never, AT)).toBe(0);
    expect(outbox).toEqual([]);
  });

  it('a later change is a new email, not a duplicate', async () => {
    const { db, outbox } = makeDb([supplier()]);
    await service().enqueueVerificationChange(db as never, 'sup1', 'PENDING', 'VERIFIED', AT);
    await service().enqueueVerificationChange(db as never, 'sup1', 'PENDING', 'VERIFIED', D('2026-10-20T09:30:00Z'));
    expect(outbox).toHaveLength(4);
  });
});

describe('CompanyUpdatesService.enqueueDocumentReviewed', () => {
  it('approved: says so, with the date it is valid until', async () => {
    const d = doc({ status: 'APPROVED' });
    const { db, outbox } = makeDb([supplier()], [d]);
    expect(await service().enqueueDocumentReviewed(db as never, d.id)).toBe(2);
    expect(outbox[0].subject).toBe('Your tax clearance was approved');
    expect(outbox[0].text).toContain('Valid until: 31 Dec 2026');
    expect(outbox[0].key).toBe(`doc-approved:${d.id}:ann`);
  });

  it("rejected: gives the verifier's reason", async () => {
    const d = doc({ status: 'REJECTED', reviewNote: 'Scan is unreadable' });
    const { db, outbox } = makeDb([supplier()], [d]);
    await service().enqueueDocumentReviewed(db as never, d.id);
    expect(outbox[0].subject).toBe('Your tax clearance was rejected');
    expect(outbox[0].text).toContain('Reason: Scan is unreadable');
    expect(outbox[0].key).toBe(`doc-rejected:${d.id}:ann`);
  });

  it('queues nothing for a document that is not decided', async () => {
    const d = doc({ status: 'PENDING' });
    const { db, outbox } = makeDb([supplier()], [d]);
    expect(await service().enqueueDocumentReviewed(db as never, d.id)).toBe(0);
    expect(outbox).toEqual([]);
  });
});

describe('CompanyUpdatesService.enqueueDocumentsLapsed', () => {
  it('an approved document that cost the company its verification says so', async () => {
    const d = doc({ status: 'EXPIRED', expiresAt: D('2026-10-14T00:00:00Z') });
    const { db, outbox } = makeDb([supplier({ verificationStatus: 'UNVERIFIED' })], [d]);
    expect(await service().enqueueDocumentsLapsed(db as never, [{ id: d.id, status: 'APPROVED' }], ['sup1'])).toBe(2);
    expect(outbox[0].subject).toBe('Your tax clearance has expired');
    expect(outbox[0].text).toContain("Sup & Co is no longer verified and can't bid");
    expect(outbox[0].key).toBe(`doc-expired:${d.id}:ann`);
  });

  it("an approved document that didn't cost verification just asks for the current one", async () => {
    const d = doc({ status: 'EXPIRED', expiresAt: D('2026-10-14T00:00:00Z') });
    const { db, outbox } = makeDb([supplier()], [d]);
    await service().enqueueDocumentsLapsed(db as never, [{ id: d.id, status: 'APPROVED' }], []);
    expect(outbox[0].text).not.toContain('no longer verified');
    expect(outbox[0].text).toContain('Upload the current tax clearance');
  });

  it('a document that lapsed while waiting for review gets its own wording', async () => {
    const d = doc({ status: 'EXPIRED', expiresAt: D('2026-10-14T00:00:00Z') });
    const { db, outbox } = makeDb([supplier()], [d]);
    await service().enqueueDocumentsLapsed(db as never, [{ id: d.id, status: 'PENDING' }], []);
    expect(outbox[0].subject).toBe('Your tax clearance expired before it was reviewed');
  });

  it('queues nothing for nothing', async () => {
    const { db, outbox } = makeDb([supplier()]);
    expect(await service().enqueueDocumentsLapsed(db as never, [], [])).toBe(0);
    expect(outbox).toEqual([]);
  });
});

describe('CompanyUpdatesService.enqueueExpiryReminders', () => {
  const day = (date: string) => D(`${date}T00:00:00Z`);

  it('reminds once a document is within 30 days, and again within 7 — once each', async () => {
    const soon = doc({ expiresAt: day('2026-11-10') }); // 26 days
    const sooner = doc({ docType: 'NSSA_COMPLIANCE', expiresAt: day('2026-10-20') }); // 5 days
    const later = doc({ docType: 'PRAZ_REGISTRATION', expiresAt: day('2026-12-31') }); // 77 days
    const { db, outbox } = makeDb([supplier()], [soon, sooner, later]);
    expect(await service().enqueueExpiryReminders(db as never, NOW)).toBe(4);
    expect(outbox.map((o) => o.key).sort()).toEqual([
      `doc-expiry-30:${soon.id}:ann`,
      `doc-expiry-30:${soon.id}:bob`,
      `doc-expiry-7:${sooner.id}:ann`,
      `doc-expiry-7:${sooner.id}:bob`,
    ]);
    // The hourly sweep runs again: nothing new.
    expect(await service().enqueueExpiryReminders(db as never, NOW)).toBe(0);
    // A week on, the first document is inside 7 days: its second reminder.
    expect(await service().enqueueExpiryReminders(db as never, D('2026-11-04T08:00:00Z'))).toBe(2);
  });

  it('says how long is left, and warns a verified company it will lose verification', async () => {
    const { db, outbox } = makeDb([supplier()], [doc({ expiresAt: day('2026-10-20') })]);
    await service().enqueueExpiryReminders(db as never, NOW);
    expect(outbox[0].subject).toBe('Your tax clearance expires on 20 Oct 2026');
    expect(outbox[0].text).toContain('expires in 5 days');
    expect(outbox[0].text).toContain('Sup & Co loses its verification');
  });

  it("covers today's expiry, and doesn't threaten an unverified company with losing verification", async () => {
    const { db, outbox } = makeDb([supplier({ verificationStatus: 'PENDING' })], [doc({ expiresAt: day('2026-10-15') })]);
    await service().enqueueExpiryReminders(db as never, NOW);
    expect(outbox[0].text).toContain('expires today');
    expect(outbox[0].text).not.toContain('loses its verification');
  });

  it('skips a document already lapsed, and one with a newer renewal uploaded', async () => {
    const lapsed = doc({ expiresAt: day('2026-10-14') });
    const old = doc({ docType: 'NSSA_COMPLIANCE', expiresAt: day('2026-10-20') });
    const renewal = doc({ docType: 'NSSA_COMPLIANCE', status: 'PENDING', expiresAt: day('2027-10-20'), uploadedAt: day('2026-10-01') });
    const { db, outbox } = makeDb([supplier()], [lapsed, old, renewal]);
    expect(await service().enqueueExpiryReminders(db as never, NOW)).toBe(0);
    expect(outbox).toEqual([]);
  });
});
