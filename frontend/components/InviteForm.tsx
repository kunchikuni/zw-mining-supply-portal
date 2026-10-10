'use client';

import { FormEvent, useState } from 'react';
import { createInvite, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';

// Company admins use this to add teammates. The backend only stores a hash of
// the code, so it's displayed here once and can't be looked up again.
export function InviteForm({ companyId }: { companyId: string }) {
  const { token } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; link: string; expiresAt: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCopied(false);

    if (!token) {
      setError('Sign in to invite a teammate.');
      return;
    }

    setLoading(true);
    try {
      const res = await createInvite(companyId, token, email.trim() || undefined);
      setInvite({
        code: res.inviteCode,
        // Fragment, not query string: it never reaches server logs or Referer headers.
        link: `${window.location.origin}/register#invite=${res.inviteCode}`,
        expiresAt: res.expiresAt,
      });
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the invite.');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure origin, permissions) — the link
      // is still selectable in the box below.
      setCopied(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-ink">Invite a teammate</h3>
      <p className="text-xs text-gray-500">
        Teammates can only join your company with a one-time invite. It expires after 7 days.
      </p>
      {error && <ErrorBanner message={error} />}
      <div>
        <label htmlFor="inviteEmail" className="mb-1 block text-xs font-medium text-gray-600">
          Their email (optional)
        </label>
        <input
          id="inviteEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          If set, only this address can use the invite.
        </p>
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Create invite link
      </Button>

      {invite && (
        <div className="space-y-2 rounded-md border border-chrome-100 bg-chrome-50 p-3">
          <p className="text-xs font-medium text-ink">
            Share this link — it&apos;s shown once and works for one person.
          </p>
          <input
            readOnly
            aria-label="Invite link"
            value={invite.link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs"
          />
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <span className="text-xs text-gray-500">
              Expires {new Date(invite.expiresAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </form>
  );
}
