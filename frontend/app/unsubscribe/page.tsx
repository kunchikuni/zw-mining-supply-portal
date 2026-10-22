'use client';

import { useEffect, useState } from 'react';
import { getUnsubscribe, unsubscribe, ApiError, type UnsubscribeStatus } from '@/lib/api';
import { Button, ButtonLink } from '@/components/Button';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';

// Where the "Turn off RFQ alerts" link in an alert email lands. No sign-in:
// the token in the link is the key, and it can only turn RFQ alerts off. It
// asks before doing it, because link scanners and previews open links from
// emails; mailbox providers' own one-click button POSTs to the API directly.
export default function UnsubscribePage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<UnsubscribeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Read after mount rather than with useSearchParams, which would need a
  // Suspense boundary for this page to build statically.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    getUnsubscribe(t)
      .then(setStatus)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not check this link.'))
      .finally(() => setLoading(false));
  }, []);

  async function confirm() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await unsubscribe(token));
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not turn off RFQ alerts. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const account = (
    <ButtonLink href="/account" variant="secondary" size="sm">
      Manage email on your Account page
    </ButtonLink>
  );

  if (loading) return <CardSkeleton />;

  if (!token || (!status && error)) {
    return (
      <EmptyState
        title="This unsubscribe link doesn't work"
        description={error ?? 'The link is incomplete. Copy the whole link from the email, or turn RFQ alerts off on your Account page.'}
        action={account}
      />
    );
  }

  if (!status) return null;

  if (done || !status.rfqAlerts) {
    return (
      <EmptyState
        title={done ? 'RFQ alerts are off' : 'RFQ alerts are already off'}
        description={`${status.email} won't get emails about new requests for quote. Emails about your own bids, RFQs and documents still come. You can turn alerts back on from your Account page.`}
        action={account}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="panel space-y-5 text-center">
        <p className="eyebrow">Email preferences</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Turn off new RFQ alerts?</h1>
        <p className="text-sm leading-relaxed text-gray-600">
          <span className="font-medium text-ink">{status.email}</span> will stop getting an email each time a mine
          posts a request for quote in your company&apos;s categories. Emails about your own bids, RFQs and documents
          still come.
        </p>
        {error && <ErrorBanner message={error} />}
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={confirm} disabled={busy}>
            {busy ? 'Turning off…' : 'Turn off RFQ alerts'}
          </Button>
          {account}
        </div>
      </div>
    </div>
  );
}
