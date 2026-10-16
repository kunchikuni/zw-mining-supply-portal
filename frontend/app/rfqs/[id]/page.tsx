'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRfq, ApiError } from '@/lib/api';
import type { Rfq } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { RfqStatusBadge } from '@/components/RfqStatusBadge';
import { BidList } from '@/components/BidList';
import { BidForm } from '@/components/BidForm';
import { RfqOwnerPanel } from '@/components/RfqOwnerPanel';
import { SealedBidSummary } from '@/components/SealedBidSummary';
import { SupplierRatingsPanel } from '@/components/SupplierRatingsPanel';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/format';

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bids are sealed, so what comes back depends on who's asking — and the
  // stored token only hydrates after the first render, so this page fetches
  // once anonymously and again with the token. Each request takes a ticket and
  // only the latest one may update state, so a late anonymous response can't
  // replace the owner's full bid list with the sealed view.
  const latest = useRef(0);

  const load = useCallback(() => {
    const ticket = ++latest.current;
    setLoading(true);
    setError(null);
    getRfq(id, token)
      .then((r) => {
        if (ticket === latest.current) setRfq(r);
      })
      .catch((err) => {
        if (ticket === latest.current) {
          setError(err instanceof ApiError ? err.message : 'Could not load this RFQ.');
        }
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });
  }, [id, token]);

  // Re-fetch after the owner closes the RFQ or reviews a bid. Unlike `load`
  // it doesn't swap the page for a skeleton, so the controls the owner just
  // used don't flash away and take any error message with them.
  const refresh = useCallback(() => {
    const ticket = ++latest.current;
    getRfq(id, token)
      .then((r) => {
        if (ticket === latest.current) setRfq(r);
      })
      .catch((err) => {
        if (ticket === latest.current) {
          setError(err instanceof ApiError ? err.message : 'Could not reload this RFQ.');
        }
      });
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CardSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!rfq) return null;

  const isOwner = Boolean(user) && user?.companyId === rfq.mineCompanyId;
  // Mirrors the server's sealed-bid rule (bids/bid-visibility.ts): these two
  // get every bid; everyone else gets a count plus their own bids, if any.
  const seesAllBids = isOwner || user?.role === 'PLATFORM_ADMIN';
  const bidCount = rfq._count?.bids ?? rfq.bids?.length ?? 0;

  // Eligibility (verified + category match), the RFQ being open, and the bidder
  // not being the posting mine are all enforced server-side by BidsService;
  // this is just a UX nicety so the wrong audience doesn't see a form they'd be
  // rejected from submitting. `biddingOpen` comes from the API (status OPEN and
  // inside the deadline window) so the deadline rule lives in one place.
  const canBid = Boolean(user) && !isOwner && rfq.biddingOpen;
  // The caller's live bid, if any — bidding again revises it. (Filtered by
  // company because a platform admin gets every bid back, not just its own.)
  const liveOwnBid = canBid
    ? rfq.bids?.find(
        (b) =>
          b.supplierCompanyId === user?.companyId &&
          (b.status === 'SUBMITTED' || b.status === 'SHORTLISTED'),
      )
    : undefined;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={rfq.category?.name ?? 'Request for quote'}
        title={rfq.title}
        actions={<RfqStatusBadge status={rfq.status} biddingOpen={rfq.biddingOpen} />}
      />

      <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="label">Posted by</dt>
          <dd className="text-sm font-medium text-ink">{rfq.mine?.name ?? 'Mining company'}</dd>
        </div>
        <div>
          <dt className="label">Bid deadline</dt>
          <dd className="text-sm font-medium text-ink">{formatDate(rfq.deadline)}</dd>
        </div>
        {rfq.province && (
          <div>
            <dt className="label">Province</dt>
            <dd className="text-sm font-medium text-ink">{rfq.province}</dd>
          </div>
        )}
        {rfq.quantity && (
          <div>
            <dt className="label">Quantity</dt>
            <dd className="text-sm font-medium text-ink">{rfq.quantity}</dd>
          </div>
        )}
      </dl>

      <div className="max-w-3xl">
        <h2 className="section-title">Scope</h2>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-gray-700">
          {rfq.description}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 section-title">Bids ({bidCount})</h2>
          {seesAllBids ? (
            <BidList
              bids={rfq.bids ?? []}
              reviewable={isOwner && rfq.status !== 'CANCELLED'}
              onChanged={refresh}
            />
          ) : (
            <SealedBidSummary bidCount={bidCount} ownBids={rfq.bids ?? []} mineName={rfq.mine?.name} />
          )}
        </div>
        <div className="space-y-6">
          {isOwner && <RfqOwnerPanel rfq={rfq} onChanged={refresh} />}
          {/* Only the posting mine can rate (POST /ratings enforces it), so a
              platform admin sees the bids but not this panel. */}
          {isOwner && rfq.status === 'AWARDED' && (
            <SupplierRatingsPanel rfq={rfq} onChanged={refresh} />
          )}
          {!isOwner && !rfq.biddingOpen && (
            <p
              role="status"
              className="panel text-sm leading-relaxed text-gray-600"
            >
              {rfq.status === 'OPEN'
                ? 'The bidding deadline has passed — this RFQ is no longer accepting bids.'
                : 'This RFQ is no longer accepting bids.'}
            </p>
          )}
          {canBid && (
            <BidForm key={liveOwnBid?.id ?? 'new'} rfqId={rfq.id} current={liveOwnBid} onSubmitted={load} />
          )}
        </div>
      </div>
    </div>
  );
}
