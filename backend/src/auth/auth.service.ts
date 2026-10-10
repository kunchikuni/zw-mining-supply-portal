import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { hashInviteCode } from './invite-code';

// One message for every way a code can be bad (unknown, expired, used, wrong
// email) so the endpoint can't be used to probe which codes exist.
const INVALID_INVITE = 'This invite code is invalid, expired, or already used';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const codeHash = hashInviteCode(dto.inviteCode);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const invite = await tx.invite.findUnique({ where: { codeHash } });
        const now = new Date();
        if (!invite || invite.usedAt || invite.expiresAt <= now) {
          throw new ForbiddenException(INVALID_INVITE);
        }
        if (invite.email && invite.email.toLowerCase() !== dto.email.toLowerCase()) {
          throw new ForbiddenException(INVALID_INVITE);
        }

        // Claim the code with a conditional update so two concurrent
        // registrations can't both redeem it — only one sees count === 1.
        // If user creation below fails, the transaction rolls this back.
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new ForbiddenException(INVALID_INVITE);

        return tx.user.create({
          data: {
            companyId: invite.companyId,
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            role: invite.role,
          },
        });
      });
      return this.issueToken(user.id, user.email, user.companyId, user.role);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueToken(user.id, user.email, user.companyId, user.role);
  }

  private issueToken(sub: string, email: string, companyId: string, role: string) {
    const payload = { sub, email, companyId, role };
    return { accessToken: this.jwtService.sign(payload) };
  }
}
