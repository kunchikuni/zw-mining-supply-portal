import type { DocumentRecord } from '@/lib/types';
import { DOC_STATUS_TONE, DOC_TYPE_LABELS, sentenceCase } from '@/lib/labels';
import { EXPIRY_WARNING_DAYS, daysUntilExpiry } from '@/lib/expiry';
import { formatDate } from '@/lib/format';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';

// "Valid until 31 Dec 2026", "Expires 31 Oct 2026 · in 16 days", or
// "Expired 14 Oct 2026". Rejected documents don't get one: their date never counted.
function ExpiryLine({ doc }: { doc: DocumentRecord }) {
  if (!doc.expiresAt || doc.status === 'REJECTED') return null;
  const days = daysUntilExpiry(doc.expiresAt);
  const date = formatDate(doc.expiresAt);

  if (doc.status === 'EXPIRED' || days < 0) {
    return <p className="mt-1 text-xs text-red-800">Expired {date}</p>;
  }
  if (days <= EXPIRY_WARNING_DAYS) {
    return (
      <p className="mt-1 text-xs font-medium text-copper-700">
        Expires {date} · {days === 0 ? 'today is its last day' : `in ${days} day${days === 1 ? '' : 's'}`}
      </p>
    );
  }
  return <p className="mt-1 text-xs text-gray-500">Valid until {date}</p>;
}

export function DocumentList({ documents }: { documents: DocumentRecord[] }) {
  if (documents.length === 0) {
    return <EmptyState title="No documents on file" description="Add compliance documents to move toward verified status." />;
  }

  return (
    <ul className="card divide-y divide-gray-100">
      {documents.map((doc) => (
        <li key={doc.id} className="px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-ink">{DOC_TYPE_LABELS[doc.docType]}</span>
              {/* The server only sends the link to the owner and verifiers. */}
              {doc.fileUrl && (
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-link text-xs">
                  View document
                </a>
              )}
            </div>
            <Badge tone={DOC_STATUS_TONE[doc.status]}>{sentenceCase(doc.status)}</Badge>
          </div>
          <ExpiryLine doc={doc} />
          {doc.status === 'REJECTED' && doc.reviewNote && (
            <p className="mt-2 text-xs leading-relaxed text-red-800">Reason: {doc.reviewNote}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
