'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCompany, ApiError } from '@/lib/api';
import type { Company } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { VerificationBadge } from '@/components/VerificationBadge';
import { Badge } from '@/components/Badge';
import { DocumentList } from '@/components/DocumentList';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function CompanyProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getCompany(id)
      .then(setCompany)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this profile.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = user?.companyId === id;

  if (loading) return <CardSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!company) return null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{company.name}</h1>
          <VerificationBadge status={company.verificationStatus} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {company.type === 'MINE' ? 'Mining company' : 'Supplier'}
          {company.province ? ` · ${company.province}` : ''}
          {company.town ? `, ${company.town}` : ''}
        </p>
        {company.isLocallyOwned && <Badge tone="chrome">Locally owned</Badge>}
      </div>

      {company.description && <p className="text-sm text-gray-700">{company.description}</p>}

      {company.categories && company.categories.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-ink">Categories</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {company.categories.map((c) => (
              <Badge key={c.categoryId}>{c.category.name}</Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-ink">Compliance documents</h2>
        <div className="mt-2">
          <DocumentList documents={company.documents ?? []} />
        </div>
      </div>

      {isOwner && (
        <DocumentUploadForm companyId={company.id} onUploaded={load} />
      )}
    </div>
  );
}
