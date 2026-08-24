import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  'PPE & safety equipment',
  'Mining equipment & spares',
  'Earthmoving & haulage',
  'Chemicals & reagents',
  'Construction materials',
  'Plant & equipment maintenance',
  'Catering & hospitality',
  'Security services',
  'Transport & logistics',
  'Tools & hardware',
  'Electrical & instrumentation',
  'Fuel & lubricants',
  'Civil works & construction',
  'Blasting services',
];

async function main() {
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
