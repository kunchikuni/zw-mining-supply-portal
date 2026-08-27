import { Badge } from './Badge';
import type { VerificationStatus } from '@/lib/types';

const CONFIG: Record<VerificationStatus, { label: string; tone: 'neutral' | 'copper' | 'chrome' | 'danger' }> = {
  UNVERIFIED: { label: 'Unverified', tone: 'neutral' },
  PENDING: { label: 'Verification pending', tone: 'copper' },
  VERIFIED: { label: 'Verified', tone: 'chrome' },
  REJECTED: { label: 'Verification rejected', tone: 'danger' },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
