'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login, ApiError } from '@/lib/api';
import { decodeToken, useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/labels';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

export default function LoginPage() {
  const router = useRouter();
  const { setToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken } = await login(email, password);
      setToken(accessToken);
      // Verifiers go straight to their workspace; everyone else to the directory.
      router.push(isStaffRole(decodeToken(accessToken)?.role) ? '/verify' : '/companies');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="text-center">
        <p className="eyebrow">Welcome back</p>
        <h1 className="page-title mt-4">Sign in</h1>
        <p className="page-lead mx-auto">Use the email and password you registered with.</p>
      </div>
      <form onSubmit={handleSubmit} className="panel mt-8 space-y-5">
        {error && <ErrorBanner message={error} />}
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        No account yet?{' '}
        <Link href="/register" className="text-link">
          Register your company
        </Link>
      </p>
    </div>
  );
}
