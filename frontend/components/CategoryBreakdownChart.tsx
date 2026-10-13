'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryBreakdown } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { EmptyState } from './EmptyState';

export function CategoryBreakdownChart({ data }: { data: CategoryBreakdown[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No awarded spend yet"
        description="Once you accept bids on your RFQs, category breakdown will appear here."
      />
    );
  }

  const chartData = data.map((c) => ({
    name: c.categoryName,
    Local: c.localValue,
    'Non-local': c.totalValue - c.localValue,
  }));

  return (
    <div>
      <div className="h-[280px] w-full" role="img" aria-label="Awarded spend by category, split between local and non-local suppliers">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7E5E4" />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCurrency(v)}
              tick={{ fontSize: 12, fill: '#78716C' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 12, fill: '#1A1814' }}
            />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Local" stackId="a" fill="#3F7D58" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Non-local" stackId="a" fill="#E4D8C2" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Table fallback for screen readers / non-visual consumption */}
      <table className="sr-only">
        <caption>Awarded spend by category</caption>
        <thead>
          <tr>
            <th>Category</th>
            <th>Local value</th>
            <th>Total value</th>
            <th>Local percentage</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.categoryId}>
              <td>{c.categoryName}</td>
              <td>{formatCurrency(c.localValue)}</td>
              <td>{formatCurrency(c.totalValue)}</td>
              <td>{c.localPercentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
