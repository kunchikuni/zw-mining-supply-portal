'use client';

import { FormEvent, useState } from 'react';
import { createRating, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SCORE_LABELS } from '@/lib/labels';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';

const SCORES = [1, 2, 3, 4, 5];

// The posting mine's rating of one supplier it hired on an awarded RFQ. The
// server enforces who may rate what (and only once); this collects a score
// and an optional comment.
export function RatingForm({
  rfqId,
  supplierId,
  supplierName,
  onRated,
}: {
  rfqId: string;
  supplierId: string;
  supplierName: string;
  onRated: () => void;
}) {
  const { token } = useAuth();
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!score) {
      setError('Choose a score from 1 to 5 stars.');
      return;
    }
    if (!token) {
      setError('Sign in again to rate this supplier.');
      return;
    }
    setBusy(true);
    try {
      await createRating(token, {
        rfqId,
        ratedCompanyId: supplierId,
        score,
        comment: comment.trim() || undefined,
      });
      onRated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the rating.');
      // 409: already rated (in another tab, say) — reload to show that rating.
      if (err instanceof ApiError && err.status === 409) onRated();
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || score;

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="label">
          Score<span className="sr-only"> for {supplierName}</span>
        </legend>
        <div className="flex items-center gap-3">
          <div className="flex" onMouseLeave={() => setHover(0)}>
            {SCORES.map((n) => {
              const id = `score-${supplierId}-${n}`;
              return (
                <span key={n}>
                  <input
                    type="radio"
                    id={id}
                    name={`score-${supplierId}`}
                    value={n}
                    checked={score === n}
                    onChange={() => setScore(n)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={id}
                    onMouseEnter={() => setHover(n)}
                    className={`block cursor-pointer rounded px-0.5 text-2xl leading-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-copper-400 ${
                      n <= shown ? 'text-copper-500' : 'text-gray-300'
                    }`}
                  >
                    <span aria-hidden="true">★</span>
                    <span className="sr-only">
                      {n} {n === 1 ? 'star' : 'stars'}, {SCORE_LABELS[n]}
                    </span>
                  </label>
                </span>
              );
            })}
          </div>
          <span className="text-sm text-gray-600" aria-hidden="true">
            {shown ? SCORE_LABELS[shown] : 'Choose a score'}
          </span>
        </div>
      </fieldset>

      <div>
        <label htmlFor={`comment-${supplierId}`} className="label">
          Comment (optional)
        </label>
        <textarea
          id={`comment-${supplierId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          className="input"
          placeholder="e.g. Delivered on schedule, paperwork complete."
        />
        <p className="hint">
          Shown on {supplierName}&apos;s public profile, without your company&apos;s name or this RFQ. A
          rating can&apos;t be changed once it&apos;s submitted.
        </p>
      </div>

      <Button type="submit" size="sm" loading={busy}>
        Submit rating
      </Button>

      {error && <ErrorBanner message={error} />}
    </form>
  );
}
