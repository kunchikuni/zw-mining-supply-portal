'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRfq, getCategories, ApiError } from '@/lib/api';
import type { Category } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { Button, ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

export default function NewRfqPage() {
  const router = useRouter();
  const { user, token, companyType } = useAuth();
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
    if (!user || !token) {
      setError('Sign in with a mining company account to post an RFQ.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const rfq = await createRfq(token, {
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
    return (
      <EmptyState
        title="Sign in to post an RFQ"
        description="Requests for quote are posted by registered mining companies."
        action={
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        }
      />
    );
  }

  // The server refuses anyone but a mine; say so instead of showing a form.
  if (companyType && companyType !== 'MINE') {
    return (
      <EmptyState
        title="Only mining companies post RFQs"
        description="Suppliers bid on them: open requests in your categories are on the RFQ board."
        action={
          <ButtonLink href="/rfqs" size="sm">
            Browse the RFQ board
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="For mines"
        title="Post a request for quote"
        description="Verified suppliers listed under the category you choose can bid until the deadline."
      />
      <form onSubmit={handleSubmit} className="panel mt-8 space-y-5">
        {error && <ErrorBanner message={error} />}
        <div>
          <label htmlFor="title" className="label">
            Title
          </label>
          <input
            id="title"
            required
            minLength={3}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="categoryId" className="label">
            Category
          </label>
          <select
            id="categoryId"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
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
          <label htmlFor="description" className="label">
            Description
          </label>
          <textarea
            id="description"
            required
            minLength={10}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quantity" className="label">
              Quantity (optional)
            </label>
            <input
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="province" className="label">
              Province (optional)
            </label>
            <input
              id="province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <div>
          <label htmlFor="deadline" className="label">
            Bid deadline
          </label>
          <input
            id="deadline"
            type="date"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="input"
          />
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Post RFQ
        </Button>
      </form>
    </div>
  );
}
