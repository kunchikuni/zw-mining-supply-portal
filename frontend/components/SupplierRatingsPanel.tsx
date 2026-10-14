import type { Rfq } from '@/lib/types';
import { SCORE_LABELS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { RatingForm } from './RatingForm';
import { RatingStars } from './RatingStars';

// Shown to the posting mine on an awarded RFQ: each supplier it hired, with
// the rating already given or the form to give one. A split award has several
// accepted suppliers, and each is rated separately.
export function SupplierRatingsPanel({ rfq, onChanged }: { rfq: Rfq; onChanged: () => void }) {
  const hired = new Map<string, string>();
  for (const bid of rfq.bids ?? []) {
    if (bid.status === 'ACCEPTED' && !hired.has(bid.supplierCompanyId)) {
      hired.set(bid.supplierCompanyId, bid.supplier?.name ?? 'Supplier');
    }
  }
  if (hired.size === 0) return null;

  const given = new Map((rfq.ratings ?? []).map((r) => [r.ratedCompanyId, r]));
  const allRated = Array.from(hired.keys()).every((id) => given.has(id));

  return (
    <div className="panel space-y-5">
      <div>
        <h3 className="card-title">Rate your {hired.size === 1 ? 'supplier' : 'suppliers'}</h3>
        <p className="mt-1 text-xs text-gray-500">
          {allRated
            ? "You've rated everyone you hired on this RFQ."
            : 'How did the job go? Ratings help other mines choose suppliers.'}
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {Array.from(hired, ([supplierId, name]) => {
          const rating = given.get(supplierId);
          return (
            <li key={supplierId} className="space-y-3 py-5 first:pt-0 last:pb-0">
              <p className="font-medium text-ink">{name}</p>
              {rating ? (
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <RatingStars value={rating.score} />
                    <span>
                      {SCORE_LABELS[rating.score]} · rated {formatDate(rating.createdAt)}
                    </span>
                  </p>
                  {rating.comment && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">“{rating.comment}”</p>
                  )}
                </div>
              ) : (
                <RatingForm rfqId={rfq.id} supplierId={supplierId} supplierName={name} onRated={onChanged} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
