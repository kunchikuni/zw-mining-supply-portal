import Link from 'next/link';
import type { Company } from '@/lib/types';
import { VerificationBadge } from './VerificationBadge';
import { Badge } from './Badge';

export function CompanyCard({ company }: { company: Company }) {
  return (
    <Link href={`/companies/${company.id}`} className="card-link p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="card-title">{company.name}</h3>
        <VerificationBadge status={company.verificationStatus} />
      </div>
      <p className="mt-1.5 text-sm text-gray-500">
        {company.type === 'MINE' ? 'Mining company' : 'Supplier'}
        {company.province ? ` · ${company.province}` : ''}
      </p>
      {company.categories && company.categories.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {company.categories.slice(0, 3).map((c) => (
            <Badge key={c.categoryId}>{c.category.name}</Badge>
          ))}
          {company.categories.length > 3 && <Badge>+{company.categories.length - 3} more</Badge>}
        </div>
      )}
    </Link>
  );
}
