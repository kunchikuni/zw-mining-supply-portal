'use client';

import { useState } from 'react';
import { setRfqStatus, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Rfq, RfqStatus } from '@/lib/types';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBanner } from './ErrorBanner';

// Shown only to the company that posted the RFQ. It offers exactly the
// transitions the server allows: OPEN -> CLOSED | CANCELLED and
// CLOSED -> CANCELLED. AWARDED isn't a button — accepting a bid does that.
export function RfqOwnerPanel({ rfq, onChanged }: { rfq: Rfq; onChanged: () => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function move(status: RfqStatus) {
    setError(null);
    if (!token) {
      setError('Sign in again to manage this RFQ.');
      return;
    }
    try {
      await setRfqStatus(rfq.id, status, token);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this RFQ.');
      // A 409 means the RFQ isn't in the state this page thinks it is (changed
      // in another tab, or by a bid being accepted) — catch the view up.
      if (err instanceof ApiError && err.status === 409) onChanged();
    }
  }

  const cancel = (
    <ConfirmAction
      label="Cancel RFQ"
      prompt="Cancel this RFQ? This can't be undone."
      confirmLabel="Yes, cancel it"
      variant="danger"
      onConfirm={() => move('CANCELLED')}
    />
  );

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-ink">Manage this RFQ</h3>

      {rfq.status === 'OPEN' && (
        <>
          <p className="text-xs text-gray-500">
            {rfq.biddingOpen
              ? 'Suppliers can bid until the deadline. Accepting a bid awards the RFQ and stops further bids.'
              : 'The deadline has passed. Review the bids, then accept one to award this RFQ.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {rfq.biddingOpen && (
              <ConfirmAction
                label="Close bidding"
                prompt="Stop taking new bids? This can't be undone."
                confirmLabel="Yes, close bidding"
                onConfirm={() => move('CLOSED')}
              />
            )}
            {cancel}
          </div>
        </>
      )}

      {rfq.status === 'CLOSED' && (
        <>
          <p className="text-xs text-gray-500">
            Bidding is closed. Review the bids, then accept one to award this RFQ.
          </p>
          <div className="flex flex-wrap items-center gap-2">{cancel}</div>
        </>
      )}

      {rfq.status === 'AWARDED' && (
        <p className="text-xs text-gray-500">
          This RFQ has been awarded and no longer accepts bids. You can still accept further bids if
          you&apos;re splitting the award.
        </p>
      )}

      {rfq.status === 'CANCELLED' && (
        <p className="text-xs text-gray-500">This RFQ was cancelled. Its bids can no longer be reviewed.</p>
      )}

      {error && <ErrorBanner message={error} />}
    </div>
  );
}
