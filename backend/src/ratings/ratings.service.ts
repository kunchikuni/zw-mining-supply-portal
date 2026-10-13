import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BidStatus, Prisma, RfqStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import type { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  // A rating is a mine's verdict on a supplier it actually hired, so it's only
  // accepted when all of these hold:
  //   - the caller's company posted the RFQ (it's the author; never the body)
  //   - the RFQ has been awarded
  //   - the rated company has an ACCEPTED bid on that RFQ
  //   - this mine hasn't already rated this supplier for this RFQ
  // A split award can have several accepted suppliers; each can be rated once.
  async create(requester: JwtPayload, dto: CreateRatingDto) {
    const rfq = await this.prisma.rfq.findUnique({ where: { id: dto.rfqId } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    if (rfq.mineCompanyId !== requester.companyId) {
      throw new ForbiddenException('Only the mine that posted this RFQ can rate its suppliers');
    }
    if (rfq.status !== RfqStatus.AWARDED) {
      throw new ConflictException('An RFQ can only be rated once it has been awarded');
    }

    const accepted = await this.prisma.bid.findFirst({
      where: { rfqId: rfq.id, supplierCompanyId: dto.ratedCompanyId, status: BidStatus.ACCEPTED },
      select: { id: true },
    });
    if (!accepted) {
      throw new ConflictException('You can only rate a supplier whose bid you accepted on this RFQ');
    }

    try {
      return await this.prisma.rating.create({
        data: {
          rfqId: rfq.id,
          authorCompanyId: requester.companyId,
          ratedCompanyId: dto.ratedCompanyId,
          score: dto.score,
          comment: dto.comment,
        },
      });
    } catch (err) {
      // The unique (rfqId, authorCompanyId, ratedCompanyId) constraint.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You have already rated this supplier for this RFQ');
      }
      throw err;
    }
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
