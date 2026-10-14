import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentStatus } from '@prisma/client';

// A verifier's decision on one document. Only the two outcomes are valid
// here: PENDING is where documents start and EXPIRED isn't a review result.
export class ReviewDocumentDto {
  @IsIn([DocumentStatus.APPROVED, DocumentStatus.REJECTED])
  status: DocumentStatus;

  // Required when rejecting (enforced in the service, which knows the
  // status) — the supplier needs to know what to fix.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
