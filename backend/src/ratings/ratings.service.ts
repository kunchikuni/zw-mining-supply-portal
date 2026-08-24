import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  create(data: {
    rfqId: string;
    ratedCompanyId: string;
    authorCompanyId: string;
    score: number;
    comment?: string;
  }) {
    return this.prisma.rating.create({ data });
  }

  async averageForCompany(companyId: string) {
    const result = await this.prisma.rating.aggregate({
      where: { ratedCompanyId: companyId },
      _avg: { score: true },
      _count: true,
    });
    return { average: result._avg.score ?? null, count: result._count };
  }
}
