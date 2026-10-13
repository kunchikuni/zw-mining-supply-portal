import Link from 'next/link';
import { BrandMark } from './BrandMark';

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Explore',
    links: [
      { href: '/rfqs', label: 'RFQ board' },
      { href: '/companies', label: 'Supplier directory' },
    ],
  },
  {
    heading: 'For mines',
    links: [
      { href: '/rfqs/new', label: 'Post an RFQ' },
      { href: '/rfqs/mine', label: 'My RFQs' },
      { href: '/dashboard', label: 'Local content dashboard' },
    ],
  },
  {
    heading: 'For suppliers',
    links: [
      { href: '/register?as=SUPPLIER', label: 'Register your company' },
      { href: '/bids/mine', label: 'My bids' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-gray-200/70 bg-sand-50">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3" aria-label="ZW Supplier Portal home">
            <BrandMark className="h-9 w-9" />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              ZW Supplier Portal
            </span>
          </Link>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-gray-600">
            A directory of verified local suppliers and a request-for-quote board for Zimbabwe&apos;s
            mining companies — so local content is easy to find, award and report.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h2 className="section-title">{column.heading}</h2>
            <ul className="mt-5 space-y-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-600 transition hover:text-copper-600">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} ZW Supplier Portal. All rights reserved.</p>
          <p>Verified local suppliers for Zimbabwe&apos;s mining sector.</p>
        </div>
      </div>
    </footer>
  );
}
