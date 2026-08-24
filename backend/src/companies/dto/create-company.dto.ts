import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { CompanyType } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(CompanyType)
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
