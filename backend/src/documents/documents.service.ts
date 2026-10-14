import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { DocumentStatus, VerificationStatus } from '@prisma/client';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  // Submitting a document puts an unverified (or previously rejected)
  // company into PENDING, which is what lands it in the verifier's queue.
  // A VERIFIED company stays VERIFIED: a new document is reviewed on its own.
  register(companyId: string, dto: CreateDocumentDto) {
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          companyId,
          docType: dto.docType,
          fileUrl: dto.fileUrl,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      });
      await tx.company.updateMany({
        where: {
          id: companyId,
          verificationStatus: { in: [VerificationStatus.UNVERIFIED, VerificationStatus.REJECTED] },
        },
        data: { verificationStatus: VerificationStatus.PENDING },
      });
      return document;
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
      include: {
        company: { select: { id: true, name: true, type: true, verificationStatus: true } },
      },
      orderBy: { uploadedAt: 'asc' },
    });
  }

  // A document is reviewed once: PENDING -> APPROVED | REJECTED. The update is
  // conditional on it still being PENDING, so two verifiers acting at once
  // can't both decide it — the second gets a 409.
  async review(documentId: string, dto: ReviewDocumentDto, reviewedBy: string) {
    const reviewNote = dto.reviewNote?.trim() || undefined;
    if (dto.status === DocumentStatus.REJECTED && !reviewNote) {
      throw new BadRequestException('Add a note explaining why the document is rejected');
    }

    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');

    const { count } = await this.prisma.document.updateMany({
      where: { id: documentId, status: DocumentStatus.PENDING },
      data: { status: dto.status, reviewedBy, reviewNote },
    });
    if (count !== 1) {
      throw new ConflictException('This document has already been reviewed');
    }

    return this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  }
}
