import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RfqsService } from '../rfqs/rfqs.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { isBiddingOpen } from '../rfqs/bidding-window';
import { BidStatus, RfqStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/jwt.strategy';

// A bid is reviewed once: shortlisting is the only step that can be followed
// by another. ACCEPTED is final because accepted bids are what the local
// content dashboard totals — they shouldn't be re-openable after the fact.
const BID_TRANSITIONS: Record<BidStatus, BidStatus[]> = {
  [BidStatus.SUBMITTED]: [
    BidStatus.SHORTLISTED,
    BidStatus.ACCEPTED,
    BidStatus.REJECTED,
    BidStatus.WITHDRAWN,
  ],
  [BidStatus.SHORTLISTED]: [BidStatus.ACCEPTED, BidStatus.REJECTED, BidStatus.WITHDRAWN],
  [BidStatus.ACCEPTED]: [],
  [BidStatus.REJECTED]: [],
  [BidStatus.WITHDRAWN]: [],
};

@Injectable()
export class BidsService {
  constructor(
    private prisma: PrismaService,
    private rfqsService: RfqsService,
  ) {}

  async create(supplierCompanyId: string, dto: CreateBidDto) {
    // State before eligibility, so an unknown RFQ is a 404 rather than the
    // misleading "not eligible" 403 it used to surface as.
    const rfq = await this.rfqsService.assertOpenForBidding(dto.rfqId);

    // A mine can't bid on its own request — that would let it manufacture
    // competing quotes on an RFQ it also gets to shortlist and award. The
    // frontend hides the form for this case; this is the enforcement.
    if (rfq.mineCompanyId === supplierCompanyId) {
      throw new ForbiddenException('A company cannot bid on its own RFQ');
    }

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

  // Every bid the caller's company has placed, with enough of the RFQ to show
  // where it stands. `biddingOpen` comes from the same rule the board and the
  // bid check use, so the supplier sees "bidding closed" exactly when a new
  // bid would be refused.
  async findMine(supplierCompanyId: string) {
    const bids = await this.prisma.bid.findMany({
      where: { supplierCompanyId },
      include: { rfq: { include: { mine: true, category: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    const now = new Date();
    return bids.map((bid) => ({
      ...bid,
      rfq: { ...bid.rfq, biddingOpen: isBiddingOpen(bid.rfq, now) },
    }));
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

    if (!BID_TRANSITIONS[bid.status].includes(status)) {
      throw new ConflictException(
        `A bid that is ${bid.status.toLowerCase()} can't be changed to ${status.toLowerCase()}`,
      );
    }

    // A cancelled RFQ is dead, so there's nothing left to review. A supplier
    // can still withdraw their own bid from it.
    if (status !== BidStatus.WITHDRAWN && bid.rfq.status === RfqStatus.CANCELLED) {
      throw new ConflictException('This RFQ was cancelled, so its bids can no longer be reviewed');
    }

    // One transaction so a bid can't end up ACCEPTED on an RFQ that still
    // reads OPEN. The bid update is conditional on the status validated
    // above, so two reviewers clicking at once can't both win.
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bid.updateMany({
        where: { id, status: bid.status },
        data: { status },
      });
      if (count !== 1) {
        throw new ConflictException('This bid was just changed — reload and try again');
      }

      // Accepting a bid awards the RFQ. It's deliberately not "the only
      // accepted bid": a split award accepts several, and the RFQ simply
      // stays AWARDED. OPEN and CLOSED are the only states that move.
      if (status === BidStatus.ACCEPTED) {
        await tx.rfq.updateMany({
          where: { id: bid.rfqId, status: { in: [RfqStatus.OPEN, RfqStatus.CLOSED] } },
          data: { status: RfqStatus.AWARDED },
        });
      }

      return tx.bid.findUniqueOrThrow({ where: { id } });
    });
  }
}
