import type { RecentAward } from '@/lib/types';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { formatCurrency } from '@/lib/format';

export function RecentAwardsTable({ awards }: { awards: RecentAward[] }) {
  if (awards.length === 0) {
    return <EmptyState title="No awards yet" description="Accepted bids will show up here." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3 font-medium">Supplier</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {awards.map((award) => (
            <tr key={award.bidId}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-ink">{award.supplierName}</span>
                  {award.isLocallyOwned && <Badge tone="chrome">Local</Badge>}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-600">{award.categoryName}</td>
              <td className="px-4 py-3 text-gray-600">
                {formatCurrency(award.amount, award.currency)}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(award.awardedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
