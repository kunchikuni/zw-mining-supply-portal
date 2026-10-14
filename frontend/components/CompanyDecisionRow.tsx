'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setVerificationStatus, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { VerificationQueueCompany, VerificationStatus } from '@/lib/types';
import { Badge } from './Badge';
import { Button } from './Button';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBanner } from './ErrorBanner';

// One company waiting on a verification decision, with a summary of where its
// documents stand. "Mark verified" needs at least one approved document — the
// server enforces that too; the button just doesn't offer what it would refuse.
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
  const approved = count('APPROVED');
  const pending = count('PENDING');
  const rejected = count('REJECTED');

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
            {company.documents.length === 0 && <Badge>No documents</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {approved > 0 ? (
            <ConfirmAction
              label="Mark verified"
              prompt="Verify this company? It can then bid on RFQs in its categories."
              confirmLabel="Yes, verify"
              variant="primary"
              onConfirm={() => decide('VERIFIED')}
            />
          ) : (
            <Button size="sm" disabled title="Approve at least one of its documents first">
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
      {approved === 0 && (
        <p className="hint">Approve at least one of its documents before marking it verified.</p>
      )}
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </li>
  );
}
