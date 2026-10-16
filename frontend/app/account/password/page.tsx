'use client';

import { FormEvent, useEffect, useState } from 'react';
import { changePassword, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/labels';
import { Button, ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

// Any signed-in user. Also where someone on a temporary password lands after
// signing in (?temporary=1). Changing it signs out every other session; this
// one carries on with the fresh token the server returns.
export default function ChangePasswordPage() {
  const { user, token, setToken } = useAuth();
  const [temporary, setTemporary] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Read after mount rather than with useSearchParams, which would need a
  // Suspense boundary for this page to build statically.
  useEffect(() => {
    setTemporary(new URLSearchParams(window.location.search).has('temporary'));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Sign in again to change your password.');
      return;
    }
    if (next.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { accessToken } = await changePassword(token, { currentPassword: current, newPassword: next });
      setToken(accessToken);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in to change your password"
        action={<ButtonLink href="/login">Sign in</ButtonLink>}
      />
    );
  }

  const home = isStaffRole(user.role) ? '/verify' : '/companies';

  return (
    <div className="mx-auto max-w-md space-y-8">
      <PageHeader
        eyebrow="Your account"
        title="Change password"
        description={
          temporary && !done
            ? 'You signed in with a temporary password. Choose your own to carry on.'
            : 'Changing it signs you out on every other device.'
        }
      />

      {done ? (
        <div role="status" className="panel space-y-4">
          <p className="font-medium text-ink">Password changed.</p>
          <p className="text-sm leading-relaxed text-gray-600">
            Any other sessions have been signed out. You&apos;re still signed in here.
          </p>
          <ButtonLink href={home} size="sm">
            Continue
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} className="panel space-y-5">
          {error && <ErrorBanner message={error} />}
          <div>
            <label htmlFor="current" className="label">
              {temporary ? 'Temporary password' : 'Current password'}
            </label>
            <input
              id="current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label htmlFor="new" className="label">
              New password
            </label>
            <input
              id="new"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input"
              required
            />
            <p className="hint">At least 8 characters.</p>
          </div>
          <div>
            <label htmlFor="confirm" className="label">
              New password, again
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input"
              required
            />
          </div>
          <Button type="submit" loading={busy} className="w-full">
            Change password
          </Button>
        </form>
      )}
    </div>
  );
}
