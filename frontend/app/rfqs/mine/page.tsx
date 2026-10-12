'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyRfqs, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Rfq } from '@/lib/types';
import { RfqStatusBadge } from '@/components/RfqStatusBadge';
import { CardSkeletonGrid } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/Button';

// The board only lists RFQs that are still open for bids, so a closed,
// awarded or cancelled RFQ has nowhere else to be reached from. This is that
// place: every RFQ the signed-in company has posted, whatever its status.
export default function MyRfqsPage() {
  const { user, token } = useAuth();
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    setError(null);
    getMyRfqs(token)
      .then((list) => {
        if (!stale) setRfqs(list);
      })
      .catch((err) => {
        if (!stale) setError(err instanceof ApiError ? err.message : 'Could not load your RFQs.');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [token]);

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see your RFQs"
        description="This page lists the requests for quote your company has posted."
        action={
          <Link href="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">My RFQs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Everything your company has posted — open, closed, awarded or cancelled.
          </p>
        </div>
        <Link href="/rfqs/new">
          <Button size="sm">Post an RFQ</Button>
        </Link>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <CardSkeletonGrid />
      ) : rfqs.length === 0 ? (
        <EmptyState
          title="You haven't posted any RFQs yet"
          description="Post one and verified suppliers in that category can bid on it."
        />
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {rfqs.map((rfq) => {
            const bidCount = rfq._count?.bids ?? 0;
            return (
              <li key={rfq.id}>
                <Link
                  href={`/rfqs/${rfq.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-ink">{rfq.title}</p>
                    <p className="text-sm text-gray-500">
                      {rfq.category?.name ?? 'Uncategorised'} · {bidCount} bid
                      {bidCount === 1 ? '' : 's'} · deadline{' '}
                      {new Date(rfq.deadline).toLocaleDateString()}
                    </p>
                  </div>
                  <RfqStatusBadge status={rfq.status} biddingOpen={rfq.biddingOpen} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
