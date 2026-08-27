import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RfqsService } from '../rfqs/rfqs.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { BidStatus } from '@prisma/client';

@Injectable()
export class BidsService {
  constructor(
    private prisma: PrismaService,
    private rfqsService: RfqsService,
  ) {}

  async create(supplierCompanyId: string, dto: CreateBidDto) {
    const eligible = await this.rfqsService.supplierIsEligible(dto.rfqId, supplierCompanyId);
    if (!eligible) {
      throw new ForbiddenException(
        'Supplier must be VERIFIED and listed under this RFQ\'s category to bid',
      );
    }
    return this.prisma.bid.create({ data: { ...dto, supplierCompanyId } });
  }

  findByRfq(rfqId: string) {
    return this.prisma.bid.findMany({
      where: { rfqId },
      include: { supplier: true },
      orderBy: { submittedAt: 'asc' },
    });
  }

  setStatus(id: string, status: BidStatus) {
    return this.prisma.bid.update({ where: { id }, data: { status } });
  }
}
