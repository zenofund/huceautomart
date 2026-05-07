import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  inspectorProfilesTable,
  buyerProfilesTable,
  sellerProfilesTable,
  walletAccountsTable,
  inspectionTypesTable,
  inspectionsTable,
  listingsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function ensureUser(args: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "inspector" | "buyer" | "seller";
}) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, args.email))
    .limit(1);
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(args.password, 12);
  const [created] = await db
    .insert(usersTable)
    .values({
      email: args.email,
      passwordHash,
      firstName: args.firstName,
      lastName: args.lastName,
      role: args.role,
      emailVerified: true,
    })
    .returning();
  return created!;
}

async function ensureWallet(userId: number) {
  const [existing] = await db
    .select()
    .from(walletAccountsTable)
    .where(eq(walletAccountsTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(walletAccountsTable)
    .values({ userId, balance: 0, currency: "NGN" })
    .returning();
  return created!;
}

async function ensureInspectionType(name: string, price: number) {
  const all = await db.select().from(inspectionTypesTable);
  const found = all.find((t) => t.name === name);
  if (found) return found;
  const [created] = await db
    .insert(inspectionTypesTable)
    .values({ name, price, durationHours: 2, isActive: true })
    .returning();
  return created!;
}

async function main() {
  console.log("🌱 Seeding inspector test account...");

  const inspector = await ensureUser({
    email: "inspector@huceautos.test",
    password: "Inspector123!",
    firstName: "Inspection",
    lastName: "Officer",
    role: "inspector",
  });
  console.log(`✓ inspector user id=${inspector.id} (${inspector.email})`);

  // Inspector profile
  const [existingProfile] = await db
    .select()
    .from(inspectorProfilesTable)
    .where(eq(inspectorProfilesTable.userId, inspector.id))
    .limit(1);
  if (!existingProfile) {
    await db.insert(inspectorProfilesTable).values({
      userId: inspector.id,
      licenseNumber: "INS-2026-0001",
      serviceArea: "Lagos / Abuja",
      bio: "Experienced vehicle inspector with 8+ years on the road.",
      rating: 4.8,
      totalInspections: 0,
      isAvailable: true,
    });
    console.log("✓ inspector profile");
  } else {
    console.log("• inspector profile already exists");
  }

  await ensureWallet(inspector.id);
  console.log("✓ wallet");

  // Need a buyer + a listing to attach inspections to.
  const buyer = await ensureUser({
    email: "buyer.demo@huceautos.test",
    password: "Buyer123!",
    firstName: "Demo",
    lastName: "Buyer",
    role: "buyer",
  });
  const [existingBuyerProfile] = await db
    .select()
    .from(buyerProfilesTable)
    .where(eq(buyerProfilesTable.userId, buyer.id))
    .limit(1);
  if (!existingBuyerProfile) {
    await db.insert(buyerProfilesTable).values({ userId: buyer.id });
  }
  await ensureWallet(buyer.id);
  console.log(`✓ demo buyer id=${buyer.id}`);

  const fullType = await ensureInspectionType("Full Inspection", 25000);
  const basicType = await ensureInspectionType("Basic Inspection", 12000);
  console.log(`✓ inspection types (${fullType.id}, ${basicType.id})`);

  // Pick three listings to attach inspections to.
  const listings = await db.select().from(listingsTable).limit(3);
  if (listings.length === 0) {
    console.log(
      "⚠ no listings in DB — skipping inspection rows. Inspector dashboard will show empty stats.",
    );
  } else {
    // Only insert if this inspector has no inspections yet (idempotent).
    const existing = await db
      .select()
      .from(inspectionsTable)
      .where(eq(inspectionsTable.inspectorId, inspector.id))
      .limit(1);
    if (existing.length === 0) {
      const now = Date.now();
      const day = 86_400_000;
      const rows = [
        {
          listingId: listings[0]!.id,
          buyerId: buyer.id,
          inspectorId: inspector.id,
          inspectionTypeId: fullType.id,
          status: "completed" as const,
          scheduledAt: new Date(now - 7 * day),
          completedAt: new Date(now - 7 * day + 3 * 3600_000),
          inspectionLocation: "Ikeja, Lagos",
          fee: 25000,
          inspectorEarnings: 20000,
          platformFee: 5000,
        },
        {
          listingId: listings[1 % listings.length]!.id,
          buyerId: buyer.id,
          inspectorId: inspector.id,
          inspectionTypeId: fullType.id,
          status: "completed" as const,
          scheduledAt: new Date(now - 14 * day),
          completedAt: new Date(now - 14 * day + 2 * 3600_000),
          inspectionLocation: "Maitama, Abuja",
          fee: 25000,
          inspectorEarnings: 20000,
          platformFee: 5000,
        },
        {
          listingId: listings[2 % listings.length]!.id,
          buyerId: buyer.id,
          inspectorId: inspector.id,
          inspectionTypeId: basicType.id,
          status: "active" as const,
          scheduledAt: new Date(now + 1 * day),
          inspectionLocation: "Lekki, Lagos",
          fee: 12000,
          inspectorEarnings: 9000,
          platformFee: 3000,
        },
        {
          listingId: listings[0]!.id,
          buyerId: buyer.id,
          inspectorId: inspector.id,
          inspectionTypeId: fullType.id,
          status: "assigned" as const,
          scheduledAt: new Date(now + 3 * day),
          inspectionLocation: "Victoria Island, Lagos",
          fee: 25000,
          inspectorEarnings: 20000,
          platformFee: 5000,
        },
      ];
      await db.insert(inspectionsTable).values(rows);
      console.log(`✓ inserted ${rows.length} sample inspections`);
    } else {
      console.log("• inspections already exist for this inspector");
    }
  }

  // Suppress unused-import warning for sellerProfilesTable; kept in scope so the
  // file documents the related tables, even though we don't seed sellers here.
  void sellerProfilesTable;

  console.log("\n🎉 Seed complete.");
  console.log("─".repeat(48));
  console.log("Inspector login:");
  console.log("  email:    inspector@huceautos.test");
  console.log("  password: Inspector123!");
  console.log("Buyer login (for testing the other side):");
  console.log("  email:    buyer.demo@huceautos.test");
  console.log("  password: Buyer123!");
  console.log("─".repeat(48));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
