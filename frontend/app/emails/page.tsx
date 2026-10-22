'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFailedEmails, retryEmail, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { FailedEmail } from '@/lib/types';
import { emailKindLabel } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/Button';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

// Platform admins: emails the outbox gave up on after 6 attempts, newest
// first, and sending one again once whatever stopped it is fixed. The server
// decides what can be retried (GET /emails/failed, POST /emails/:id/retry).
export default function EmailsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const [emails, setEmails] = useState<FailedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(() => {
    if (!token || !isAdmin) {
      setLoading(false);
      return;
    }
    const ticket = ++latest.current;
    setError(null);
    getFailedEmails(token)
      .then((list) => {
        if (ticket === latest.current) setEmails(list);
      })
      .catch((err) => {
        if (ticket === latest.current) setError(err instanceof ApiError ? err.message : 'Could not load emails.');
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });
  }, [token, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(email: FailedEmail) {
    if (!token) return;
    setBusy(email.id);
    setError(null);
    setNotice(null);
    try {
      await retryEmail(token, email.id);
      setEmails((list) => list.filter((e) => e.id !== email.id));
      setNotice(`The email to ${email.to} is queued again. The outbox tries it within 15 seconds.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not queue the email again.');
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!user || !isAdmin) {
    return <EmptyState title="Platform admins only" description="Undelivered emails are handled by the portal's platform admins." />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Portal operations"
        title="Undelivered emails"
        description="Emails the portal gave up on after 6 attempts, newest first. Fix the cause (the mail server, its settings, or the recipient's address), then send them again."
      />

      {notice && (
        <p role="status" className="panel text-sm text-chrome-700">
          {notice}
        </p>
      )}
      {error && <ErrorBanner message={error} />}

      {loading ? (
        <CardSkeleton />
      ) : emails.length === 0 ? (
        <EmptyState title="Nothing undelivered" description="Every email the portal queued has been sent, or is still being tried." />
      ) : (
        <ul className="card divide-y divide-gray-100">
          {emails.map((email) => (
            <li key={email.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  {emailKindLabel(email.kind)} · queued {formatDate(email.createdAt)} · {email.attempts} attempts
                </p>
                <p className="truncate text-sm font-medium text-ink">{email.subject}</p>
                <p className="text-sm text-gray-600">To {email.to}</p>
                {email.lastError && <p className="break-words font-mono text-xs text-red-700">{email.lastError}</p>}
              </div>
              {email.retryable ? (
                <Button size="sm" variant="secondary" onClick={() => retry(email)} disabled={busy === email.id}>
                  {busy === email.id ? 'Queuing…' : 'Send again'}
                </Button>
              ) : (
                <p className="max-w-[14rem] text-xs text-gray-500">Bidding on this RFQ has closed, so it&apos;s no longer worth sending.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
