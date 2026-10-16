// Creates a VERIFIER or PLATFORM_ADMIN account from the command line. Signup
// only ever creates mine / supplier users, so this is how the first platform
// admin is made; after that, admins manage staff on the Staff page.
//
// Usage (from backend/):
//   npm run create:staff -- --email someone@example.com --name "Full Name" [--role VERIFIER|PLATFORM_ADMIN]
//
// Staff users belong to the portal's own PLATFORM company, created on first
// use. A random temporary password is printed once — or, with
// --password-file <path>, written to that file instead of the terminal — and
// the app asks for a new one at first sign-in.
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { writeFileSync } from 'fs';
import { STAFF_ROLES, platformCompany, temporaryPassword } from '../src/staff/staff-accounts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(message);
  console.error('Usage: npm run create:staff -- --email <email> --name "<full name>" [--role VERIFIER|PLATFORM_ADMIN] [--password-file <path>]');
  process.exit(1);
}

async function main() {
  const email = arg('email')?.trim();
  const fullName = arg('name')?.trim();
  const role = (arg('role') ?? UserRole.VERIFIER).toUpperCase() as UserRole;
  const passwordFile = arg('password-file');

  if (!email || !fullName) fail('Both --email and --name are required.');
  if (!STAFF_ROLES.includes(role)) fail(`--role must be one of ${STAFF_ROLES.join(', ')}.`);

  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email } })) {
      fail(`A user with email ${email} already exists.`);
    }

    const company = await platformCompany(prisma);
    const password = temporaryPassword();
    await prisma.user.create({
      data: {
        companyId: company.id,
        email,
        fullName,
        role,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
      },
    });

    console.log(`Created ${role} ${email} in "${company.name}".`);
    if (passwordFile) {
      writeFileSync(passwordFile, `${email}\n${password}\n`, { flag: 'a' });
      console.log(`Temporary password written to ${passwordFile}.`);
    } else {
      console.log(`Temporary password (shown once — they'll be asked to choose their own at first sign-in): ${password}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
