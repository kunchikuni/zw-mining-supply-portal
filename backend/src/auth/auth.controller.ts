import { Body, Controller, Get, Ip, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto, RegisterDto, LoginDto, UpdateMeDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // The client address is part of the sign-in throttle. Behind a reverse
  // proxy, Express must trust it (app.set('trust proxy', …)) for this to be
  // the caller's address rather than the proxy's.
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  // The account is the caller's, from the token — there's no way to name
  // someone else's. Returns a fresh token; every other session is signed out.
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }

  // The caller's own account and email preferences. Always the token's user.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto) {
    return this.authService.updateMe(user.sub, dto);
  }
}
