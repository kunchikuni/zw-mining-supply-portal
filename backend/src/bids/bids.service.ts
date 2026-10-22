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
import { visibleBidsWhere } from './bid-visibility';
import { LIVE_BID_STATUSES, withRevisionHistory } from './bid-revisions';
import { BidStatus, RfqStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/jwt.strategy';
import { BidUpdatesService } from '../notifications/bid-updates.service';

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
  // Reached only by the supplier revising its bid (see create).
  [BidStatus.SUPERSEDED]: [],
};

@Injectable()
export class BidsService {
  constructor(
    private prisma: PrismaService,
    private rfqsService: RfqsService,
    private bidUpdates: BidUpdatesService,
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
        'Only a VERIFIED supplier listed under this RFQ\'s category can bid',
      );
    }

    // A supplier has one live offer per RFQ. Bidding again while its bid is
    // SUBMITTED or SHORTLISTED revises it: the old bid becomes SUPERSEDED (kept
    // as history) and the new one, which starts SUBMITTED, points back to it.
    // A shortlisted bid loses its shortlisting this way — the mine shortlisted
    // a price that no longer stands. After a withdrawal or rejection there's no
    // live bid, so a new one is simply a new bid.
    return this.prisma.$transaction(async (tx) => {
      // Lock the RFQ row: bids on one RFQ are placed one at a time, so two
      // submissions can't both find no live bid and both create one. Holding
      // the lock, re-check the RFQ — a bid accepted or the RFQ closed since
      // the check above has committed by now.
      const [locked] = await tx.$queryRaw<{ status: RfqStatus; deadline: Date }[]>`
        SELECT "status", "deadline" FROM "Rfq" WHERE "id" = ${rfq.id} FOR UPDATE`;
      if (!locked || !isBiddingOpen(locked)) {
        throw new ConflictException('This RFQ is no longer accepting bids');
      }

      const live = await tx.bid.findFirst({
        where: { rfqId: rfq.id, supplierCompanyId, status: { in: LIVE_BID_STATUSES } },
        orderBy: { submittedAt: 'desc' },
      });
      if (live) {
        // Conditional, because the mine reviews bids without the RFQ lock: if
        // it accepted or rejected this one a moment ago, that decision stands.
        const { count } = await tx.bid.updateMany({
          where: { id: live.id, status: { in: LIVE_BID_STATUSES } },
          data: { status: BidStatus.SUPERSEDED },
        });
        if (count !== 1) {
          throw new ConflictException('Your bid was just reviewed by the mine — reload and try again');
        }
      }

      return tx.bid.create({ data: { ...dto, supplierCompanyId, revisionOfId: live?.id } });
    });
  }

  // Same sealed-bid rule as GET /rfqs/:id: the posting mine sees every bid,
  // anyone else only their own. One entry per offer, earlier versions under
  // `history`.
  async findByRfq(rfqId: string, requester: JwtPayload) {
    const rfq = await this.prisma.rfq.findUnique({
      where: { id: rfqId },
      select: { id: true, mineCompanyId: true },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const where = visibleBidsWhere(rfq, requester);
    if (!where) return [];
    const bids = await this.prisma.bid.findMany({
      where,
      include: { supplier: true },
      orderBy: { submittedAt: 'asc' },
    });
    return withRevisionHistory(bids);
  }

  // Every bid the caller's company has placed, with enough of the RFQ to show
  // where it stands. `biddingOpen` comes from the same rule the board and the
  // bid check use, so the supplier sees "bidding closed" exactly when a new
  // bid would be refused. A revised bid is listed once, as its latest version.
  async findMine(supplierCompanyId: string) {
    const bids = await this.prisma.bid.findMany({
      where: { supplierCompanyId },
      include: { rfq: { include: { mine: true, category: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    const now = new Date();
    return withRevisionHistory(bids).map((bid) => ({
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

      // The mine's decision is emailed to the supplier, queued in this same
      // transaction. A withdrawal is the supplier's own doing: nothing to tell.
      if (status === BidStatus.SHORTLISTED || status === BidStatus.ACCEPTED || status === BidStatus.REJECTED) {
        await this.bidUpdates.enqueueDecision(tx, id, status);
      }

      return tx.bid.findUniqueOrThrow({ where: { id } });
    });
  }
}
