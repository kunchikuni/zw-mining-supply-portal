'use client';

import { useEffect, useState } from 'react';
import { getCategories, getOpenRfqs, ApiError } from '@/lib/api';
import type { Category, Rfq } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { RfqCard } from '@/components/RfqCard';
import { CardSkeletonGrid } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

export default function RfqsPage() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // The stored token hydrates after first render, so this runs once
    // anonymously and again with the token. Ignore the stale response if it
    // lands second, or it would overwrite the signed-in mine's list.
    let stale = false;
    setLoading(true);
    setError(null);
    // The token lets a signed-in mine see its own RFQs after their deadline
    // (flagged "Bidding closed"); everyone else gets only what's biddable.
    getOpenRfqs({ categoryId: categoryId || undefined }, token)
      .then((list) => {
        if (!stale) setRfqs(list);
      })
      .catch((err) => {
        if (!stale) setError(err instanceof ApiError ? err.message : 'Could not load RFQs.');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [categoryId, token]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="RFQ board"
        title="Open RFQs"
        description="What mines are currently sourcing, soonest deadline first."
        actions={
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input w-auto min-w-[15rem]"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <CardSkeletonGrid />
      ) : rfqs.length === 0 ? (
        <EmptyState title="No open RFQs right now" description="Check back soon, or adjust the category filter." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rfqs.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} />
          ))}
        </div>
      )}
    </div>
  );
}
