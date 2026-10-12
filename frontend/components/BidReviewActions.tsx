'use client';

import { useState } from 'react';
import { setBidStatus, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Bid, BidStatus } from '@/lib/types';
import { Button } from './Button';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBanner } from './ErrorBanner';

// What the posting mine can do with one bid. Accepted, rejected and withdrawn
// bids are final (the server enforces that), so they get no actions at all.
// Shortlisting is the only reversible-looking step because it can be followed
// by accept or reject; accept and reject are confirmed first.
export function BidReviewActions({ bid, onChanged }: { bid: Bid; onChanged: () => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [shortlisting, setShortlisting] = useState(false);

  if (bid.status !== 'SUBMITTED' && bid.status !== 'SHORTLISTED') return null;

  async function move(status: BidStatus) {
    setError(null);
    if (!token) {
      setError('Sign in again to review bids.');
      return;
    }
    try {
      await setBidStatus(bid.id, status, token);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this bid.');
      // A 409 means the bid or its RFQ moved on since this page loaded —
      // refresh so the list shows what's actually there.
      if (err instanceof ApiError && err.status === 409) onChanged();
    }
  }

  async function shortlist() {
    setShortlisting(true);
    try {
      await move('SHORTLISTED');
    } finally {
      setShortlisting(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {bid.status === 'SUBMITTED' && (
          <Button variant="secondary" size="sm" loading={shortlisting} onClick={shortlist}>
            Shortlist
          </Button>
        )}
        <ConfirmAction
          label="Accept"
          prompt="Accept this bid? The RFQ will be marked awarded."
          confirmLabel="Yes, accept"
          variant="primary"
          onConfirm={() => move('ACCEPTED')}
        />
        <ConfirmAction
          label="Reject"
          prompt="Reject this bid? This can't be undone."
          confirmLabel="Yes, reject"
          variant="danger"
          onConfirm={() => move('REJECTED')}
        />
      </div>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}
