'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Button } from './Button';

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold text-ink">
          ZW Supplier Portal
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/companies" className="text-gray-600 hover:text-ink">
            Directory
          </Link>
          <Link href="/rfqs" className="text-gray-600 hover:text-ink">
            RFQ board
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="text-gray-600 hover:text-ink">
                Dashboard
              </Link>
              <Link href="/rfqs/mine" className="text-gray-600 hover:text-ink">
                My RFQs
              </Link>
              <Link href="/rfqs/new" className="text-gray-600 hover:text-ink">
                Post an RFQ
              </Link>
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-gray-600 hover:text-ink">
                Sign in
              </Link>
              <Link href="/register">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
