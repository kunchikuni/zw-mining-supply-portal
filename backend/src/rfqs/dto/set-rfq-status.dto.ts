import { IsEnum } from 'class-validator';
import { RfqStatus } from '@prisma/client';

export class SetRfqStatusDto {
  @IsEnum(RfqStatus)
  status: RfqStatus;
}
