import Link from 'next/link';
import { ButtonLink } from '@/components/Button';

const STEPS = [
  {
    title: 'Create your company profile',
    body: 'Register your company and list the categories you supply.',
  },
  {
    title: 'Add your compliance documents',
    body: 'CR6/CR14, ZIMRA tax clearance and NSSA, for a verifier to review.',
  },
  {
    title: 'Get verified and start bidding',
    body: 'Once verified, you can bid on open RFQs in your categories.',
  },
];

const PATHS = [
  {
    href: '/companies',
    kicker: 'Directory',
    title: 'Browse verified suppliers',
    body: 'Search by category, province and verification status.',
    cta: 'Open the directory',
  },
  {
    href: '/rfqs',
    kicker: 'RFQ board',
    title: 'See what mines are sourcing',
    body: 'Open requests for quote, with deadlines and categories.',
    cta: 'View open RFQs',
  },
];

function Arrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h12m-5-5 5 5-5 5" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-24">
      <section className="grid items-center gap-14 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="eyebrow">Zimbabwe · Mining · Local content</p>
          <h1 className="mt-6 font-display text-[2.75rem] font-semibold leading-[1.04] tracking-tight text-ink sm:text-[3.4rem] lg:text-[3.6rem]">
            Verified local suppliers.
            <span className="mt-2 block font-medium italic text-copper-500">
              Matched to mining procurement.
            </span>
          </h1>
          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-gray-600">
            Mines search a vetted directory instead of chasing referrals. Suppliers reach buyers
            they can&apos;t easily reach — backed by document verification, not self-attestation.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="/register?as=SUPPLIER">Register as a supplier</ButtonLink>
            <ButtonLink href="/register?as=MINE" variant="secondary">
              Register as a mine
            </ButtonLink>
          </div>
        </div>

        <div className="relative isolate">
          <div
            aria-hidden="true"
            className="absolute -inset-5 -z-10 rounded-2xl bg-gradient-to-br from-sand-100 via-sand-50 to-transparent"
          />
          <div className="panel">
            <p className="section-title">How verification works</p>
            <ol className="mt-7 space-y-7">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-5">
                  <span className="font-display text-3xl font-semibold leading-none text-copper-500">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="font-medium text-ink">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section>
        <p className="eyebrow">Where to start</p>
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          {PATHS.map((path) => (
            <Link key={path.href} href={path.href} className="card-link group p-7">
              <p className="section-title text-gray-500">{path.kicker}</p>
              <p className="mt-3 font-display text-2xl font-semibold text-ink">{path.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{path.body}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-copper-600">
                {path.cta}
                <Arrow />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
