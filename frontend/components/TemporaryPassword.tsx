'use client';

import { useState } from 'react';
import { Button } from './Button';

// The one time a temporary password is shown: the server keeps only a hash,
// so once this is dismissed the only way to get another is a reset.
export function TemporaryPassword({
  email,
  password,
  reason,
  onDismiss,
}: {
  email: string;
  password: string;
  reason: 'created' | 'reset';
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the password is selectable instead.
    }
  }

  return (
    <div role="status" className="rounded-lg border border-copper-200 bg-copper-50 px-5 py-4 text-copper-800">
      <p className="font-semibold">
        {reason === 'created' ? `Account created for ${email}` : `Password reset for ${email}`}
      </p>
      <p className="mt-1 text-sm leading-relaxed">
        Their temporary password is shown once. Pass it on privately — they&apos;ll be asked to
        choose their own when they sign in.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="select-all rounded border border-copper-200 bg-white px-3 py-2 font-mono text-sm tracking-wide text-ink">
          {password}
        </code>
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}
