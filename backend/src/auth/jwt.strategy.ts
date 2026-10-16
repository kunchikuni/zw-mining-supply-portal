import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { issuedBeforeCutoff } from './session';

export interface JwtPayload {
  sub: string;
  email: string;
  companyId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  // Whatever this returns becomes `req.user` on any route behind JwtAuthGuard.
  // The token proves who signed in, but the account is re-read on every
  // request: disabling it or changing its password takes effect on the next
  // request rather than when the token expires (7 days), and the role and
  // company come from the database, so a change to them applies at once.
  // JwtOptionalAuthGuard treats a refused token as anonymous.
  async validate(payload: JwtPayload & { iat?: number }): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, companyId: true, role: true, disabledAt: true, tokensValidAfter: true },
    });
    if (!user || user.disabledAt) {
      throw new UnauthorizedException('This account has been disabled');
    }
    if (issuedBeforeCutoff(payload.iat, user.tokensValidAfter)) {
      throw new UnauthorizedException('Your session has ended — sign in again');
    }
    return { sub: user.id, email: user.email, companyId: user.companyId, role: user.role };
  }
}
