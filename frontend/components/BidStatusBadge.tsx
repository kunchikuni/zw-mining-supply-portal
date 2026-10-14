import type { BidStatus } from '@/lib/types';
import { Badge } from './Badge';

const TONE: Record<BidStatus, 'neutral' | 'copper' | 'chrome' | 'danger'> = {
  SUBMITTED: 'neutral',
  SHORTLISTED: 'copper',
  ACCEPTED: 'chrome',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  SUPERSEDED: 'neutral',
};

// "Superseded" is the schema's word; people say a bid was replaced.
const LABEL: Partial<Record<BidStatus, string>> = { SUPERSEDED: 'Replaced' };

export function BidStatusBadge({ status }: { status: BidStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}
