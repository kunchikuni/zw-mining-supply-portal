'use client';

import { FormEvent, useState } from 'react';
import { createBid, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Bid } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';

// `current` is the caller's live (submitted or shortlisted) bid on this RFQ,
// if it has one. Submitting then revises it: the server keeps the old version
// as history and the mine sees the new one. Give the form a `key` tied to the
// current bid so it re-fills after a revision.
export function BidForm({
  rfqId,
  current,
  onSubmitted,
}: {
  rfqId: string;
  current?: Bid;
  onSubmitted: () => void;
}) {
  const { token } = useAuth();
  const [amount, setAmount] = useState(current ? String(Number(current.amount)) : '');
  const [leadTimeDays, setLeadTimeDays] = useState(current?.leadTimeDays != null ? String(current.leadTimeDays) : '');
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Sign in as a supplier to submit a bid.');
      return;
    }

    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a bid amount greater than 0.');
      return;
    }

    const parsedLeadTime = leadTimeDays ? Number(leadTimeDays) : undefined;
    if (
      current &&
      parsedAmount === Number(current.amount) &&
      (parsedLeadTime ?? null) === (current.leadTimeDays ?? null) &&
      (notes || null) === (current.notes || null)
    ) {
      setError('Nothing has changed — edit the amount, lead time or notes to revise your bid.');
      return;
    }

    setLoading(true);
    try {
      await createBid(token, {
        rfqId,
        amount: parsedAmount,
        leadTimeDays: parsedLeadTime,
        notes: notes || undefined,
      });
      if (!current) {
        setAmount('');
        setLeadTimeDays('');
        setNotes('');
      }
      onSubmitted();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong submitting your bid. Try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-4">
      <div>
        <h3 className="card-title">{current ? 'Revise your bid' : 'Submit a bid'}</h3>
        {current && (
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Your current bid is {formatMoney(current.amount, current.currency)}. A revision replaces
            it, and the mine can see your earlier prices.
            {current.status === 'SHORTLISTED' &&
              ' Your bid is shortlisted; revising it sends it back to the mine to review again.'}
          </p>
        )}
      </div>
      {error && <ErrorBanner message={error} />}
      <div>
        <label htmlFor="amount" className="label">
          Amount (USD)
        </label>
        <input
          id="amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="leadTimeDays" className="label">
          Lead time (days)
        </label>
        <input
          id="leadTimeDays"
          type="number"
          min="0"
          value={leadTimeDays}
          onChange={(e) => setLeadTimeDays(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label htmlFor="notes" className="label">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="input"
        />
      </div>
      <Button type="submit" loading={loading} className="w-full">
        {current ? 'Submit revised bid' : 'Submit bid'}
      </Button>
    </form>
  );
}
