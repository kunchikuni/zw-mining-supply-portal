'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStaff, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { IssuedPassword, StaffMember } from '@/lib/types';
import { AddStaffForm } from '@/components/AddStaffForm';
import { StaffRow } from '@/components/StaffRow';
import { TemporaryPassword } from '@/components/TemporaryPassword';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';

// Platform admins manage the portal's own staff here: add verifiers and
// admins, disable or re-enable them, and reset passwords. Every rule is the
// server's (GET/POST/PATCH /staff); this page only offers what it allows.
export default function StaffPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<(IssuedPassword & { reason: 'created' | 'reset' }) | null>(null);
  // The stored token loads after the first render; only the latest request
  // may update the list.
  const latest = useRef(0);

  const load = useCallback(
    (showSkeleton: boolean) => {
      if (!token || !isAdmin) {
        setLoading(false);
        return;
      }
      const ticket = ++latest.current;
      if (showSkeleton) setLoading(true);
      setError(null);
      getStaff(token)
        .then((list) => {
          if (ticket === latest.current) setStaff(list);
        })
        .catch((err) => {
          if (ticket === latest.current) setError(err instanceof ApiError ? err.message : 'Could not load staff.');
        })
        .finally(() => {
          if (ticket === latest.current) setLoading(false);
        });
    },
    [token, isAdmin],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  if (!user || !isAdmin) {
    return (
      <EmptyState
        title="Platform admins only"
        description="Staff accounts are managed by the portal's platform admins."
      />
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Portal staff"
        title="Staff accounts"
        description="Verifiers review documents and verify companies; platform admins also manage staff. New accounts and password resets get a temporary password, shown once."
      />

      {issued && (
        <TemporaryPassword
          email={issued.user.email}
          password={issued.temporaryPassword}
          reason={issued.reason}
          onDismiss={() => setIssued(null)}
        />
      )}

      <div className="grid items-start gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h2 className="mb-4 section-title">Staff ({staff.length})</h2>
          {loading ? (
            <CardSkeleton />
          ) : error ? (
            <ErrorBanner message={error} />
          ) : (
            <ul className="card divide-y divide-gray-100">
              {staff.map((member) => (
                <StaffRow
                  key={member.id}
                  member={member}
                  isSelf={member.id === user.sub}
                  onChanged={refresh}
                  onPasswordIssued={(result) => setIssued({ ...result, reason: 'reset' })}
                />
              ))}
            </ul>
          )}
        </div>
        <AddStaffForm
          onCreated={(result) => {
            setIssued({ ...result, reason: 'created' });
            refresh();
          }}
        />
      </div>
    </div>
  );
}
