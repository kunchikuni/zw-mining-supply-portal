import { IsNotEmpty, IsString } from 'class-validator';

export class FindBidsQueryDto {
  // Required: without it the old handler listed every bid on the platform.
  @IsString()
  @IsNotEmpty()
  rfqId: string;
}
