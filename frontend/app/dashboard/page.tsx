'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
import { Button } from '@/components/Button';
import { formatCurrency } from '@/lib/format';

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
          <Link href="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <CardSkeletonGrid count={4} />
      </div>
    );
  }

  if (error) return <ErrorBanner message={error} />;

  if (company && company.type !== 'MINE') {
    return (
      <EmptyState
        title="This dashboard is for mining companies"
        description="As a supplier, track your bids from the RFQ board instead."
        action={
          <Link href="/rfqs">
            <Button size="sm">Go to RFQ board</Button>
          </Link>
        }
      />
    );
  }

  if (!summary) return null;

  const hasAnyData = summary.totalAwardedValue > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Local content dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          {company?.name} · awarded procurement spend going to verified local suppliers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <Link href="/rfqs/new">
              <Button size="sm">Post an RFQ</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-medium text-ink">Spend by category</h2>
              <p className="mt-1 text-xs text-gray-500">Local vs. non-local, awarded value</p>
              <div className="mt-4">
                <CategoryBreakdownChart data={summary.byCategory} />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-medium text-ink">Local content trend</h2>
              <p className="mt-1 text-xs text-gray-500">Last 6 months</p>
              <div className="mt-4">
                <TrendChart data={summary.monthlyTrend} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-ink">Recent awards</h2>
            <RecentAwardsTable awards={summary.recentAwards} />
          </div>
        </>
      )}
    </div>
  );
}
