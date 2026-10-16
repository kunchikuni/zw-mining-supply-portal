'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { reviewDocument, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { DocumentRecord } from '@/lib/types';
import { DOC_TYPE_LABELS } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { EXPIRY_REQUIRED, NEVER_EXPIRES, isLapsed } from '@/lib/expiry';
import { Button } from './Button';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBanner } from './ErrorBanner';

// One pending document in the verifier's queue. A document is reviewed once
// (the server refuses a second decision), so approving asks first, and
// rejecting needs a reason — the company sees it on its profile. Approving
// also confirms the expiry date against the document: the company's date is
// pre-filled, and whatever is in the field when approving is what counts.
export function DocumentReviewRow({ doc, onChanged }: { doc: DocumentRecord; onChanged: () => void }) {
  const { token } = useAuth();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState(doc.expiresAt?.slice(0, 10) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takesExpiry = !NEVER_EXPIRES.includes(doc.docType);
  const needsExpiry = EXPIRY_REQUIRED.includes(doc.docType);

  async function decide(status: 'APPROVED' | 'REJECTED', reviewNote?: string) {
    setError(null);
    if (!token) {
      setError('Sign in again to review documents.');
      return;
    }
    if (status === 'APPROVED') {
      if (needsExpiry && !expiresAt) {
        setError('Enter the expiry date shown on the document before approving it.');
        return;
      }
      if (isLapsed(expiresAt)) {
        setError('This document has already expired — reject it and ask for the current one.');
        return;
      }
    }
    try {
      await reviewDocument(
        doc.id,
        { status, reviewNote, expiresAt: status === 'APPROVED' && takesExpiry && expiresAt ? expiresAt : undefined },
        token,
      );
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the review.');
      // 409: another verifier decided it first — catch the queue up.
      if (err instanceof ApiError && err.status === 409) onChanged();
    }
  }

  async function submitRejection(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) {
      setError('Add a reason so the company knows what to fix.');
      return;
    }
    setBusy(true);
    try {
      await decide('REJECTED', note.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">{DOC_TYPE_LABELS[doc.docType]}</p>
          <p className="mt-1 text-sm text-gray-500">
            {doc.company ? (
              <Link href={`/companies/${doc.company.id}`} className="text-link">
                {doc.company.name}
              </Link>
            ) : (
              'Company'
            )}
            {' · submitted '}
            {formatDate(doc.uploadedAt)}
          </p>
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link mt-2 inline-block text-xs"
          >
            Open document ↗
          </a>
          {takesExpiry && !rejecting && (
            <div className="mt-3 max-w-[14rem]">
              <label htmlFor={`expiry-${doc.id}`} className="label">
                Expiry date{needsExpiry ? '' : ' (if any)'}
              </label>
              <input
                id={`expiry-${doc.id}`}
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input"
              />
              <p className="hint">
                {doc.expiresAt ? 'As the company entered it — ' : ''}check it against the document.
              </p>
            </div>
          )}
        </div>
        {!rejecting && (
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmAction
              label="Approve"
              prompt="Approve this document?"
              confirmLabel="Yes, approve"
              variant="primary"
              onConfirm={() => decide('APPROVED')}
            />
            <Button variant="danger" size="sm" onClick={() => setRejecting(true)}>
              Reject…
            </Button>
          </div>
        )}
      </div>

      {rejecting && (
        <form onSubmit={submitRejection} className="mt-5 space-y-3">
          <div>
            <label htmlFor={`reason-${doc.id}`} className="label">
              Reason for rejecting
            </label>
            <textarea
              id={`reason-${doc.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className="input"
              placeholder="e.g. Tax clearance expired in March — please upload the current certificate."
            />
            <p className="hint">The company sees this on its profile, so say what to fix.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" size="sm" loading={busy}>
              Reject document
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setRejecting(false);
                setNote('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </li>
  );
}
