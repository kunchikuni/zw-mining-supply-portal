'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMe, updateMe, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/labels';
import type { Account } from '@/lib/types';
import { ButtonLink } from '@/components/Button';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

// The signed-in user's own account: email preferences and a way to change
// the password. RFQ alert emails link here to turn them off.
export default function AccountPage() {
  const { user, token } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    const ticket = ++latest.current;
    setLoading(true);
    setError(null);
    getMe(token)
      .then((me) => {
        if (ticket === latest.current) setAccount(me);
      })
      .catch((err) => {
        if (ticket === latest.current) setError(err instanceof ApiError ? err.message : 'Could not load your account.');
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleAlerts(next: boolean) {
    if (!token || !account) return;
    setSaving(true);
    setSaved(null);
    setError(null);
    try {
      const updated = await updateMe(token, { rfqAlerts: next });
      setAccount(updated);
      setSaved(next ? 'RFQ alerts are on.' : 'RFQ alerts are off.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your preference.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <EmptyState title="Sign in to see your account" action={<ButtonLink href="/login">Sign in</ButtonLink>} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader eyebrow="Your account" title={account?.fullName ?? 'Account'} description={account ? `${account.email} · ${account.company.name}` : undefined} />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <CardSkeleton />
      ) : account ? (
        <>
          {/* Staff aren't suppliers, so there's nothing for them to opt out of. */}
          {!isStaffRole(account.role) && (
            <section className="panel space-y-3">
              <h2 className="section-title">Email</h2>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-copper-600"
                  checked={account.rfqAlerts}
                  disabled={saving}
                  onChange={(e) => toggleAlerts(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">New RFQ alerts</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                    An email when a mine posts an RFQ in one of {account.company.name}&apos;s categories. Sent
                    only while your company is verified, since that&apos;s when it can bid.
                  </span>
                </span>
              </label>
              {saved && (
                <p role="status" className="text-xs text-chrome-700">
                  {saved}
                </p>
              )}
            </section>
          )}

          <section className="panel flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="section-title">Password</h2>
              <p className="mt-1 text-xs text-gray-500">Changing it signs you out on every other device.</p>
            </div>
            <ButtonLink href="/account/password" variant="secondary" size="sm">
              Change password
            </ButtonLink>
          </section>
        </>
      ) : null}
    </div>
  );
}
