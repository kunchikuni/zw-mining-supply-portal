'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRfq, getCategories, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function NewRfqPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [province, setProvince] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      setError('Sign in with a mining company account to post an RFQ.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const rfq = await createRfq({
        mineCompanyId: user.companyId,
        categoryId,
        title,
        description,
        quantity: quantity || undefined,
        province: province || undefined,
        deadline: new Date(deadline).toISOString(),
      });
      router.push(`/rfqs/${rfq.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post the RFQ.');
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return <ErrorBanner message="Sign in with a mining company account to post an RFQ." />;
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-ink">Post a request for quote</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label htmlFor="title" className="mb-1 block text-xs font-medium text-gray-600">
            Title
          </label>
          <input
            id="title"
            required
            minLength={3}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="categoryId" className="mb-1 block text-xs font-medium text-gray-600">
            Category
          </label>
          <select
            id="categoryId"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-xs font-medium text-gray-600">
            Description
          </label>
          <textarea
            id="description"
            required
            minLength={10}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quantity" className="mb-1 block text-xs font-medium text-gray-600">
              Quantity (optional)
            </label>
            <input
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="province" className="mb-1 block text-xs font-medium text-gray-600">
              Province (optional)
            </label>
            <input
              id="province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="deadline" className="mb-1 block text-xs font-medium text-gray-600">
            Bid deadline
          </label>
          <input
            id="deadline"
            type="date"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Post RFQ
        </Button>
      </form>
    </div>
  );
}
