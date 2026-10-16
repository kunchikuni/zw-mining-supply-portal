import { CompanyType, PrismaClient, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';

// Shared by the Staff page (StaffService) and `npm run create:staff`, so both
// make staff accounts the same way.

export const PLATFORM_COMPANY_NAME = 'ZW Supplier Portal operations';
export const STAFF_ROLES: UserRole[] = [UserRole.VERIFIER, UserRole.PLATFORM_ADMIN];

// What the Staff page shows about an account — never the password hash.
export const STAFF_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  createdAt: true,
  disabledAt: true,
  mustChangePassword: true,
} as const;

// 16 URL-safe characters. Shown once; the user is asked to replace it.
export function temporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

// Staff belong to the portal's own company, created on first use.
export async function platformCompany(prisma: Pick<PrismaClient, 'company'>) {
  return (
    (await prisma.company.findFirst({ where: { type: CompanyType.PLATFORM } })) ??
    (await prisma.company.create({ data: { name: PLATFORM_COMPANY_NAME, type: CompanyType.PLATFORM } }))
  );
}
