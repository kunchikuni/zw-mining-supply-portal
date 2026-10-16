'use client';

import { useState } from 'react';
import { resetStaffPassword, setStaffDisabled, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { IssuedPassword, StaffMember } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { Badge } from './Badge';
import { Button } from './Button';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBanner } from './ErrorBanner';

// One staff account. An admin can't disable or reset their own account (the
// server refuses it too), so their own row has no actions.
export function StaffRow({
  member,
  isSelf,
  onChanged,
  onPasswordIssued,
}: {
  member: StaffMember;
  isSelf: boolean;
  onChanged: () => void;
  onPasswordIssued: (issued: IssuedPassword) => void;
}) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    if (!token) {
      setError('Sign in again to manage staff.');
      return;
    }
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const disable = () => run(() => setStaffDisabled(member.id, true, token as string), 'Could not disable this account.');
  const enable = () => run(() => setStaffDisabled(member.id, false, token as string), 'Could not enable this account.');
  const reset = () =>
    run(async () => onPasswordIssued(await resetStaffPassword(member.id, token as string)), 'Could not reset the password.');

  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {member.fullName}
            {isSelf && <span className="ml-2 text-xs font-normal text-gray-500">(you)</span>}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">{member.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={member.role === 'PLATFORM_ADMIN' ? 'copper' : 'neutral'}>
              {member.role === 'PLATFORM_ADMIN' ? 'Platform admin' : 'Verifier'}
            </Badge>
            {member.disabledAt ? (
              <Badge tone="danger">Disabled {formatDate(member.disabledAt)}</Badge>
            ) : member.mustChangePassword ? (
              <Badge tone="copper">Temporary password</Badge>
            ) : (
              <Badge tone="chrome">Active</Badge>
            )}
            <span className="text-xs text-gray-400">Added {formatDate(member.createdAt)}</span>
          </div>
        </div>
        {!isSelf && (
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmAction
              label="Reset password"
              prompt={`Reset ${member.fullName}'s password? They'll be signed out.`}
              confirmLabel="Yes, reset"
              onConfirm={reset}
            />
            {member.disabledAt ? (
              <Button size="sm" variant="secondary" loading={busy} onClick={enable}>
                Enable
              </Button>
            ) : (
              <ConfirmAction
                label="Disable"
                prompt={`Disable ${member.fullName}? They'll be signed out and can't sign in.`}
                confirmLabel="Yes, disable"
                variant="danger"
                onConfirm={disable}
              />
            )}
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </li>
  );
}
