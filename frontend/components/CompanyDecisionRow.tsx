'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setVerificationStatus, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { VerificationQueueCompany, VerificationStatus } from '@/lib/types';
import { DOC_TYPE_LABELS } from '@/lib/labels';
import { isLapsed } from '@/lib/expiry';
import { Badge } from './Badge';
import { Button } from './Button';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBanner } from './ErrorBanner';

// One company waiting on a verification decision, with a summary of where its
// documents stand. "Mark verified" needs at least one current approved
// document and nothing lapsed without an approved renewal — the server
// enforces both; the button just doesn't offer what it would refuse.
export function CompanyDecisionRow({
  company,
  onChanged,
}: {
  company: VerificationQueueCompany;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const count = (status: string) => company.documents.filter((d) => d.status === status).length;
  const approved = company.documents.filter((d) => d.status === 'APPROVED' && !isLapsed(d.expiresAt)).length;
  // A pending document past its expiry date can't be approved, and has left
  // the review queue, so it isn't counted as awaiting review.
  const pending = company.documents.filter((d) => d.status === 'PENDING' && !isLapsed(d.expiresAt)).length;
  const rejected = count('REJECTED');
  const lapsed = company.lapsedDocTypes ?? [];
  const lapsedNames = lapsed.map((t) => DOC_TYPE_LABELS[t].toLowerCase()).join(' and ');
  const blocker =
    approved === 0
      ? 'Approve at least one of its documents before marking it verified.'
      : lapsed.length > 0
        ? `Its ${lapsedNames} has expired — approve a current one before marking it verified.`
        : null;

  async function decide(status: VerificationStatus) {
    setError(null);
    if (!token) {
      setError('Sign in again to make this decision.');
      return;
    }
    try {
      await setVerificationStatus(company.id, status, token);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the decision.');
      if (err instanceof ApiError && err.status === 409) onChanged();
    }
  }

  const place = Array.from(new Set([company.town, company.province].filter(Boolean))).join(', ');

  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/companies/${company.id}`} className="card-title transition hover:text-copper-700">
            {company.name}
          </Link>
          <p className="mt-1 text-sm text-gray-500">
            {company.type === 'MINE' ? 'Mining company' : 'Supplier'}
            {place ? ` · ${place}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {approved > 0 && <Badge tone="chrome">{approved} approved</Badge>}
            {pending > 0 && <Badge tone="copper">{pending} awaiting review</Badge>}
            {rejected > 0 && <Badge tone="danger">{rejected} rejected</Badge>}
            {lapsed.map((t) => (
              <Badge key={t} tone="danger">
                {DOC_TYPE_LABELS[t]} expired
              </Badge>
            ))}
            {company.documents.length === 0 && <Badge>No documents</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!blocker ? (
            <ConfirmAction
              label="Mark verified"
              prompt="Verify this company? It can then bid on RFQs in its categories."
              confirmLabel="Yes, verify"
              variant="primary"
              onConfirm={() => decide('VERIFIED')}
            />
          ) : (
            <Button size="sm" disabled title={blocker}>
              Mark verified
            </Button>
          )}
          <ConfirmAction
            label="Reject"
            prompt="Reject this company's verification?"
            confirmLabel="Yes, reject"
            variant="danger"
            onConfirm={() => decide('REJECTED')}
          />
        </div>
      </div>
      {blocker && <p className="hint">{blocker}</p>}
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </li>
  );
}
