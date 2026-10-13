'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCompany, ApiError } from '@/lib/api';
import type { Company } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { VerificationBadge } from '@/components/VerificationBadge';
import { Badge } from '@/components/Badge';
import { CategoryEditor } from '@/components/CategoryEditor';
import { InviteForm } from '@/components/InviteForm';
import { DocumentList } from '@/components/DocumentList';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

export default function CompanyProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getCompany(id, token)
      .then(setCompany)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this profile.'))
      .finally(() => setLoading(false));
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = user?.companyId === id;

  if (loading) return <CardSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!company) return null;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={company.type === 'MINE' ? 'Mining company' : 'Supplier'}
        title={company.name}
        description={
          company.province || company.town
            ? Array.from(new Set([company.town, company.province].filter(Boolean))).join(', ')
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <VerificationBadge status={company.verificationStatus} />
            {company.isLocallyOwned && <Badge tone="chrome">Locally owned</Badge>}
          </div>
        }
      />

      {/* Owners get their editing panels in a side column; visitors get one column. */}
      <div className={isOwner ? 'grid items-start gap-10 lg:grid-cols-[1.6fr_1fr]' : 'space-y-10'}>
        <div className="space-y-10">
          {company.description && (
            <p className="max-w-3xl text-[15px] leading-relaxed text-gray-700">{company.description}</p>
          )}

          {company.categories && company.categories.length > 0 && (
            <div>
              <h2 className="section-title">Categories</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {company.categories.map((c) => (
                  <Badge key={c.categoryId}>{c.category.name}</Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="section-title">Compliance documents</h2>
            <div className="mt-4">
              <DocumentList documents={company.documents ?? []} />
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="space-y-6">
            {company.type === 'SUPPLIER' && (
              <CategoryEditor
                companyId={company.id}
                currentCategoryIds={(company.categories ?? []).map((c) => c.categoryId)}
                onSaved={load}
              />
            )}

            <DocumentUploadForm onUploaded={load} />

            {/* Admin-only in the UI as a convenience; POST /companies/:id/invites enforces it. */}
            {user?.role === 'COMPANY_ADMIN' && <InviteForm companyId={company.id} />}
          </div>
        )}
      </div>
    </div>
  );
}
