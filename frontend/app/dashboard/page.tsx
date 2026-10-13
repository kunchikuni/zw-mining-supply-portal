'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getCompany, getLocalContentSummary, ApiError } from '@/lib/api';
import type { Company, LocalContentSummary } from '@/lib/types';
import { StatCard } from '@/components/StatCard';
import { CategoryBreakdownChart } from '@/components/CategoryBreakdownChart';
import { TrendChart } from '@/components/TrendChart';
import { RecentAwardsTable } from '@/components/RecentAwardsTable';
import { CardSkeletonGrid } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ButtonLink } from '@/components/Button';
import { formatCurrency } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [summary, setSummary] = useState<LocalContentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getCompany(user.companyId, token)
      .then(async (c) => {
        setCompany(c);
        if (c.type === 'MINE') {
          const data = await getLocalContentSummary(token);
          setSummary(data);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the dashboard.'),
      )
      .finally(() => setLoading(false));
  }, [user, token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <EmptyState
        title="Sign in to view your dashboard"
        description="The local content dashboard is available to registered mining companies."
        action={
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 animate-pulse rounded bg-gray-100" />
        <CardSkeletonGrid count={4} />
      </div>
    );
  }

  if (error) return <ErrorBanner message={error} />;

  if (company && company.type !== 'MINE') {
    return (
      <EmptyState
        title="This dashboard is for mining companies"
        description="As a supplier, follow your bids and their outcomes on My bids."
        action={
          <ButtonLink href="/bids/mine" size="sm">
            Go to My bids
          </ButtonLink>
        }
      />
    );
  }

  if (!summary) return null;

  const hasAnyData = summary.totalAwardedValue > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Local content"
        title="Local content dashboard"
        description={`${company?.name ?? 'Your company'} · awarded procurement spend going to verified local suppliers.`}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Local content"
          value={`${summary.localContentPercentage}%`}
          helpText="Of total awarded spend"
          accent
        />
        <StatCard
          label="Total awarded spend"
          value={formatCurrency(summary.totalAwardedValue)}
          helpText="Across all accepted bids"
        />
        <StatCard
          label="Local suppliers engaged"
          value={summary.verifiedLocalSuppliersEngaged}
          helpText="Verified, locally-owned"
        />
        <StatCard
          label="Open RFQs"
          value={summary.openRfqCount}
          helpText="Currently accepting bids"
        />
      </div>

      {!hasAnyData ? (
        <EmptyState
          title="No awarded bids yet"
          description="Once you accept bids on your RFQs, your local content breakdown and trend will appear here."
          action={
            <ButtonLink href="/rfqs/new" size="sm">
              Post an RFQ
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h2 className="section-title">Spend by category</h2>
              <p className="mt-1 text-xs text-gray-500">Local vs. non-local, awarded value</p>
              <div className="mt-4">
                <CategoryBreakdownChart data={summary.byCategory} />
              </div>
            </div>
            <div className="card p-6">
              <h2 className="section-title">Local content trend</h2>
              <p className="mt-1 text-xs text-gray-500">Last 6 months</p>
              <div className="mt-4">
                <TrendChart data={summary.monthlyTrend} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-4 section-title">Recent awards</h2>
            <RecentAwardsTable awards={summary.recentAwards} />
          </div>
        </>
      )}
    </div>
  );
}
