import { Prisma } from '@prisma/client';
import { RatingsService } from './ratings.service';
import type { PrismaService } from '../prisma/prisma.service';
import { asPrisma, Row, user } from '../test-utils/users';

function makePrisma(rfqStatus = 'AWARDED') {
  const rfqs: Row[] = [{ id: 'r1', mineCompanyId: 'mine1', status: rfqStatus }];
  const bids: Row[] = [
    { rfqId: 'r1', supplierCompanyId: 'sup1', status: 'ACCEPTED' },
    { rfqId: 'r1', supplierCompanyId: 'sup2', status: 'ACCEPTED' }, // split award
    { rfqId: 'r1', supplierCompanyId: 'sup3', status: 'REJECTED' },
    { rfqId: 'r1', supplierCompanyId: 'sup4', status: 'SUBMITTED' },
    { rfqId: 'r1', supplierCompanyId: 'sup5', status: 'WITHDRAWN' },
  ];
  const ratings: Row[] = [];
  const fake = {
    ratings,
    rfq: { findUnique: async ({ where }: Row) => rfqs.find((r) => r.id === where.id) ?? null },
    bid: {
      findFirst: async ({ where }: Row) =>
        bids.find(
          (b) => b.rfqId === where.rfqId && b.supplierCompanyId === where.supplierCompanyId && b.status === where.status,
        )
          ? { id: 'bid' }
          : null,
    },
    rating: {
      // Behaves like the @@unique([rfqId, authorCompanyId, ratedCompanyId]) constraint.
      create: async ({ data }: Row): Promise<Row> => {
        const dup = ratings.some(
          (r) => r.rfqId === data.rfqId && r.authorCompanyId === data.authorCompanyId && r.ratedCompanyId === data.ratedCompanyId,
        );
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        const row = { id: `rt${ratings.length + 1}`, ...data };
        ratings.push(row);
        return row;
      },
    },
  };
  return { fake, service: new RatingsService(asPrisma<PrismaService>(fake)) };
}

const MINE = user('mine1', 'COMPANY_ADMIN');
const rating = (over: Row = {}) => ({ rfqId: 'r1', ratedCompanyId: 'sup1', score: 4, comment: 'On time', ...over });

describe('RatingsService.create — who may rate what', () => {
  it("stores the rating with the author taken from the caller's token", async () => {
    const { fake, service } = makePrisma();
    const out = await service.create(MINE, rating());
    expect(out).toMatchObject({ authorCompanyId: 'mine1', ratedCompanyId: 'sup1', score: 4 });
    expect(fake.ratings).toHaveLength(1);
  });

  it('lets each supplier in a split award be rated', async () => {
    const { fake, service } = makePrisma();
    await service.create(MINE, rating({ ratedCompanyId: 'sup1' }));
    await service.create(MINE, rating({ ratedCompanyId: 'sup2' }));
    expect(fake.ratings).toHaveLength(2);
  });

  it.each([
    ['a different mine', user('mine2', 'COMPANY_ADMIN')],
    ['the supplier itself', user('sup1')],
    ['a PLATFORM_ADMIN (a rating is the mine’s verdict)', user('platform', 'PLATFORM_ADMIN')],
  ])('refuses %s (403) and stores nothing', async (_label, requester) => {
    const { fake, service } = makePrisma();
    await expect(service.create(requester, rating({ score: 5 }))).rejects.toMatchObject({ status: 403 });
    expect(fake.ratings).toHaveLength(0);
  });

  it.each(['OPEN', 'CLOSED', 'CANCELLED'])('refuses an RFQ that is %s, not awarded (409)', async (status) => {
    const { fake, service } = makePrisma(status);
    await expect(service.create(MINE, rating())).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/awarded/) });
    expect(fake.ratings).toHaveLength(0);
  });

  it.each([
    ['sup3', 'REJECTED'],
    ['sup4', 'SUBMITTED'],
    ['sup5', 'WITHDRAWN'],
    ['sup9', 'never placed'],
  ])('refuses rating %s, whose bid is %s (409)', async (ratedCompanyId) => {
    const { fake, service } = makePrisma();
    await expect(service.create(MINE, rating({ ratedCompanyId }))).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/accepted/),
    });
    expect(fake.ratings).toHaveLength(0);
  });

  it('refuses a second rating for the same supplier and RFQ (409) and keeps the first', async () => {
    const { fake, service } = makePrisma();
    await service.create(MINE, rating());
    await expect(service.create(MINE, rating({ score: 1, comment: 'changed my mind' }))).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/already rated/),
    });
    expect(fake.ratings).toHaveLength(1);
    expect(fake.ratings[0].score).toBe(4);
  });

  it('returns 404 for an unknown RFQ', async () => {
    const { service } = makePrisma();
    await expect(service.create(MINE, rating({ rfqId: 'nope' }))).rejects.toMatchObject({ status: 404 });
  });

  it('rethrows any other database error untouched (not turned into a 409)', async () => {
    const { fake, service } = makePrisma();
    fake.rating.create = async () => {
      throw new Error('connection reset');
    };
    await expect(service.create(MINE, rating())).rejects.toThrow('connection reset');
  });
});
