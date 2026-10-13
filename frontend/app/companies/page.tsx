'use client';

import { useEffect, useState } from 'react';
import { getCategories, searchCompanies, ApiError } from '@/lib/api';
import type { Category, Company, CompanyType } from '@/lib/types';
import { SearchFilters } from '@/components/SearchFilters';
import { CompanyCard } from '@/components/CompanyCard';
import { CardSkeletonGrid } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

export default function CompaniesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    q: string;
    type: CompanyType | '';
    categoryId: string;
    province: string;
  }>({ q: '', type: '', categoryId: '', province: '' });

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      searchCompanies({
        q: filters.q || undefined,
        type: filters.type || undefined,
        categoryId: filters.categoryId || undefined,
        province: filters.province || undefined,
      })
        .then(setCompanies)
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : 'Could not load the directory.'),
        )
        .finally(() => setLoading(false));
    }, 300); // debounce free-text search
    return () => clearTimeout(handle);
  }, [filters]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Directory"
        title="Suppliers & mines"
        description="Search by name, category, province and type. Verified companies carry a green badge."
      />

      <SearchFilters categories={categories} value={filters} onChange={setFilters} />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <CardSkeletonGrid />
      ) : companies.length === 0 ? (
        <EmptyState
          title="No companies match those filters"
          description="Try widening your search or clearing a filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
