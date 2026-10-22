import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  // Joining a company requires a code issued by that company (or minted when
  // it was created) — the company is derived from the code, never the client.
  @IsString()
  @IsNotEmpty()
  inviteCode: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  fullName: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  // The same rule as registration.
  @IsString()
  @MinLength(8)
  newPassword: string;
}

// What a user may change about their own account. Only preferences: role,
// email and company are never settable here (the validation pipe strips them).
export class UpdateMeDto {
  @IsOptional()
  @IsBoolean()
  rfqAlerts?: boolean;
}
