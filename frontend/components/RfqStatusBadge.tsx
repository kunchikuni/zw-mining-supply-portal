import { Badge } from './Badge';
import type { RfqStatus } from '@/lib/types';

const CONFIG: Record<RfqStatus, { label: string; tone: 'neutral' | 'copper' | 'chrome' | 'danger' }> = {
  OPEN: { label: 'Open', tone: 'chrome' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  AWARDED: { label: 'Awarded', tone: 'copper' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

// `biddingOpen` matters only for status OPEN: an RFQ past its deadline keeps
// that status until its mine acts, and a green "Open" badge on it would say
// the opposite of what the bid form can do.
export function RfqStatusBadge({
  status,
  biddingOpen = true,
}: {
  status: RfqStatus;
  biddingOpen?: boolean;
}) {
  if (status === 'OPEN' && !biddingOpen) {
    return <Badge tone="neutral">Bidding closed</Badge>;
  }
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
