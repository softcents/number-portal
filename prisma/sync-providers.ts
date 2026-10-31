import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Synchronizing Providers and Display Companies...");

  // 1. Ensure ICC provider
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
  console.log("✓ ICC Provider:", icc.id);

  // 2. Ensure ICON provider
  const icon = await prisma.provider.upsert({
    where: { code: "ICON" },
    update: {},
    create: {
      code: "ICON",
      name: "ICON Infotech Admin",
      loginUrl: "http://iptspkyc.icon-infotech.net:81/login/",
      isActive: true,
      notes: "ICON provider — short code 09644",
    },
  });
  console.log("✓ ICON Provider:", icon.id);

  // 3. Ensure RANKSITT provider
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
  console.log("✓ RANKSITT Provider:", ranks.id);

  // 4. Ensure Display Companies for only the three short codes (names = codes, no brand names)
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
    console.log(`✓ Display Company ${dc.code}:`, company.id);
  }

  // Deactivate legacy display codes (like 09678, 09696)
  const deactivated = await prisma.displayCompany.updateMany({
    where: { code: { notIn: displayCodes.map((d) => d.code) } },
    data: { isActive: false },
  });
  console.log(`✓ Deactivated ${deactivated.count} legacy display codes`);

  // 5. Synchronize existing numbers in DB
  const dc09639 = await prisma.displayCompany.findUnique({ where: { code: "09639" } });
  const dc09644 = await prisma.displayCompany.findUnique({ where: { code: "09644" } });
  const dc09617 = await prisma.displayCompany.findUnique({ where: { code: "09617" } });

  if (ranks && dc09617) {
    const updatedRanks = await prisma.number.updateMany({
      where: {
        OR: [
          { number: { startsWith: "09617" } },
          { normalizedNumber: { startsWith: "8809617" } },
          { normalizedNumber: { startsWith: "09617" } },
        ],
      },
      data: { providerId: ranks.id, displayCompanyId: dc09617.id },
    });
    console.log(`✓ Synchronized ${updatedRanks.count} numbers to RANKS (09617)`);
  }

  if (icon && dc09644) {
    const updatedIcon = await prisma.number.updateMany({
      where: {
        OR: [
          { number: { startsWith: "09644" } },
          { normalizedNumber: { startsWith: "8809644" } },
          { normalizedNumber: { startsWith: "09644" } },
        ],
      },
      data: { providerId: icon.id, displayCompanyId: dc09644.id },
    });
    console.log(`✓ Synchronized ${updatedIcon.count} numbers to ICON (09644)`);
  }

  if (icc && dc09639) {
    const updatedIcc = await prisma.number.updateMany({
      where: {
        OR: [
          { number: { startsWith: "09639" } },
          { normalizedNumber: { startsWith: "8809639" } },
          { normalizedNumber: { startsWith: "09639" } },
        ],
      },
      data: { providerId: icc.id, displayCompanyId: dc09639.id },
    });
    console.log(`✓ Synchronized ${updatedIcc.count} numbers to ICC (09639)`);
  }

  console.log("Providers and short codes sync completed successfully.");
}

main()
  .catch((err) => {
    console.error("Sync error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
