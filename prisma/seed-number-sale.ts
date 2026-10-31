/**
 * Seed: Number Sale foundation data
 * Run: npx ts-node -e "require('./prisma/seed-number-sale.ts')"
 * Or:  npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Number Sale foundation data...");

  // ── ICC Provider ───────────────────────────────────────────────────────────
  const icc = await prisma.provider.upsert({
    where: { code: "ICC" },
    update: {},
    create: {
      code: "ICC",
      name: "ICC Admin Panel",
      loginUrl: "https://iccfios.net/icc-form/index.php/admin/login",
      isActive: true,
      notes: "ICC provider — auto-login httpx session via Python worker",
    },
  });
  console.log("✓ Provider ICC:", icc.id);

  // Store ICC credentials (base64 encoded, same as icc_client.py)
  await prisma.providerCredential.upsert({
    where: { providerId: icc.id },
    update: {},
    create: {
      providerId: icc.id,
      username: "Softcents",
      encryptedPassword: Buffer.from("Softcents@09639").toString("base64"),
    },
  });
  console.log("✓ ICC credentials stored");

  // ── ICON Provider ──────────────────────────────────────────────────────────
  const icon = await prisma.provider.upsert({
    where: { code: "ICON" },
    update: {},
    create: {
      code: "ICON",
      name: "ICON Infotech Admin",
      loginUrl: "http://iptspkyc.icon-infotech.net:81/login/",
      isActive: true,
      notes: "ICON provider — web automation pending (same pattern as ICC)",
    },
  });
  console.log("✓ Provider ICON:", icon.id);

  await prisma.providerCredential.upsert({
    where: { providerId: icon.id },
    update: {},
    create: {
      providerId: icon.id,
      username: "SoFtceNts",
      encryptedPassword: Buffer.from("SoFtceNts321").toString("base64"),
    },
  });
  console.log("✓ ICON credentials stored");

  // ── RANKSITT Provider ───────────────────────────────────────────────────────
  const ranks = await prisma.provider.upsert({
    where: { code: "RANKSITT" },
    update: { name: "Ranksitt Admin Panel" },
    create: {
      code: "RANKSITT",
      name: "Ranksitt Admin Panel",
      loginUrl: "",
      isActive: true,
      notes: "Ranksitt provider — short code 09617",
    },
  });
  console.log("✓ Provider RANKSITT:", ranks.id);

  // ── Display Companies (provider codes shown to customers) ─────────────────
  const displayCodes = [
    { code: "09639", name: "09639" },
    { code: "09644", name: "09644" },
    { code: "09617", name: "09617" },
  ];

  for (const dc of displayCodes) {
    const company = await prisma.displayCompany.upsert({
      where: { code: dc.code },
      update: { name: dc.name, isActive: true },
      create: { code: dc.code, name: dc.name, isActive: true },
    });
    console.log(`✓ Display company ${dc.code}:`, company.id);
  }

  // Deactivate any legacy display codes
  await prisma.displayCompany.updateMany({
    where: { code: { notIn: displayCodes.map((d) => d.code) } },
    data: { isActive: false },
  });

  console.log("\nSeeding complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
