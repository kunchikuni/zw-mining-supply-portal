'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createCompany, registerUser, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CompanyType } from '@/lib/types';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setToken } = useAuth();
  const preselected = params.get('as');

  const [step, setStep] = useState<1 | 2>(1);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 fields
  const [name, setName] = useState('');
  const [type, setType] = useState<CompanyType>(
    preselected === 'MINE' ? 'MINE' : 'SUPPLIER',
  );
  const [province, setProvince] = useState('');

  // Step 2 fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleCompanySubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const company = await createCompany({ name, type, province: province || undefined });
      setCompanyId(company.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the company.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUserSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setError(null);
    setLoading(true);
    try {
      const { accessToken } = await registerUser({ companyId, email, password, fullName });
      setToken(accessToken);
      router.push(`/companies/${companyId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold text-ink">
        {step === 1 ? 'Tell us about your company' : 'Create your account'}
      </h1>
      <p className="mt-1 text-sm text-gray-500">Step {step} of 2</p>

      {step === 1 ? (
        <form onSubmit={handleCompanySubmit} className="mt-6 space-y-4">
          {error && <ErrorBanner message={error} />}
          <div>
            <label htmlFor="name" className="mb-1 block text-xs font-medium text-gray-600">
              Company name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="type" className="mb-1 block text-xs font-medium text-gray-600">
              We are a
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as CompanyType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="SUPPLIER">Supplier</option>
              <option value="MINE">Mining company</option>
            </select>
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
          <Button type="submit" loading={loading} className="w-full">
            Continue
          </Button>
        </form>
      ) : (
        <form onSubmit={handleUserSubmit} className="mt-6 space-y-4">
          {error && <ErrorBanner message={error} />}
          <div>
            <label htmlFor="fullName" className="mb-1 block text-xs font-medium text-gray-600">
              Your full name
            </label>
            <input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
