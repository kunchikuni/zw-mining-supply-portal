'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getCategories, setCompanyCategories, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Category } from '@/lib/types';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';

// Lets a company edit its own category listing. The backend replaces the
// stored set with exactly what's submitted, so unticking a box removes it.
export function CategoryEditor({
  companyId,
  currentCategoryIds,
  onSaved,
}: {
  companyId: string;
  currentCategoryIds: string[];
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentCategoryIds));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : 'Could not load categories.'),
      );
  }, []);

  function toggle(categoryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const unchanged =
    selected.size === currentCategoryIds.length &&
    currentCategoryIds.every((id) => selected.has(id));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);

    if (!token) {
      setSaveError('Sign in to edit your categories.');
      return;
    }

    setSaving(true);
    try {
      await setCompanyCategories(companyId, Array.from(selected), token);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save your categories.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-4">
      <h3 className="card-title">Edit your categories</h3>
      <p className="text-xs text-gray-500">
        You can only bid on RFQs in a category listed here, so tick everything you supply.
      </p>
      {loadError && <ErrorBanner message={loadError} />}
      {saveError && <ErrorBanner message={saveError} />}
      {!categories && !loadError && <p className="text-sm text-gray-400">Loading categories…</p>}
      {categories && (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Categories</legend>
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 rounded border-gray-300 accent-copper-500"
              />
              {c.name}
            </label>
          ))}
        </fieldset>
      )}
      <Button type="submit" loading={saving} disabled={!categories || unchanged} className="w-full">
        Save categories
      </Button>
    </form>
  );
}
