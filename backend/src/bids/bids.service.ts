import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RfqsService } from '../rfqs/rfqs.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { BidStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class BidsService {
  constructor(
    private prisma: PrismaService,
    private rfqsService: RfqsService,
  ) {}

  async create(supplierCompanyId: string, dto: CreateBidDto) {
    // State before eligibility, so an unknown RFQ is a 404 rather than the
    // misleading "not eligible" 403 it used to surface as.
    await this.rfqsService.assertOpenForBidding(dto.rfqId);

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

  async setStatus(id: string, requester: JwtPayload, status: BidStatus) {
    const bid = await this.prisma.bid.findUnique({ where: { id }, include: { rfq: true } });
    if (!bid) throw new NotFoundException('Bid not found');

    const isPlatformAdmin = requester.role === 'PLATFORM_ADMIN';
    const isBiddingSupplier = requester.companyId === bid.supplierCompanyId;
    const isRfqOwner = requester.companyId === bid.rfq.mineCompanyId;

    // A supplier may only withdraw their own bid; every other transition
    // (shortlist/accept/reject) is the reviewing mine's call.
    const allowed =
      isPlatformAdmin ||
      (status === BidStatus.WITHDRAWN ? isBiddingSupplier : isRfqOwner);

    if (!allowed) {
      throw new ForbiddenException(
        status === BidStatus.WITHDRAWN
          ? 'Only the supplier who submitted this bid can withdraw it'
          : 'Only the mine that posted this RFQ can review its bids',
      );
    }

    return this.prisma.bid.update({ where: { id }, data: { status } });
  }
}
