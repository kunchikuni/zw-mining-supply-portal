import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentStatus } from '@prisma/client';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  register(companyId: string, dto: CreateDocumentDto) {
    return this.prisma.document.create({
      data: {
        companyId,
        docType: dto.docType,
        fileUrl: dto.fileUrl,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  findByCompany(companyId: string) {
    return this.prisma.document.findMany({ where: { companyId } });
  }

  // Manual review queue — MVP has a human verifier check each document
  // (CR6/CR14, ZIMRA tax clearance, NSSA compliance, etc.) before it counts
  // toward a company's verification status.
  findPendingReview() {
    return this.prisma.document.findMany({
      where: { status: DocumentStatus.PENDING },
      include: { company: true },
      orderBy: { uploadedAt: 'asc' },
    });
  }

  review(documentId: string, status: DocumentStatus, reviewedBy: string, reviewNote?: string) {
    return this.prisma.document.update({
      where: { id: documentId },
      data: { status, reviewedBy, reviewNote },
    });
  }
}
