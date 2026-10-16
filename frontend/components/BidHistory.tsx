import type { Bid } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';

// The earlier versions of a revised bid, newest first as the API sends them.
// Shown wherever the bid itself is: to the mine reviewing it, and to the
// supplier that placed it.
export function BidHistory({ history }: { history?: Bid[] }) {
  if (!history || history.length === 0) return null;
  const previous = history[0];

  return (
    <details className="group mt-2 text-xs text-gray-500">
      <summary className="cursor-pointer list-none hover:text-ink [&::-webkit-details-marker]:hidden">
        Revised {history.length === 1 ? 'once' : `${history.length} times`} · was{' '}
        {formatMoney(previous.amount, previous.currency)}{' '}
        <span className="text-link group-open:hidden">Show history</span>
        <span className="text-link hidden group-open:inline">Hide history</span>
      </summary>
      <ol className="mt-2 space-y-1 border-l border-gray-200 pl-3">
        {history.map((version) => (
          <li key={version.id}>
            {formatMoney(version.amount, version.currency)}
            {version.leadTimeDays ? ` · ${version.leadTimeDays} day lead time` : ''}
            {' · submitted '}
            {formatDate(version.submittedAt)}
          </li>
        ))}
      </ol>
    </details>
  );
}
