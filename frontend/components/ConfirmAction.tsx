'use client';

import { useState } from 'react';
import { Button } from './Button';

// A button for actions that can't be undone: the first click asks, the second
// commits. `onConfirm` is expected to handle its own errors (it should show
// them, not throw) — this only manages the ask/commit/busy states.
export function ConfirmAction({
  label,
  prompt,
  confirmLabel,
  variant = 'secondary',
  onConfirm,
}: {
  label: string;
  prompt: string;
  confirmLabel: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  if (!asking) {
    return (
      <Button variant={variant} size="sm" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }

  return (
    <span role="group" aria-label={prompt} className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-600">{prompt}</span>
      <Button variant={variant} size="sm" loading={busy} onClick={confirm}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(false)}>
        Back
      </Button>
    </span>
  );
}
