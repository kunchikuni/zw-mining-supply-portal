import { IsIn } from 'class-validator';
import { BidStatus } from '@prisma/client';

// SUPERSEDED isn't settable: only a revision (POST /bids) replaces a bid.
const SETTABLE = Object.values(BidStatus).filter((s) => s !== BidStatus.SUPERSEDED);

export class SetBidStatusDto {
  @IsIn(SETTABLE)
  status: BidStatus;
}
