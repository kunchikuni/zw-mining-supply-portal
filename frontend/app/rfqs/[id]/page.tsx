'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRfq, ApiError } from '@/lib/api';
import type { Rfq } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { RfqStatusBadge } from '@/components/RfqStatusBadge';
import { BidList } from '@/components/BidList';
import { BidForm } from '@/components/BidForm';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRfq(id)
      .then(setRfq)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this RFQ.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CardSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!rfq) return null;

  // Eligibility (verified + category match) is enforced server-side by BidsService;
  // this is just a UX nicety so the wrong audience doesn't see a form they'd be
  // rejected from submitting.
  const canBid = Boolean(user) && user?.companyId !== rfq.mineCompanyId && rfq.status === 'OPEN';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{rfq.title}</h1>
          <RfqStatusBadge status={rfq.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {rfq.mine?.name ?? 'Mining company'}
          {rfq.category ? ` · ${rfq.category.name}` : ''}
          {rfq.province ? ` · ${rfq.province}` : ''}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Bid deadline: {new Date(rfq.deadline).toLocaleDateString()}
        </p>
      </div>

      <p className="text-sm text-gray-700">{rfq.description}</p>
      {rfq.quantity && (
        <p className="text-sm text-gray-700">
          <span className="font-medium">Quantity: </span>
          {rfq.quantity}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-medium text-ink">Bids ({rfq.bids?.length ?? 0})</h2>
          <BidList bids={rfq.bids ?? []} />
        </div>
        <div>
          {canBid && user && (
            <BidForm rfqId={rfq.id} supplierCompanyId={user.companyId} onSubmitted={load} />
          )}
        </div>
      </div>
    </div>
  );
}
