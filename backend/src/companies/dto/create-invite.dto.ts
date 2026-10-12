import { IsEmail, IsOptional } from 'class-validator';

export class CreateInviteDto {
  // Optional: lock the code to one address so a forwarded or leaked code is
  // useless to anyone else.
  @IsOptional()
  @IsEmail()
  email?: string;
}
