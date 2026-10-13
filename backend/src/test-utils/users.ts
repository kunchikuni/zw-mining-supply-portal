import type { JwtPayload } from '../auth/jwt.strategy';

// A decoded-JWT caller, as controllers and services receive it.
export function user(companyId: string, role = 'COMPANY_MEMBER'): JwtPayload {
  return { sub: `u-${companyId}`, email: `${companyId}@example.test`, companyId, role };
}

// Turns a hand-rolled fake into the service's constructor parameter type.
// Fakes implement only the Prisma calls the code under test makes.
export function asPrisma<T>(fake: unknown): T {
  return fake as T;
}

export type Row = Record<string, any>;
