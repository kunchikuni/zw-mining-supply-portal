import { IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateBidDto {
  @IsString()
  rfqId: string;

  @IsString()
  supplierCompanyId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
