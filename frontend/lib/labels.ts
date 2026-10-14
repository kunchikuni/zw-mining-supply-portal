import type { DocumentStatus, DocumentType } from './types';

// Short names for compliance documents, shared by every list that shows them.
export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  COMPANY_REGISTRATION: 'Company registration',
  TAX_CLEARANCE: 'Tax clearance',
  NSSA_COMPLIANCE: 'NSSA compliance',
  PRAZ_REGISTRATION: 'PRAZ registration',
  SAFETY_CERTIFICATE: 'Safety certificate',
  QUALITY_CERTIFICATE: 'Quality certificate',
  OTHER: 'Other document',
};

export const DOC_STATUS_TONE: Record<DocumentStatus, 'neutral' | 'copper' | 'chrome' | 'danger'> = {
  PENDING: 'copper',
  APPROVED: 'chrome',
  REJECTED: 'danger',
  EXPIRED: 'danger',
};

// What each rating score means, for the score picker and screen readers.
export const SCORE_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

// "PENDING" -> "Pending"
export function sentenceCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

// Verifiers and platform admins: the portal's own staff, not mines or suppliers.
export function isStaffRole(role: string | undefined | null) {
  return role === 'VERIFIER' || role === 'PLATFORM_ADMIN';
}
