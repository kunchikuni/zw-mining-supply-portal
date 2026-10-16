import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { STAFF_ROLES } from '../staff-accounts';

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  // Staff roles only: mine and supplier users join through invite codes.
  @IsIn(STAFF_ROLES)
  role: UserRole;
}

export class SetStaffDisabledDto {
  @IsBoolean()
  disabled: boolean;
}
