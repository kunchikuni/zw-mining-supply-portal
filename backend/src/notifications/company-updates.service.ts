import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentStatus, Prisma, VerificationStatus } from '@prisma/client';
import { DOCUMENT_NAMES } from '../documents/document-expiry';
import { harareCalendarDay } from '../harare-day';
import { appUrlFrom } from './email-layout';
import {
  buildDocumentExpiredEmail,
  buildDocumentReviewedEmail,
  buildExpiryReminderEmail,
  buildVerificationEmail,
  VerificationNews,
} from './company-update-emails';

const DAY_MS = 24 * 60 * 60 * 1000;

// Reminders go out this many days before an approved document's expiry date:
// one when it comes within 30 days, another within 7.
export const REMINDER_WINDOW_DAYS = 30;
export const FINAL_REMINDER_DAYS = 7;

// Every active user at the company: verification and documents are the
// company's, not one person's.
const ACTIVE_USERS = { where: { disabledAt: null }, select: { id: true, email: true, fullName: true } } as const;
const COMPANY_FIELDS = { id: true, name: true, type: true, verificationStatus: true, users: ACTIVE_USERS } as const;

type Company = Prisma.CompanyGetPayload<{ select: typeof COMPANY_FIELDS }>;
type User = Company['users'][number];
type Email = { key: string; subject: string; text: string; html: string };

// Queues the emails that tell a company about its verification and its
// documents: a verifier's decision on the company or on a document, a
// document lapsing (from the hourly sweep), and reminders before one lapses.
// Decisions are queued inside the transaction that makes them, so a decision
// that rolls back emails nobody; EmailOutboxService sends them. These go out
// whatever the user's new-RFQ alert setting: they're about their own company.
@Injectable()
export class CompanyUpdatesService {
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    this.appUrl = appUrlFrom(config);
  }

  // `at` tells one change from the next: a company can be verified, lose it,
  // and be verified again, and each is its own email.
  async enqueueVerificationChange(
    tx: Prisma.TransactionClient,
    companyId: string,
    from: VerificationStatus,
    to: VerificationStatus,
    at: Date,
  ) {
    const news: VerificationNews | null =
      from === to
        ? null
        : to === VerificationStatus.VERIFIED
          ? 'VERIFIED'
          : to === VerificationStatus.REJECTED
            ? 'DECLINED'
            : from === VerificationStatus.VERIFIED
              ? 'NO_LONGER_VERIFIED'
              : null; // e.g. UNVERIFIED <-> PENDING: nothing the company needs to hear
    if (!news) return 0;
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: COMPANY_FIELDS });
    const kind = news.toLowerCase().replace(/_/g, '-');
    return this.queue(tx, company, (user) => ({
      key: `company-${kind}:${companyId}:${at.getTime()}:${user.id}`,
      ...buildVerificationEmail(news, to, company, user, this.appUrl),
    }));
  }

  // A document is reviewed once (PENDING -> APPROVED | REJECTED).
  async enqueueDocumentReviewed(tx: Prisma.TransactionClient, documentId: string) {
    const doc = await tx.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { id: true, docType: true, status: true, reviewNote: true, expiresAt: true, company: { select: COMPANY_FIELDS } },
    });
    if (doc.status !== DocumentStatus.APPROVED && doc.status !== DocumentStatus.REJECTED) return 0;
    const approved = doc.status === DocumentStatus.APPROVED;
    return this.queue(tx, doc.company, (user) => ({
      key: `doc-${approved ? 'approved' : 'rejected'}:${doc.id}:${user.id}`,
      ...buildDocumentReviewedEmail(
        approved,
        { name: DOCUMENT_NAMES[doc.docType], expiresAt: doc.expiresAt },
        doc.reviewNote,
        doc.company,
        user,
        this.appUrl,
      ),
    }));
  }

  // From the hourly sweep: the documents it just marked EXPIRED, with the
  // status each had (APPROVED or PENDING), and the companies that lost their
  // verification because of them.
  async enqueueDocumentsLapsed(
    tx: Prisma.TransactionClient,
    lapsed: Array<{ id: string; status: DocumentStatus }>,
    companiesUnverified: string[],
  ) {
    if (lapsed.length === 0) return 0;
    const wasApproved = new Map(lapsed.map((d) => [d.id, d.status === DocumentStatus.APPROVED]));
    const docs = await tx.document.findMany({
      where: { id: { in: lapsed.map((d) => d.id) } },
      select: { id: true, docType: true, expiresAt: true, companyId: true, company: { select: COMPANY_FIELDS } },
    });
    let count = 0;
    for (const doc of docs) {
      const expiresAt = doc.expiresAt;
      if (!expiresAt) continue;
      const approved = wasApproved.get(doc.id) ?? false;
      const lostVerification = approved && companiesUnverified.includes(doc.companyId);
      count += await this.queue(tx, doc.company, (user) => ({
        key: `doc-expired:${doc.id}:${user.id}`,
        ...buildDocumentExpiredEmail(
          approved,
          lostVerification,
          { name: DOCUMENT_NAMES[doc.docType], expiresAt },
          doc.company,
          user,
          this.appUrl,
        ),
      }));
    }
    return count;
  }

  // Approved documents expiring within 30 days, unless the company has
  // already uploaded a newer one of the same type (approved or waiting for
  // review). One reminder when a document enters the 30-day window and one
  // within 7 days; the keys make the hourly sweep send each only once.
  async enqueueExpiryReminders(db: Prisma.TransactionClient, now: Date = new Date()) {
    const today = harareCalendarDay(now);
    const docs = await db.document.findMany({
      where: {
        status: DocumentStatus.APPROVED,
        expiresAt: { gte: today, lte: new Date(today.getTime() + REMINDER_WINDOW_DAYS * DAY_MS) },
      },
      select: {
        id: true,
        docType: true,
        expiresAt: true,
        uploadedAt: true,
        company: {
          select: {
            ...COMPANY_FIELDS,
            documents: {
              where: { status: { in: [DocumentStatus.APPROVED, DocumentStatus.PENDING] } },
              select: { id: true, docType: true, uploadedAt: true },
            },
          },
        },
      },
    });
    let count = 0;
    for (const doc of docs) {
      const expiresAt = doc.expiresAt;
      if (!expiresAt) continue;
      const renewed = doc.company.documents.some(
        (d) => d.id !== doc.id && d.docType === doc.docType && d.uploadedAt > doc.uploadedAt,
      );
      if (renewed) continue;
      const daysLeft = Math.round((expiresAt.getTime() - today.getTime()) / DAY_MS);
      const stage = daysLeft <= FINAL_REMINDER_DAYS ? FINAL_REMINDER_DAYS : REMINDER_WINDOW_DAYS;
      const verified = doc.company.verificationStatus === VerificationStatus.VERIFIED;
      count += await this.queue(db, doc.company, (user) => ({
        key: `doc-expiry-${stage}:${doc.id}:${user.id}`,
        ...buildExpiryReminderEmail(
          daysLeft,
          verified,
          { name: DOCUMENT_NAMES[doc.docType], expiresAt },
          doc.company,
          user,
          this.appUrl,
        ),
      }));
    }
    return count;
  }

  // One email per active user at the company, keyed so the same notification
  // is never queued twice. Returns how many were queued.
  private async queue(db: Prisma.TransactionClient, company: { users: User[] }, build: (user: User) => Email) {
    if (company.users.length === 0) return 0;
    const { count } = await db.emailOutbox.createMany({
      data: company.users.map((user) => ({ to: user.email, ...build(user) })),
      skipDuplicates: true,
    });
    return count;
  }
}
