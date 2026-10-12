import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { SearchCompaniesDto } from './dto/search-companies.dto';
import { UserRole, VerificationStatus, type Document as DocumentModel } from '@prisma/client';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  BOOTSTRAP_INVITE_TTL_MS,
  MEMBER_INVITE_TTL_MS,
  generateInviteCode,
  hashInviteCode,
} from '../auth/invite-code';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  // Creating a company also mints the one-time code that makes its first user
  // the COMPANY_ADMIN. The plaintext is returned here and never stored — the
  // creator passes it to POST /auth/register as step 2 of onboarding.
  async create(dto: CreateCompanyDto) {
    const inviteCode = generateInviteCode();
    const company = await this.prisma.company.create({
      data: {
        ...dto,
        invites: {
          create: {
            codeHash: hashInviteCode(inviteCode),
            role: UserRole.COMPANY_ADMIN,
            expiresAt: new Date(Date.now() + BOOTSTRAP_INVITE_TTL_MS),
          },
        },
      },
    });
    return { ...company, inviteCode };
  }

  async search(filters: SearchCompaniesDto) {
    return this.prisma.company.findMany({
      where: {
        type: filters.type,
        province: filters.province,
        verificationStatus: filters.verificationStatus,
        name: filters.q ? { contains: filters.q, mode: 'insensitive' } : undefined,
        categories: filters.categoryId
          ? { some: { categoryId: filters.categoryId } }
          : undefined,
      },
      include: { categories: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requester?: { companyId: string; role: string } | null) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        categories: { include: { category: true } },
        documents: true,
        ratingsReceived: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');

    const isOwner = requester?.companyId === company.id;
    const isPrivileged = requester ? ['VERIFIER', 'PLATFORM_ADMIN'].includes(requester.role) : false;

    // Compliance documents (tax clearance, CR6/CR14, etc.) are sensitive —
    // only the owning company or a verifier/admin should see the actual
    // file link. Everyone else still sees type + review status, which is
    // enough to judge how verified a company is without leaking the files.
    if (!isOwner && !isPrivileged) {
      company.documents = company.documents.map((doc: DocumentModel) => ({ ...doc, fileUrl: '' }));
    }

    return company;
  }

  // Issues a one-time code for a new teammate. Only an admin of the company
  // (or a platform admin) can do this — otherwise anyone who can see a
  // company id in the directory could attach themselves to it.
  async createInvite(companyId: string, requester: JwtPayload, email?: string) {
    const isCompanyAdmin =
      requester.companyId === companyId && requester.role === UserRole.COMPANY_ADMIN;
    const isPlatformAdmin = requester.role === UserRole.PLATFORM_ADMIN;
    if (!isCompanyAdmin && !isPlatformAdmin) {
      throw new ForbiddenException('Only an admin of this company can invite people to it');
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + MEMBER_INVITE_TTL_MS);
    await this.prisma.invite.create({
      data: {
        companyId,
        codeHash: hashInviteCode(inviteCode),
        role: UserRole.COMPANY_MEMBER,
        email,
        createdBy: requester.sub,
        expiresAt,
      },
    });
    return { inviteCode, expiresAt };
  }

  // Adds categories to the company's listing without touching the rest.
  async attachCategories(companyId: string, categoryIds: string[], requester: JwtPayload) {
    this.assertCanEditCategories(companyId, requester);
    await this.assertCategoriesExist(categoryIds);

    return this.prisma.$transaction(
      categoryIds.map((categoryId) =>
        this.prisma.companyCategory.upsert({
          where: { companyId_categoryId: { companyId, categoryId } },
          create: { companyId, categoryId },
          update: {},
        }),
      ),
    );
  }

  // Makes the company's listing exactly `categoryIds` — adds what's missing,
  // removes what's no longer listed. This is what the category editor saves.
  async setCategories(companyId: string, categoryIds: string[], requester: JwtPayload) {
    this.assertCanEditCategories(companyId, requester);
    await this.assertCategoriesExist(categoryIds);

    await this.prisma.$transaction([
      this.prisma.companyCategory.deleteMany({
        where: { companyId, categoryId: { notIn: categoryIds } },
      }),
      this.prisma.companyCategory.createMany({
        data: categoryIds.map((categoryId) => ({ companyId, categoryId })),
        skipDuplicates: true,
      }),
    ]);

    return this.prisma.companyCategory.findMany({
      where: { companyId },
      include: { category: true },
    });
  }

  private assertCanEditCategories(companyId: string, requester: JwtPayload) {
    const isOwner = requester.companyId === companyId;
    const isPlatformAdmin = requester.role === 'PLATFORM_ADMIN';
    if (!isOwner && !isPlatformAdmin) {
      throw new ForbiddenException('You can only edit your own company\'s categories');
    }
  }

  // Without this an unknown id surfaces as an opaque foreign-key 500.
  private async assertCategoriesExist(categoryIds: string[]) {
    const found = await this.prisma.category.count({ where: { id: { in: categoryIds } } });
    if (found !== new Set(categoryIds).size) {
      throw new BadRequestException('One or more categories do not exist');
    }
  }

  // A company is only search-visible/tender-eligible once a verifier has
  // reviewed its documents — this is the trust layer the whole product depends on.
  setVerificationStatus(companyId: string, status: VerificationStatus) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: { verificationStatus: status },
    });
  }
}
