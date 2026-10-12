import { IsEnum } from 'class-validator';
import { BidStatus } from '@prisma/client';

export class SetBidStatusDto {
  @IsEnum(BidStatus)
  status: BidStatus;
}
