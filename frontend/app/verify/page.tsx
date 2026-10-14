'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocumentReviewQueue, getVerificationQueue, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/labels';
import type { DocumentRecord, VerificationQueueCompany } from '@/lib/types';
import { ButtonLink } from '@/components/Button';
import { CompanyDecisionRow } from '@/components/CompanyDecisionRow';
import { DocumentReviewRow } from '@/components/DocumentReviewRow';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

// The verifier's workspace: documents waiting for review, then the companies
// waiting for a decision. Reviewing a document changes that company's
// summary, so every action refreshes both lists.
export default function VerifyPage() {
  const { user, token } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [companies, setCompanies] = useState<VerificationQueueCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const staff = isStaffRole(user?.role);

  const fetchBoth = useCallback(
    (showSkeleton: boolean) => {
      if (!token || !staff) {
        setLoading(false);
        return;
      }
      const ticket = ++latest.current;
      if (showSkeleton) setLoading(true);
      setError(null);
      Promise.all([getDocumentReviewQueue(token), getVerificationQueue(token)])
        .then(([docs, queue]) => {
          if (ticket !== latest.current) return;
          setDocuments(docs);
          setCompanies(queue);
        })
        .catch((err) => {
          if (ticket === latest.current) {
            setError(err instanceof ApiError ? err.message : 'Could not load the verification queues.');
          }
        })
        .finally(() => {
          if (ticket === latest.current) setLoading(false);
        });
    },
    [token, staff],
  );

  useEffect(() => {
    fetchBoth(true);
  }, [fetchBoth]);

  const refresh = useCallback(() => fetchBoth(false), [fetchBoth]);

  if (!user) {
    return (
      <EmptyState
        title="Sign in to verify companies"
        description="This workspace is for the portal's verifiers."
        action={
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        }
      />
    );
  }

  if (!staff) {
    return (
      <EmptyState
        title="This area is for verifiers"
        description="Verification is done by the portal's own staff. Your company's documents and status are on its profile."
        action={
          <ButtonLink href={`/companies/${user.companyId}`} size="sm">
            Go to your profile
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="For verifiers"
        title="Verification"
        description="Review submitted compliance documents, then decide on each company. A company can only be marked verified once at least one of its documents is approved."
      />

      {error && <ErrorBanner message={error} />}

      <section>
        <h2 className="mb-4 section-title">Documents to review ({loading ? '…' : documents.length})</h2>
        {loading ? (
          <CardSkeleton />
        ) : documents.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            description="New documents appear here as companies submit them."
          />
        ) : (
          <ul className="card divide-y divide-gray-100">
            {documents.map((doc) => (
              <DocumentReviewRow key={doc.id} doc={doc} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 section-title">Companies awaiting a decision ({loading ? '…' : companies.length})</h2>
        {loading ? (
          <CardSkeleton />
        ) : companies.length === 0 ? (
          <EmptyState
            title="No companies waiting"
            description="A company lands here when it submits a document, and leaves once you verify or reject it."
          />
        ) : (
          <ul className="card divide-y divide-gray-100">
            {companies.map((company) => (
              <CompanyDecisionRow key={company.id} company={company} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
