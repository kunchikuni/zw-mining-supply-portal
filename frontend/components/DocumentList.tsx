import type { DocumentRecord } from '@/lib/types';
import { DOC_STATUS_TONE, DOC_TYPE_LABELS, sentenceCase } from '@/lib/labels';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';

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
          {doc.status === 'REJECTED' && doc.reviewNote && (
            <p className="mt-2 text-xs leading-relaxed text-red-800">Reason: {doc.reviewNote}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
