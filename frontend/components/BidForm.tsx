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
    <form onSubmit={handleSubmit} className="panel space-y-4">
      <h3 className="card-title">Submit a bid</h3>
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
        Submit bid
      </Button>
    </form>
  );
}
