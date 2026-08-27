import Link from 'next/link';
import { Button } from '@/components/Button';

export default function HomePage() {
  return (
    <div className="space-y-16">
      <section className="grid gap-8 py-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-medium text-copper-600">Local content, made findable</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-ink sm:text-4xl">
            Verified Zimbabwean suppliers, matched to mining procurement.
          </h1>
          <p className="mt-4 text-gray-600">
            Mines search a vetted directory instead of chasing referrals. Suppliers get
            visibility to buyers they can&apos;t easily reach — backed by document verification,
            not self-attestation.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register?as=SUPPLIER">
              <Button>Register as a supplier</Button>
            </Link>
            <Link href="/register?as=MINE">
              <Button variant="secondary">Register as a mine</Button>
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-ink">How verification works</p>
          <ol className="mt-3 space-y-3 text-sm text-gray-600">
            <li>1. Create a company profile and list what you supply.</li>
            <li>2. Upload compliance documents — CR6/CR14, ZIMRA tax clearance, NSSA.</li>
            <li>3. A verifier reviews them before your listing goes live to mines.</li>
          </ol>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/companies"
          className="rounded-lg border border-gray-200 bg-white p-6 hover:shadow-md"
        >
          <p className="font-medium text-ink">Browse the supplier directory</p>
          <p className="mt-1 text-sm text-gray-500">Search by category, province, and verification status.</p>
        </Link>
        <Link href="/rfqs" className="rounded-lg border border-gray-200 bg-white p-6 hover:shadow-md">
          <p className="font-medium text-ink">See open RFQs</p>
          <p className="mt-1 text-sm text-gray-500">What mines are currently sourcing.</p>
        </Link>
      </section>
    </div>
  );
}
