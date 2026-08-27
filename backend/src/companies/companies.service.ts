import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { SearchCompaniesDto } from './dto/search-companies.dto';
import { VerificationStatus } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateCompanyDto) {
    return this.prisma.company.create({ data: dto });
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
      company.documents = company.documents.map((doc) => ({ ...doc, fileUrl: '' }));
    }

    return company;
  }

  attachCategories(companyId: string, categoryIds: string[]) {
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

  // A company is only search-visible/tender-eligible once a verifier has
  // reviewed its documents — this is the trust layer the whole product depends on.
  setVerificationStatus(companyId: string, status: VerificationStatus) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: { verificationStatus: status },
    });
  }
}
