import type { DocumentRecord, DocumentType } from './types';

// Mirrors backend/src/documents/document-expiry.ts — the server enforces all
// of this; the UI uses it to ask for the right fields and warn in time.
export const EXPIRY_REQUIRED: DocumentType[] = ['TAX_CLEARANCE', 'NSSA_COMPLIANCE', 'PRAZ_REGISTRATION'];
export const NEVER_EXPIRES: DocumentType[] = ['COMPANY_REGISTRATION'];

// How far ahead a company is warned to upload a renewal.
export const EXPIRY_WARNING_DAYS = 30;

const HARARE_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Today's date in Harare as YYYY-MM-DD. An expiry date is valid through its
// whole day there, so this is the earliest date a current document can carry.
export function harareToday(now: Date = new Date()): string {
  return new Date(now.getTime() + HARARE_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

// Whole days from today (in Harare) to the expiry date: 0 on its last valid
// day, negative once it has lapsed. The API stores the date as midnight UTC,
// so its first ten characters are the calendar date.
export function daysUntilExpiry(expiresAt: string, now: Date = new Date()): number {
  return Math.round((Date.parse(expiresAt.slice(0, 10)) - Date.parse(harareToday(now))) / DAY_MS);
}

export function isLapsed(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  return Boolean(expiresAt) && daysUntilExpiry(expiresAt as string, now) < 0;
}

function isCurrentApproval(doc: DocumentRecord, now: Date) {
  return doc.status === 'APPROVED' && !isLapsed(doc.expiresAt, now);
}

// Document types the company had approved that no longer have a current
// approval — the same rule the server uses to take verification away.
export function lapsedTypes(docs: DocumentRecord[], now: Date = new Date()): DocumentRecord[] {
  const wasApproved = (d: DocumentRecord) =>
    d.status === 'APPROVED' || (d.status === 'EXPIRED' && Boolean(d.reviewedBy));
  const latestByType = new Map<DocumentType, DocumentRecord>();
  for (const d of docs.filter(wasApproved)) {
    const seen = latestByType.get(d.docType);
    if (!seen || (d.expiresAt ?? '') > (seen.expiresAt ?? '')) latestByType.set(d.docType, d);
  }
  return Array.from(latestByType.values()).filter(
    (d) => !docs.some((other) => other.docType === d.docType && isCurrentApproval(other, now)),
  );
}

// Approved documents about to lapse with no renewal yet: nothing of the same
// type that's approved for longer, or waiting for review.
export function expiringSoon(docs: DocumentRecord[], now: Date = new Date()): DocumentRecord[] {
  return docs.filter((d) => {
    if (!isCurrentApproval(d, now) || !d.expiresAt) return false;
    if (daysUntilExpiry(d.expiresAt, now) > EXPIRY_WARNING_DAYS) return false;
    return !docs.some(
      (other) =>
        other.id !== d.id &&
        other.docType === d.docType &&
        (other.status === 'PENDING' ||
          (other.status === 'APPROVED' && (!other.expiresAt || other.expiresAt > (d.expiresAt as string)))),
    );
  });
}
