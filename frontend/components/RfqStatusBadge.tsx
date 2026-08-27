import { Badge } from './Badge';
import type { RfqStatus } from '@/lib/types';

const CONFIG: Record<RfqStatus, { label: string; tone: 'neutral' | 'copper' | 'chrome' | 'danger' }> = {
  OPEN: { label: 'Open', tone: 'chrome' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  AWARDED: { label: 'Awarded', tone: 'copper' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
