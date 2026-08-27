'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
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
      router.push('/companies');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold text-ink">Sign in</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-600">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-gray-600">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        No account yet?{' '}
        <Link href="/register" className="text-copper-600 hover:underline">
          Register your company
        </Link>
      </p>
    </div>
  );
}
