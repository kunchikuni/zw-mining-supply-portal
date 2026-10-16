'use client';

import { FormEvent, useState } from 'react';
import { createStaff, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { IssuedPassword, StaffRole } from '@/lib/types';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';

export function AddStaffForm({ onCreated }: { onCreated: (issued: IssuedPassword) => void }) {
  const { token } = useAuth();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffRole>('VERIFIER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Sign in again to add staff.');
      return;
    }
    setBusy(true);
    try {
      const issued = await createStaff(token, { email: email.trim(), fullName: fullName.trim(), role });
      setEmail('');
      setFullName('');
      setRole('VERIFIER');
      onCreated(issued);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this staff member.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-4">
      <h3 className="card-title">Add a staff member</h3>
      {error && <ErrorBanner message={error} />}
      <div>
        <label htmlFor="staff-name" className="label">
          Full name
        </label>
        <input
          id="staff-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={100}
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="staff-email" className="label">
          Email
        </label>
        <input
          id="staff-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="staff-role" className="label">
          Role
        </label>
        <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="input">
          <option value="VERIFIER">Verifier — reviews documents, verifies companies</option>
          <option value="PLATFORM_ADMIN">Platform admin — also manages staff and categories</option>
        </select>
      </div>
      <Button type="submit" loading={busy} className="w-full">
        Add and issue a temporary password
      </Button>
    </form>
  );
}
