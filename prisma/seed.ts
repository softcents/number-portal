import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = "Admin";
  const rawPassword = "Admin123#";

  // Hash password using bcryptjs
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const admin = await prisma.admin.upsert({
    where: { username },
    update: {
      password: hashedPassword,
    },
    create: {
      username,
      password: hashedPassword,
    },
  });

  console.log(`[Database Seeder] Admin user created/updated successfully:`);
  console.log(`  Username: ${admin.username}`);
  console.log(`  ID: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error("[Database Seeder] Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
