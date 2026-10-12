import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { biddingClosesAt, earliestBiddableDeadline, isBiddingOpen } from './bidding-window';
import { visibleBidsWhere } from '../bids/bid-visibility';
import { RfqStatus, VerificationStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/jwt.strategy';

// Where a mine can take an RFQ by hand. AWARDED is deliberately not a target:
// it's reached only by accepting a bid (BidsService.setStatus), so an RFQ can
// never be marked awarded with nobody awarded. AWARDED and CANCELLED are final.
const RFQ_TRANSITIONS: Record<RfqStatus, RfqStatus[]> = {
  [RfqStatus.OPEN]: [RfqStatus.CLOSED, RfqStatus.CANCELLED],
  [RfqStatus.CLOSED]: [RfqStatus.CANCELLED],
  [RfqStatus.AWARDED]: [],
  [RfqStatus.CANCELLED]: [],
};

@Injectable()
export class RfqsService {
  constructor(private prisma: PrismaService) {}

  async create(mineCompanyId: string, dto: CreateRfqDto) {
    const rfq = await this.prisma.rfq.create({
      data: { ...dto, mineCompanyId, deadline: new Date(dto.deadline) },
    });
    // Phase 2: fan out a WhatsApp/SMS/email notification here to every
    // VERIFIED supplier listed under dto.categoryId — see notifications module.
    return this.withBiddingState(rfq);
  }

  // The board of RFQs suppliers can bid on. Nothing closes an RFQ when its
  // deadline passes — it stays OPEN until its mine acts — so the status filter
  // alone would leave dead RFQs on the board forever. They're dropped here,
  // except for the posting mine: this listing is its only way back to its own
  // RFQ (there's no "my RFQs" page), so it still sees them, flagged
  // `biddingOpen: false`, after the live ones.
  async findOpen(
    categoryId?: string,
    province?: string,
    requesterCompanyId?: string,
    now: Date = new Date(),
  ) {
    const rfqs = await this.prisma.rfq.findMany({
      where: {
        status: RfqStatus.OPEN,
        categoryId,
        province,
        OR: [
          { deadline: { gte: earliestBiddableDeadline(now) } },
          ...(requesterCompanyId ? [{ mineCompanyId: requesterCompanyId }] : []),
        ],
      },
      include: { mine: true, category: true },
      orderBy: { deadline: 'asc' },
    });

    const withState = rfqs.map((rfq) => this.withBiddingState(rfq, now));
    const live = withState.filter((rfq) => rfq.biddingOpen);
    // Most recently expired first.
    const expired = withState.filter((rfq) => !rfq.biddingOpen).reverse();
    return [...live, ...expired];
  }

  // Bids are sealed (see bids/bid-visibility.ts): the count is public, but the
  // bids themselves come back only for the posting mine (all of them) or a
  // bidder (just its own). Anonymous callers never trigger the bid query.
  async findOne(id: string, requester?: JwtPayload | null) {
    const rfq = await this.prisma.rfq.findUnique({
      where: { id },
      include: { mine: true, category: true, _count: { select: { bids: true } } },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const where = visibleBidsWhere(rfq, requester);
    const bids = where
      ? await this.prisma.bid.findMany({
          where,
          include: { supplier: true },
          orderBy: { submittedAt: 'asc' },
        })
      : [];
    return this.withBiddingState({ ...rfq, bids });
  }

  // Everything the posting company has put out, whatever its status — the
  // board only lists OPEN RFQs, so without this a closed or awarded RFQ would
  // have no page that links back to it.
  async findMine(mineCompanyId: string) {
    const rfqs = await this.prisma.rfq.findMany({
      where: { mineCompanyId },
      include: { category: true, _count: { select: { bids: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rfqs.map((rfq) => this.withBiddingState(rfq, now));
  }

  async setStatus(id: string, requester: JwtPayload, status: RfqStatus) {
    const rfq = await this.prisma.rfq.findUnique({ where: { id } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const isOwner = rfq.mineCompanyId === requester.companyId;
    const isPlatformAdmin = requester.role === 'PLATFORM_ADMIN';
    if (!isOwner && !isPlatformAdmin) {
      throw new ForbiddenException('Only the mine that posted this RFQ can change its status');
    }

    if (!RFQ_TRANSITIONS[rfq.status].includes(status)) {
      throw new ConflictException(
        `An RFQ that is ${rfq.status.toLowerCase()} can't be changed to ${status.toLowerCase()}`,
      );
    }

    // Conditional on the status we just validated against, so two requests
    // racing from the same starting state can't both be applied.
    const { count } = await this.prisma.rfq.updateMany({
      where: { id, status: rfq.status },
      data: { status },
    });
    if (count !== 1) {
      throw new ConflictException('This RFQ was just changed — reload and try again');
    }

    const updated = await this.prisma.rfq.findUniqueOrThrow({ where: { id } });
    return this.withBiddingState(updated);
  }

  // A bid is only meaningful while the RFQ is OPEN and its deadline hasn't
  // passed. The UI hides the form otherwise, but that's a convenience — this
  // is the enforcement, same as the eligibility check below.
  async assertOpenForBidding(rfqId: string, now: Date = new Date()) {
    const rfq = await this.prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    if (rfq.status !== RfqStatus.OPEN) {
      throw new ConflictException('This RFQ is no longer accepting bids');
    }
    if (now >= biddingClosesAt(rfq.deadline)) {
      throw new ConflictException('The bidding deadline for this RFQ has passed');
    }

    // Returned so callers can make further checks against the RFQ without
    // loading it a second time.
    return rfq;
  }

  // Only suppliers whose verificationStatus is VERIFIED and who list this
  // RFQ's category should be eligible to bid — enforced here, not just in UI.
  async supplierIsEligible(rfqId: string, supplierCompanyId: string) {
    const rfq = await this.prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) return false;
    const supplier = await this.prisma.company.findUnique({
      where: { id: supplierCompanyId },
      include: { categories: true },
    });
    if (!supplier || supplier.verificationStatus !== VerificationStatus.VERIFIED) return false;
    return supplier.categories.some((c: { categoryId: string }) => c.categoryId === rfq.categoryId);
  }

  // `biddingOpen` is derived server-side so the frontend doesn't have to
  // re-implement the deadline rule (and its timezone handling) to decide
  // whether to show the bid form.
  private withBiddingState<T extends { status: RfqStatus; deadline: Date }>(
    rfq: T,
    now: Date = new Date(),
  ): T & { biddingOpen: boolean } {
    return { ...rfq, biddingOpen: isBiddingOpen(rfq, now) };
  }
}
