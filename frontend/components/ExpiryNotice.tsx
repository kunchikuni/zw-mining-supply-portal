import type { Company, DocumentRecord } from '@/lib/types';
import { DOC_TYPE_LABELS } from '@/lib/labels';
import { daysUntilExpiry, expiringSoon, lapsedTypes } from '@/lib/expiry';
import { formatDate } from '@/lib/format';

const on = (doc: DocumentRecord) => (doc.expiresAt ? ` on ${formatDate(doc.expiresAt)}` : '');

// Shown only to the company itself, at the top of its profile: anything that
// has lapsed (which costs it verification) and anything that's about to,
// while there's still time to get a renewal approved.
export function ExpiryNotice({ company }: { company: Company }) {
  const docs = company.documents ?? [];
  const lapsed = lapsedTypes(docs);
  const soon = expiringSoon(docs);
  if (lapsed.length === 0 && soon.length === 0) return null;

  return (
    <div className="space-y-3">
      {lapsed.map((doc) => {
        const renewalWaiting = docs.some((d) => d.docType === doc.docType && d.status === 'PENDING');
        return (
          <div
            key={doc.id}
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50/80 px-5 py-4 text-sm leading-relaxed text-red-900"
          >
            <p className="font-semibold">
              Your {DOC_TYPE_LABELS[doc.docType].toLowerCase()} expired{on(doc)}
            </p>
            <p className="mt-1">
              {renewalWaiting
                ? 'Your renewal is waiting for a verifier. Once it’s approved and your company is verified again, you can bid on RFQs.'
                : 'Your company is no longer verified, so it can’t bid on RFQs. Upload the current one below for a verifier to review.'}
            </p>
          </div>
        );
      })}
      {soon.map((doc) => {
        const days = daysUntilExpiry(doc.expiresAt as string);
        return (
          <div
            key={doc.id}
            role="status"
            className="rounded-lg border border-copper-200 bg-copper-50 px-5 py-4 text-sm leading-relaxed text-copper-800"
          >
            <p className="font-semibold">
              Your {DOC_TYPE_LABELS[doc.docType].toLowerCase()} expires{on(doc)}
              {days === 0 ? ' — today is its last day' : ` — in ${days} day${days === 1 ? '' : 's'}`}
            </p>
            <p className="mt-1">
              Upload the renewal now so a verifier can approve it in time. If it lapses first, your
              company stops being verified and can’t bid until the renewal is approved.
            </p>
          </div>
        );
      })}
    </div>
  );
}
