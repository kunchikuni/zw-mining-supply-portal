import { CompaniesService } from './companies.service';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row, user } from '../test-utils/users';

function makePrisma() {
  const state = {
    categories: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] as Row[],
    links: [] as Row[], // CompanyCategory rows
    findUniqueArgs: undefined as Row | undefined,
  };
  const fake: Row = {
    category: {
      count: async ({ where }: Row) => state.categories.filter((c) => where.id.in.includes(c.id)).length,
    },
    companyCategory: {
      deleteMany: async ({ where }: Row) => {
        const before = state.links.length;
        state.links = state.links.filter(
          (r) => !(r.companyId === where.companyId && !where.categoryId.notIn.includes(r.categoryId)),
        );
        return { count: before - state.links.length };
      },
      createMany: async ({ data, skipDuplicates }: Row) => {
        let count = 0;
        for (const d of data) {
          const dup = state.links.some((r) => r.companyId === d.companyId && r.categoryId === d.categoryId);
          if (dup && skipDuplicates) continue;
          state.links.push({ ...d });
          count++;
        }
        return { count };
      },
      findMany: async ({ where }: Row) => state.links.filter((r) => r.companyId === where.companyId),
      upsert: async ({ where, create }: Row) => {
        const k = where.companyId_categoryId;
        if (!state.links.some((r) => r.companyId === k.companyId && r.categoryId === k.categoryId)) {
          state.links.push({ ...create });
        }
        return create;
      },
    },
    company: {
      findUnique: async (args: Row) => {
        state.findUniqueArgs = args;
        return {
          id: args.where.id,
          documents: [{ id: 'd1', fileUrl: 'https://example.com/secret.pdf' }],
          categories: [],
          ratingsReceived: [{ id: 'rt1', score: 4, comment: 'ok', createdAt: new Date() }],
        };
      },
    },
  };
  fake.$transaction = async (ops: Promise<unknown>[]) => Promise.all(ops);
  return { state, service: new CompaniesService(asPrisma<PrismaService>(fake)) };
}

const OWNER = user('co1', 'COMPANY_ADMIN');
const listed = (state: { links: Row[] }, companyId = 'co1') =>
  state.links.filter((r) => r.companyId === companyId).map((r) => r.categoryId).sort();

describe('CompaniesService.setCategories — replace the whole listing', () => {
  it('adds and removes to match exactly, and is idempotent', async () => {
    const { state, service } = makePrisma();
    await service.setCategories('co1', ['c1', 'c2'], OWNER);
    expect(listed(state)).toEqual(['c1', 'c2']);

    await service.setCategories('co1', ['c2', 'c3'], OWNER);
    expect(listed(state)).toEqual(['c2', 'c3']);

    await service.setCategories('co1', ['c2', 'c3'], OWNER);
    expect(listed(state)).toEqual(['c2', 'c3']);

    await service.setCategories('co1', [], OWNER);
    expect(listed(state)).toEqual([]);
  });

  it("leaves other companies' listings alone", async () => {
    const { state, service } = makePrisma();
    state.links.push({ companyId: 'someone-else', categoryId: 'c1' });
    await service.setCategories('co1', ['c2'], OWNER);
    expect(listed(state, 'someone-else')).toEqual(['c1']);
  });

  it('refuses a non-owner (403) and unknown categories (400)', async () => {
    const { service } = makePrisma();
    await expect(service.setCategories('co1', ['c1'], user('other', 'COMPANY_ADMIN'))).rejects.toMatchObject({ status: 403 });
    await expect(service.setCategories('co1', ['nope'], OWNER)).rejects.toMatchObject({ status: 400 });
  });
});

describe('CompaniesService.attachCategories — add without removing', () => {
  it('adds to the listing and validates the ids too', async () => {
    const { state, service } = makePrisma();
    await service.attachCategories('co1', ['c1'], OWNER);
    await service.attachCategories('co1', ['c2'], OWNER);
    expect(listed(state)).toEqual(['c1', 'c2']);
    await expect(service.attachCategories('co1', ['nope'], OWNER)).rejects.toMatchObject({ status: 400 });
  });
});

describe('CompaniesService.findOne — public profile', () => {
  it('returns ratings without rfqId or author, so they cannot reveal who won which RFQ', async () => {
    const { state, service } = makePrisma();
    const out = await service.findOne('co1', null);
    const select = state.findUniqueArgs?.include.ratingsReceived.select;
    expect(Object.keys(select).sort()).toEqual(['comment', 'createdAt', 'id', 'score']);
    expect(out.ratingsReceived).toHaveLength(1);
  });

  it('hides document links from visitors but shows them to the owner and verifiers', async () => {
    const { service } = makePrisma();
    expect((await service.findOne('co1', null)).documents[0].fileUrl).toBe('');
    expect((await service.findOne('co1', user('other'))).documents[0].fileUrl).toBe('');
    expect((await service.findOne('co1', OWNER)).documents[0].fileUrl).toBe('https://example.com/secret.pdf');
    expect((await service.findOne('co1', user('v', 'VERIFIER'))).documents[0].fileUrl).toBe('https://example.com/secret.pdf');
  });
});
