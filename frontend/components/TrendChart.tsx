'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyTrendPoint } from '@/lib/types';
import { formatMonth } from '@/lib/format';

export function TrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatMonth(d.month) }));
  const hasAnyAwards = data.some((d) => d.totalValue > 0);

  return (
    <div>
      <div
        className="h-[220px] w-full"
        role="img"
        aria-label="Local content percentage over the last six months"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: -8, right: 16, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B7280' }} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 12, fill: '#6B7280' }}
              width={40}
            />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Line
              type="monotone"
              dataKey="localPercentage"
              name="Local content"
              stroke="#237A5F"
              strokeWidth={2}
              dot={{ r: 3, fill: '#237A5F' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!hasAnyAwards && (
        <p className="mt-2 text-xs text-gray-500">
          No awards in the last 6 months yet — this trend will fill in as you accept bids.
        </p>
      )}
    </div>
  );
}
