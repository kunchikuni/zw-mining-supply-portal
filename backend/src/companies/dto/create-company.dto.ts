import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { CompanyType } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  name: string;

  // Only the two public types: PLATFORM companies are created by the
  // create:staff script, never through signup.
  @IsIn([CompanyType.MINE, CompanyType.SUPPLIER])
  type: CompanyType;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  town?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsBoolean()
  isLocallyOwned?: boolean;

  @IsOptional()
  @IsInt()
  yearsOperating?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
