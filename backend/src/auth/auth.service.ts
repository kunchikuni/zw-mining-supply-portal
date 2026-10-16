import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, RegisterDto, LoginDto } from './dto/auth.dto';
import { hashInviteCode } from './invite-code';
import { sessionCutoff } from './session';

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
    // Checked after the password, so it tells nobody but the account holder
    // that the account exists.
    if (user.disabledAt) {
      throw new UnauthorizedException('This account has been disabled — contact a portal administrator');
    }
    // mustChangePassword: signed in with a temporary password an admin issued;
    // the app sends the user to choose their own.
    return {
      ...this.issueToken(user.id, user.email, user.companyId, user.role),
      mustChangePassword: user.mustChangePassword,
    };
  }

  // Needs the current password, even though the caller is signed in, so a
  // borrowed session can't lock the owner out. Every other session is signed
  // out (tokensValidAfter); this one carries on with the fresh token returned.
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Your session has ended — sign in again');
    // 400, not 401: the session is fine, the password typed isn't.
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Your current password is incorrect');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Choose a new password that differs from your current one');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 10),
        mustChangePassword: false,
        tokensValidAfter: sessionCutoff(),
      },
    });
    return this.issueToken(user.id, user.email, user.companyId, user.role);
  }

  private issueToken(sub: string, email: string, companyId: string, role: string) {
    const payload = { sub, email, companyId, role };
    return { accessToken: this.jwtService.sign(payload) };
  }
}
