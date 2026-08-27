'use client';

import { FormEvent, useState } from 'react';
import { createBid, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';

export function BidForm({ rfqId, onSubmitted }: { rfqId: string; onSubmitted: () => void }) {
  const { token } = useAuth();
  const [amount, setAmount] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [notes, setNotes] = useState('');
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

    setLoading(true);
    try {
      await createBid(token, {
        rfqId,
        amount: parsedAmount,
        leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
        notes: notes || undefined,
      });
      setAmount('');
      setLeadTimeDays('');
      setNotes('');
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-ink">Submit a bid</h3>
      {error && <ErrorBanner message={error} />}
      <div>
        <label htmlFor="amount" className="mb-1 block text-xs font-medium text-gray-600">
          Amount (USD)
        </label>
        <input
          id="amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label htmlFor="leadTimeDays" className="mb-1 block text-xs font-medium text-gray-600">
          Lead time (days)
        </label>
        <input
          id="leadTimeDays"
          type="number"
          min="0"
          value={leadTimeDays}
          onChange={(e) => setLeadTimeDays(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="notes" className="mb-1 block text-xs font-medium text-gray-600">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Submit bid
      </Button>
    </form>
  );
}
