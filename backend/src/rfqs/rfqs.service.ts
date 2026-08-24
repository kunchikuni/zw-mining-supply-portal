import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { RfqStatus, VerificationStatus } from '@prisma/client';

@Injectable()
export class RfqsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRfqDto) {
    const rfq = await this.prisma.rfq.create({
      data: { ...dto, deadline: new Date(dto.deadline) },
    });
    // Phase 2: fan out a WhatsApp/SMS/email notification here to every
    // VERIFIED supplier listed under dto.categoryId — see notifications module.
    return rfq;
  }

  findOpen(categoryId?: string, province?: string) {
    return this.prisma.rfq.findMany({
      where: { status: RfqStatus.OPEN, categoryId, province },
      include: { mine: true, category: true },
      orderBy: { deadline: 'asc' },
    });
  }

  async findOne(id: string) {
    const rfq = await this.prisma.rfq.findUnique({
      where: { id },
      include: {
        mine: true,
        category: true,
        bids: { include: { supplier: true } },
      },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  setStatus(id: string, status: RfqStatus) {
    return this.prisma.rfq.update({ where: { id }, data: { status } });
  }

  // Only suppliers whose verificationStatus is VERIFIED and who list this
  // RFQ's category should be eligible to bid — enforced here, not just in UI.
  async supplierIsEligible(rfqId: string, supplierCompanyId: string) {
    const rfq = await this.prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) return false;
    const supplier = await this.prisma.company.findUnique({
      where: { id: supplierCompanyId },
      include: { categories: true },
    });
    if (!supplier || supplier.verificationStatus !== VerificationStatus.VERIFIED) return false;
    return supplier.categories.some((c: { categoryId: string }) => c.categoryId === rfq.categoryId);
  }
}
