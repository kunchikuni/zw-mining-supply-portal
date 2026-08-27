import type { DocumentRecord, DocumentType } from '@/lib/types';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  COMPANY_REGISTRATION: 'Company registration',
  TAX_CLEARANCE: 'Tax clearance',
  NSSA_COMPLIANCE: 'NSSA compliance',
  PRAZ_REGISTRATION: 'PRAZ registration',
  SAFETY_CERTIFICATE: 'Safety certificate',
  QUALITY_CERTIFICATE: 'Quality certificate',
  OTHER: 'Other document',
};

const STATUS_TONE: Record<DocumentRecord['status'], 'neutral' | 'copper' | 'chrome' | 'danger'> = {
  PENDING: 'copper',
  APPROVED: 'chrome',
  REJECTED: 'danger',
  EXPIRED: 'danger',
};

export function DocumentList({ documents }: { documents: DocumentRecord[] }) {
  if (documents.length === 0) {
    return <EmptyState title="No documents on file" description="Add compliance documents to move toward verified status." />;
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm text-ink">{DOC_TYPE_LABELS[doc.docType]}</span>
          <Badge tone={STATUS_TONE[doc.status]}>{doc.status.toLowerCase()}</Badge>
        </li>
      ))}
    </ul>
  );
}
