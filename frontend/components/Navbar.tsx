'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/labels';
import { BrandMark } from './BrandMark';
import { Button, ButtonLink } from './Button';

interface NavLink {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const PUBLIC_LINKS: NavLink[] = [
  { href: '/companies', label: 'Directory', isActive: (p) => p.startsWith('/companies') },
  {
    href: '/rfqs',
    label: 'RFQ board',
    // The board and any single RFQ, but not "My RFQs" or "Post an RFQ".
    isActive: (p) => p === '/rfqs' || /^\/rfqs\/(?!mine$|new$)/.test(p),
  },
];

const SIGNED_IN_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', isActive: (p) => p.startsWith('/dashboard') },
  { href: '/bids/mine', label: 'My bids', isActive: (p) => p.startsWith('/bids/mine') },
  { href: '/rfqs/mine', label: 'My RFQs', isActive: (p) => p === '/rfqs/mine' },
];

// Portal staff (verifiers / admins) aren't mines or suppliers, so they get
// the verification workspace instead of the buyer/seller links.
const STAFF_LINKS: NavLink[] = [
  { href: '/verify', label: 'Verification', isActive: (p) => p.startsWith('/verify') },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname() ?? '/';
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const staff = isStaffRole(user?.role);
  const links = !user ? PUBLIC_LINKS : staff ? [...PUBLIC_LINKS, ...STAFF_LINKS] : [...PUBLIC_LINKS, ...SIGNED_IN_LINKS];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="ZW Supplier Portal home">
          <BrandMark />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-display text-[21px] font-semibold leading-none tracking-tight text-ink">
              ZW Supplier Portal
            </span>
            <span className="mt-1.5 hidden text-[9.5px] font-semibold uppercase tracking-[0.26em] text-gray-500 sm:block">
              Mining · Local procurement
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {links.map((link) => {
            const active = link.isActive(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`relative text-[12px] font-medium uppercase tracking-[0.14em] transition after:absolute after:inset-x-0 after:-bottom-2 after:h-px after:bg-copper-500 after:transition after:content-[''] ${
                  active ? 'text-ink after:opacity-100' : 'text-gray-500 after:opacity-0 hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              {!staff && (
                <ButtonLink href="/rfqs/new" size="sm">
                  Post an RFQ
                </ButtonLink>
              )}
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-2 text-[12px] font-medium uppercase tracking-[0.14em] text-gray-600 transition hover:text-ink"
              >
                Sign in
              </Link>
              <ButtonLink href="/register" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink transition hover:bg-gray-100 lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            {menuOpen ? (
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-nav" className="border-t border-gray-200/70 bg-paper lg:hidden">
          <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            {links.map((link) => {
              const active = link.isActive(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`border-b border-gray-200/60 py-3 text-[13px] font-medium uppercase tracking-[0.14em] ${
                    active ? 'text-copper-600' : 'text-gray-600'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="flex flex-wrap items-center gap-3 py-4">
              {user ? (
                <>
                  {!staff && (
                    <ButtonLink href="/rfqs/new" size="sm">
                      Post an RFQ
                    </ButtonLink>
                  )}
                  <Button variant="secondary" size="sm" onClick={logout}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <ButtonLink href="/register" size="sm">
                    Get started
                  </ButtonLink>
                  <ButtonLink href="/login" variant="secondary" size="sm">
                    Sign in
                  </ButtonLink>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
