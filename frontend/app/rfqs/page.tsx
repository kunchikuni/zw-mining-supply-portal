'use client';

import { useEffect, useState } from 'react';
import { getCategories, getOpenRfqs, ApiError } from '@/lib/api';
import type { Category, Rfq } from '@/lib/types';
import { RfqCard } from '@/components/RfqCard';
import { CardSkeletonGrid } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function RfqsPage() {
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
    setLoading(true);
    setError(null);
    getOpenRfqs({ categoryId: categoryId || undefined })
      .then(setRfqs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load RFQs.'))
      .finally(() => setLoading(false));
  }, [categoryId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Open RFQs</h1>
          <p className="mt-1 text-sm text-gray-500">What mines are currently sourcing.</p>
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <CardSkeletonGrid />
      ) : rfqs.length === 0 ? (
        <EmptyState title="No open RFQs right now" description="Check back soon, or adjust the category filter." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rfqs.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} />
          ))}
        </div>
      )}
    </div>
  );
}
