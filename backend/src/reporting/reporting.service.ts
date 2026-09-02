import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BidStatus, Prisma, RfqStatus } from '@prisma/client';

// Matches the `include` clause on the acceptedBids query below — kept as a
// named type so it doesn't collapse to implicit `any` if Prisma client
// generation is ever interrupted, and stays in sync automatically if the
// include clause changes.
type AcceptedBidWithRelations = Prisma.BidGetPayload<{
  include: { supplier: true; rfq: { include: { category: true } } };
}>;

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  totalValue: number;
  localValue: number;
  localPercentage: number;
}

export interface MonthlyTrendPoint {
  month: string; // 'YYYY-MM'
  totalValue: number;
  localValue: number;
  localPercentage: number;
}

export interface RecentAward {
  bidId: string;
  supplierName: string;
  isLocallyOwned: boolean;
  categoryName: string;
  amount: number;
  currency: string;
  awardedAt: string;
}

export interface LocalContentSummary {
  totalAwardedValue: number;
  localAwardedValue: number;
  localContentPercentage: number;
  verifiedLocalSuppliersEngaged: number;
  openRfqCount: number;
  byCategory: CategoryBreakdown[];
  monthlyTrend: MonthlyTrendPoint[];
  recentAwards: RecentAward[];
}

const TREND_MONTHS = 6;

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  async localContentSummary(mineCompanyId: string): Promise<LocalContentSummary> {
    const [acceptedBids, openRfqCount] = await Promise.all([
      this.prisma.bid.findMany({
        where: {
          status: BidStatus.ACCEPTED,
          rfq: { mineCompanyId },
        },
        include: {
          supplier: true,
          rfq: { include: { category: true } },
        },
        // submittedAt is used as a proxy for "awarded date" — there's no
        // separate award timestamp on Bid yet. Good enough for a trend view
        // at MVP scale; add an `awardedAt` column if this needs to be precise.
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.rfq.count({ where: { mineCompanyId, status: RfqStatus.OPEN } }),
    ]);

    let totalAwardedValue = 0;
    let localAwardedValue = 0;
    const localSupplierIds = new Set<string>();
    const categoryMap = new Map<string, CategoryBreakdown>();
    const monthMap = new Map<string, { totalValue: number; localValue: number }>();

    for (const bid of acceptedBids) {
      const amount = Number(bid.amount);
      const isLocal = bid.supplier.isLocallyOwned;

      totalAwardedValue += amount;
      if (isLocal) {
        localAwardedValue += amount;
        localSupplierIds.add(bid.supplierCompanyId);
      }

      const categoryId = bid.rfq.categoryId;
      const categoryName = bid.rfq.category.name;
      const existingCategory = categoryMap.get(categoryId) ?? {
        categoryId,
        categoryName,
        totalValue: 0,
        localValue: 0,
        localPercentage: 0,
      };
      existingCategory.totalValue += amount;
      if (isLocal) existingCategory.localValue += amount;
      categoryMap.set(categoryId, existingCategory);

      const monthKey = bid.submittedAt.toISOString().slice(0, 7); // 'YYYY-MM'
      const existingMonth = monthMap.get(monthKey) ?? { totalValue: 0, localValue: 0 };
      existingMonth.totalValue += amount;
      if (isLocal) existingMonth.localValue += amount;
      monthMap.set(monthKey, existingMonth);
    }

    const byCategory = Array.from(categoryMap.values())
      .map((c) => ({ ...c, localPercentage: percentage(c.localValue, c.totalValue) }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const monthlyTrend = buildTrendSeries(monthMap, TREND_MONTHS);

    const recentAwards: RecentAward[] = acceptedBids.slice(0, 5).map((bid: AcceptedBidWithRelations) => ({
      bidId: bid.id,
      supplierName: bid.supplier.name,
      isLocallyOwned: bid.supplier.isLocallyOwned,
      categoryName: bid.rfq.category.name,
      amount: Number(bid.amount),
      currency: bid.currency,
      awardedAt: bid.submittedAt.toISOString(),
    }));

    return {
      totalAwardedValue,
      localAwardedValue,
      localContentPercentage: percentage(localAwardedValue, totalAwardedValue),
      verifiedLocalSuppliersEngaged: localSupplierIds.size,
      openRfqCount,
      byCategory,
      monthlyTrend,
      recentAwards,
    };
  }
}

function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10; // one decimal place
}

// Always returns the last N months, even ones with no awards, so the
// frontend can render a continuous trend line instead of gapped data.
function buildTrendSeries(
  monthMap: Map<string, { totalValue: number; localValue: number }>,
  months: number,
): MonthlyTrendPoint[] {
  const series: MonthlyTrendPoint[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const entry = monthMap.get(key) ?? { totalValue: 0, localValue: 0 };
    series.push({
      month: key,
      totalValue: entry.totalValue,
      localValue: entry.localValue,
      localPercentage: percentage(entry.localValue, entry.totalValue),
    });
  }
  return series;
}
