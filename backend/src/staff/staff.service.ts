import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { sessionCutoff } from '../auth/session';
import { CreateStaffDto } from './dto/staff.dto';
import { STAFF_FIELDS, platformCompany, temporaryPassword } from './staff-accounts';

// Platform admins managing the portal's own staff (verifiers and admins).
// Only accounts in the PLATFORM company are reachable here; mine and supplier
// users are someone else's to manage. Temporary passwords are returned once,
// for the admin to hand over, and the user is asked to replace them.
//
// An admin can't disable or reset their own account. That also means the
// last active platform admin can never be locked out from here: whoever is
// acting is an active admin, and isn't the one being disabled.
@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      where: { company: { type: CompanyType.PLATFORM } },
      select: STAFF_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateStaffDto) {
    const company = await platformCompany(this.prisma);
    const password = temporaryPassword();
    try {
      const user = await this.prisma.user.create({
        data: {
          companyId: company.id,
          email: dto.email.trim(),
          fullName: dto.fullName.trim(),
          role: dto.role,
          passwordHash: await bcrypt.hash(password, 10),
          mustChangePassword: true,
        },
        select: STAFF_FIELDS,
      });
      return { user, temporaryPassword: password };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
  }

  // Disabling refuses sign-in and ends the account's sessions on their next
  // request (JwtStrategy re-reads the account). Enabling restores both.
  async setDisabled(id: string, disabled: boolean, actor: JwtPayload) {
    const user = await this.findStaff(id);
    if (user.id === actor.sub) {
      throw new BadRequestException("You can't disable your own account");
    }
    return this.prisma.user.update({
      where: { id: user.id },
      // Re-disabling keeps the original date.
      data: { disabledAt: disabled ? (user.disabledAt ?? new Date()) : null },
      select: STAFF_FIELDS,
    });
  }

  // A new temporary password, and every existing session signed out.
  async resetPassword(id: string, actor: JwtPayload) {
    const target = await this.findStaff(id);
    if (target.id === actor.sub) {
      throw new BadRequestException('Use "Change password" for your own account');
    }
    const password = temporaryPassword();
    const user = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
        tokensValidAfter: sessionCutoff(),
      },
      select: STAFF_FIELDS,
    });
    return { user, temporaryPassword: password };
  }

  private async findStaff(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, company: { type: CompanyType.PLATFORM } },
      select: { id: true, disabledAt: true },
    });
    if (!user) throw new NotFoundException('Staff member not found');
    return user;
  }
}
