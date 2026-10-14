import { IsEnum } from 'class-validator';
import { VerificationStatus } from '@prisma/client';

export class SetVerificationStatusDto {
  @IsEnum(VerificationStatus)
  status: VerificationStatus;
}
