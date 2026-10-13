import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// There's deliberately no authorCompanyId: the author is always the caller's
// own company, taken from the token. The global ValidationPipe whitelists, so
// a client that sends one has it stripped before it reaches the service.
export class CreateRatingDto {
  @IsString()
  @IsNotEmpty()
  rfqId: string;

  @IsString()
  @IsNotEmpty()
  ratedCompanyId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
