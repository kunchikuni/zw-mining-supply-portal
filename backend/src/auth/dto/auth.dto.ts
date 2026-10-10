import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

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
