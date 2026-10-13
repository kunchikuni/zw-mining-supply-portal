'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setBidStatus, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Bid } from '@/lib/types';
import { BidStatusBadge } from './BidStatusBadge';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBanner } from './ErrorBanner';
import { RfqStatusBadge } from './RfqStatusBadge';
import { formatMoney, formatDate } from '@/lib/format';

function isActive(bid: Bid) {
  return bid.status === 'SUBMITTED' || bid.status === 'SHORTLISTED';
}

// Plain-language read of where a bid stands. An active bid on a cancelled RFQ
// is dead whatever its own status says, so that case wins.
function describe(bid: Bid): string {
  if (isActive(bid) && bid.rfq?.status === 'CANCELLED') return 'The mine cancelled this RFQ.';
  switch (bid.status) {
    case 'SUBMITTED':
      return 'Waiting for the mine to review your bid.';
    case 'SHORTLISTED':
      return 'The mine has shortlisted your bid.';
    case 'ACCEPTED':
      return 'Your bid was accepted.';
    case 'REJECTED':
      return "The mine didn't select your bid.";
    case 'WITHDRAWN':
      return 'You withdrew this bid.';
  }
}

export function MyBidRow({ bid, onChanged }: { bid: Bid; onChanged: () => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const rfq = bid.rfq;

  // The server also lets a supplier withdraw from a cancelled RFQ, but there's
  // nothing left to withdraw from, so the button isn't offered.
  const canWithdraw = isActive(bid) && rfq?.status !== 'CANCELLED';

  async function withdraw() {
    setError(null);
    if (!token) {
      setError('Sign in again to withdraw this bid.');
      return;
    }
    try {
      await setBidStatus(bid.id, 'WITHDRAWN', token);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not withdraw this bid.');
      // A 409 means the bid moved on (accepted, rejected, or the RFQ was
      // cancelled) since this page loaded — catch the list up.
      if (err instanceof ApiError && err.status === 409) onChanged();
    }
  }

  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/rfqs/${bid.rfqId}`} className="card-title transition hover:text-copper-700">
            {rfq?.title ?? 'RFQ'}
          </Link>
          <p className="text-sm text-gray-500">
            {rfq?.mine?.name ?? 'Mining company'}
            {rfq?.category ? ` · ${rfq.category.name}` : ''}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {formatMoney(bid.amount, bid.currency)}
            {bid.leadTimeDays ? ` · ${bid.leadTimeDays} day lead time` : ''}
            {' · submitted '}
            {formatDate(bid.submittedAt)}
          </p>
          <p className="mt-1 text-xs text-gray-500">{describe(bid)}</p>
        </div>
        <dl className="flex flex-col items-end gap-1.5 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <dt>Your bid</dt>
            <dd>
              <BidStatusBadge status={bid.status} />
            </dd>
          </div>
          {rfq && (
            <div className="flex items-center gap-2">
              <dt>RFQ</dt>
              <dd>
                <RfqStatusBadge status={rfq.status} biddingOpen={rfq.biddingOpen} />
              </dd>
            </div>
          )}
        </dl>
      </div>

      {canWithdraw && (
        <div className="mt-3">
          <ConfirmAction
            label="Withdraw bid"
            prompt="Withdraw this bid? This can't be undone."
            confirmLabel="Yes, withdraw"
            variant="danger"
            onConfirm={withdraw}
          />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </li>
  );
}
