'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMyBids, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Bid } from '@/lib/types';
import { MyBidRow } from '@/components/MyBidRow';
import { CardSkeletonGrid } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ButtonLink } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';

// A supplier's way back to what they've bid on and what became of it — the
// RFQ board only shows RFQs that are still open, so an accepted, rejected or
// closed one would otherwise have no page that links to it.
export default function MyBidsPage() {
  const { user, token } = useAuth();
  const [bids, setBids] = useState<Bid[]>([]);
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
    getMyBids(token)
      .then((list) => {
        if (!stale) setBids(list);
      })
      .catch((err) => {
        if (!stale) setError(err instanceof ApiError ? err.message : 'Could not load your bids.');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [token]);

  // Re-fetch after a withdrawal without swapping the list for a skeleton.
  const refresh = useCallback(() => {
    if (!token) return;
    getMyBids(token)
      .then(setBids)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not reload your bids.'));
  }, [token]);

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see your bids"
        description="This page lists the bids your company has submitted and where each one stands."
        action={
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        }
      />
    );
  }

  // "Awaiting a decision" excludes bids on cancelled RFQs: nothing is coming.
  const awaiting = bids.filter(
    (b) =>
      (b.status === 'SUBMITTED' || b.status === 'SHORTLISTED') && b.rfq?.status !== 'CANCELLED',
  ).length;
  const accepted = bids.filter((b) => b.status === 'ACCEPTED').length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="For suppliers"
        title="My bids"
        description={
          bids.length === 0
            ? 'Every bid your company has submitted, and where it stands.'
            : `${bids.length} bid${bids.length === 1 ? '' : 's'} · ${awaiting} awaiting a decision · ${accepted} accepted`
        }
        actions={
          <ButtonLink href="/rfqs" variant="secondary">
            Browse open RFQs
          </ButtonLink>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <CardSkeletonGrid />
      ) : bids.length === 0 ? (
        <EmptyState
          title="You haven't placed any bids yet"
          description="Verified suppliers can bid on open RFQs in the categories they're listed under."
        />
      ) : (
        <ul className="card divide-y divide-gray-100">
          {bids.map((bid) => (
            <MyBidRow key={bid.id} bid={bid} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}
