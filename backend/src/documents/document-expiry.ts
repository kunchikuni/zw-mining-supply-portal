import { DocumentStatus, DocumentType } from '@prisma/client';
import { startOfHarareDay } from '../harare-day';

// Documents that renew periodically. Uploading one needs its expiry date, and
// approving one needs the verifier to confirm that date against the document.
export const EXPIRY_REQUIRED: DocumentType[] = [
  DocumentType.TAX_CLEARANCE,
  DocumentType.NSSA_COMPLIANCE,
  DocumentType.PRAZ_REGISTRATION,
];

// Never expires, so never takes an expiry date. Every other type may have one.
export const NEVER_EXPIRES: DocumentType[] = [DocumentType.COMPANY_REGISTRATION];

// For messages: "Tax clearance has expired".
export const DOCUMENT_NAMES: Record<DocumentType, string> = {
  COMPANY_REGISTRATION: 'company registration',
  TAX_CLEARANCE: 'tax clearance',
  NSSA_COMPLIANCE: 'NSSA compliance certificate',
  PRAZ_REGISTRATION: 'PRAZ registration',
  SAFETY_CERTIFICATE: 'safety certificate',
  QUALITY_CERTIFICATE: 'quality certificate',
  OTHER: 'document',
};

// An expiry date is a calendar date (see harare-day.ts): the document is valid
// through the end of that day in Harare, and lapsed from the next midnight.
// As a database filter, a document has lapsed at `now` exactly when
// `expiresAt < lapsedBefore(now)`.
export function lapsedBefore(now: Date): Date {
  return startOfHarareDay(now);
}

export function isLapsed(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  return expiresAt != null && expiresAt < lapsedBefore(now);
}

type DocumentFacts = {
  docType: DocumentType;
  status: DocumentStatus;
  expiresAt: Date | null;
  reviewedBy: string | null;
};

// An approval that still counts: APPROVED and not past its expiry date (the
// hourly sweep may not have marked it EXPIRED yet).
export function isCurrentApproval(doc: DocumentFacts, now: Date = new Date()): boolean {
  return doc.status === DocumentStatus.APPROVED && !isLapsed(doc.expiresAt, now);
}

// Document types the company once had approved but no longer has a current
// approval for — e.g. last year's tax clearance has expired and this year's
// hasn't been approved. A company with any of these can't be, or stay,
// VERIFIED. An EXPIRED document with a reviewer was approved before it
// lapsed; one without expired while still waiting for review, and never
// counted towards verification.
export function lapsedDocumentTypes(docs: DocumentFacts[], now: Date = new Date()): DocumentType[] {
  const wasApproved = (d: DocumentFacts) =>
    d.status === DocumentStatus.APPROVED || (d.status === DocumentStatus.EXPIRED && d.reviewedBy != null);
  const types = Array.from(new Set(docs.filter(wasApproved).map((d) => d.docType)));
  return types.filter((type) => !docs.some((d) => d.docType === type && isCurrentApproval(d, now)));
}

// "Tax clearance" / "Tax clearance and NSSA compliance certificate".
export function describeTypes(types: DocumentType[]): string {
  const text = types.map((t) => DOCUMENT_NAMES[t]).join(' and ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
