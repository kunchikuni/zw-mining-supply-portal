'use client';

import { useState } from 'react';
import type { ReceivedRating } from '@/lib/types';
import { SCORE_LABELS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { RatingStars } from './RatingStars';

const PREVIEW = 5;

// A company's ratings on its public profile. Every rating comes from a mine
// that awarded the company an RFQ, and none says which mine or which RFQ (see
// CompaniesService.findOne), so this shows the average, the count, and each
// score with its comment.
export function CompanyRatings({ ratings }: { ratings: ReceivedRating[] }) {
  const [showAll, setShowAll] = useState(false);

  if (ratings.length === 0) {
    return (
      <EmptyState
        title="No ratings yet"
        description="Ratings come from mines that hired this company through an awarded RFQ."
      />
    );
  }

  const average = ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;
  const shown = showAll ? ratings : ratings.slice(0, PREVIEW);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <p className="font-display text-5xl font-semibold leading-none text-ink lining-nums">
          {average.toFixed(1)}
        </p>
        <div className="space-y-1">
          <RatingStars value={average} size="lg" />
          <p className="text-xs text-gray-500">
            {ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'} from mines that awarded them work
          </p>
        </div>
      </div>

      <ul className="card divide-y divide-gray-100">
        {shown.map((r) => (
          <li key={r.id} className="px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <RatingStars value={r.score} />
                <span>{SCORE_LABELS[r.score]}</span>
              </p>
              <p className="text-xs text-gray-400">{formatDate(r.createdAt)}</p>
            </div>
            {r.comment && <p className="mt-2 text-sm leading-relaxed text-gray-700">{r.comment}</p>}
          </li>
        ))}
      </ul>

      {ratings.length > PREVIEW && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${ratings.length} ratings`}
        </Button>
      )}
    </div>
  );
}
