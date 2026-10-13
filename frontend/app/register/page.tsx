'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createCompany, registerUser, ApiError } from '@/lib/api';
import { decodeToken, useAuth } from '@/lib/auth';
import type { CompanyType } from '@/lib/types';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setToken } = useAuth();
  const preselected = params.get('as');

  const [step, setStep] = useState<1 | 2>(1);
  // True when joining an existing company with a code instead of creating one.
  const [joining, setJoining] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
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

  // A teammate following an invite link (/register#invite=...) skips straight
  // to account creation. The code rides in the URL fragment, not the query
  // string, so it never reaches server logs or a Referer header.
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get('invite');
    if (code) {
      setInviteCode(code);
      setJoining(true);
      setStep(2);
    }
  }, []);

  async function handleCompanySubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const company = await createCompany({ name, type, province: province || undefined });
      // The server mints a one-time code that makes the next step's user this
      // company's admin; nobody can join a company without one.
      setInviteCode(company.inviteCode);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the company.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUserSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError('Enter the invite code your company admin gave you.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { accessToken } = await registerUser({
        inviteCode: inviteCode.trim(),
        email,
        password,
        fullName,
      });
      setToken(accessToken);
      // The company comes from the invite, so read it back from the new token.
      const claims = decodeToken(accessToken);
      router.push(claims ? `/companies/${claims.companyId}` : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="text-center">
        <p className="eyebrow">{joining ? 'You\'ve been invited' : `Step ${step} of 2`}</p>
        <h1 className="page-title mt-4">
          {step === 1
            ? 'Tell us about your company'
            : joining
              ? 'Join your company'
              : 'Create your account'}
        </h1>
      </div>

      {step === 1 ? (
        <form onSubmit={handleCompanySubmit} className="panel mt-8 space-y-5">
          {error && <ErrorBanner message={error} />}
          <div>
            <label htmlFor="name" className="label">
              Company name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="type" className="label">
              We are a
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as CompanyType)}
              className="input"
            >
              <option value="SUPPLIER">Supplier</option>
              <option value="MINE">Mining company</option>
            </select>
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
          <Button type="submit" loading={loading} className="w-full">
            Continue
          </Button>
          <p className="text-center text-sm text-gray-500">
            Joining a company that&apos;s already on the portal?{' '}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setJoining(true);
                setStep(2);
              }}
              className="text-link"
            >
              Use an invite code
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={handleUserSubmit} className="panel mt-8 space-y-5">
          {error && <ErrorBanner message={error} />}
          {joining && (
            <div>
              <label htmlFor="inviteCode" className="label">
                Invite code
              </label>
              <input
                id="inviteCode"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="input font-mono"
              />
              <p className="hint">
                Ask an admin at your company to generate one from the company profile.
              </p>
            </div>
          )}
          <div>
            <label htmlFor="fullName" className="label">
              Your full name
            </label>
            <input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
            />
          </div>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
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
