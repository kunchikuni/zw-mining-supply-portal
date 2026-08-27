import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRfqDto {
  @IsString()
  categoryId: string;

  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(10)
  description: string;

  @IsOptional()
  @IsString()
  quantity?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsDateString()
  deadline: string;
}
