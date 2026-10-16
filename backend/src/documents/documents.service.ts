import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { DocumentStatus, DocumentType, VerificationStatus } from '@prisma/client';
import { DOCUMENT_NAMES, EXPIRY_REQUIRED, NEVER_EXPIRES, isLapsed, lapsedBefore } from './document-expiry';

// Shared by upload and approval: a company registration never takes an
// expiry date, and a document can't be added or approved once it has lapsed.
function checkExpiry(docType: DocumentType, expiresAt: Date | null, explicit: boolean, action: string) {
  if (explicit && expiresAt && NEVER_EXPIRES.includes(docType)) {
    throw new BadRequestException(`A ${DOCUMENT_NAMES[docType]} doesn't expire, so it takes no expiry date`);
  }
  if (isLapsed(expiresAt)) {
    throw new BadRequestException(`This ${DOCUMENT_NAMES[docType]} has already expired, so it can't be ${action}`);
  }
}

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  // Submitting a document puts an unverified (or previously rejected)
  // company into PENDING, which is what lands it in the verifier's queue.
  // A VERIFIED company stays VERIFIED: a new document is reviewed on its own.
  async register(companyId: string, dto: CreateDocumentDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    checkExpiry(dto.docType, expiresAt, true, 'added — upload the current one');

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          companyId,
          docType: dto.docType,
          fileUrl: dto.fileUrl,
          expiresAt,
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
      // Not ones that lapsed while waiting (the hourly sweep marks those
      // EXPIRED; this keeps them out in between).
      where: {
        status: DocumentStatus.PENDING,
        OR: [{ expiresAt: null }, { expiresAt: { gte: lapsedBefore(new Date()) } }],
      },
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
    if (document.status !== DocumentStatus.PENDING) {
      throw new ConflictException(
        document.status === DocumentStatus.EXPIRED
          ? 'This document expired before it was reviewed'
          : 'This document has already been reviewed',
      );
    }

    // Approving fixes the expiry date that counts: the verifier's reading of
    // the document, or — if they leave it as is — the date the company gave.
    // Renewing documents can't be approved without one.
    let expiresAt = document.expiresAt;
    if (dto.status === DocumentStatus.APPROVED) {
      if (dto.expiresAt) expiresAt = new Date(dto.expiresAt);
      if (!expiresAt && EXPIRY_REQUIRED.includes(document.docType)) {
        throw new BadRequestException('Confirm the expiry date shown on the document before approving it');
      }
      checkExpiry(document.docType, expiresAt, Boolean(dto.expiresAt), 'approved — reject it and ask for the current one');
    }

    // Still conditional on PENDING: two verifiers acting at once can't both
    // decide it, and the hourly expiry sweep can't be overwritten.
    const { count } = await this.prisma.document.updateMany({
      where: { id: documentId, status: DocumentStatus.PENDING },
      data: { status: dto.status, reviewedBy, reviewNote, expiresAt },
    });
    if (count !== 1) {
      throw new ConflictException('This document has already been reviewed');
    }

    return this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  }
}
