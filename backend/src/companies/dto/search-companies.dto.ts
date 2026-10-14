import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { CompanyType, VerificationStatus } from '@prisma/client';

export class SearchCompaniesDto {
  @IsOptional()
  @IsIn([CompanyType.MINE, CompanyType.SUPPLIER])
  type?: CompanyType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @IsString()
  q?: string; // free-text match on name
}
