import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../../.env") });

import {
  usersTable,
  sellerProfilesTable,
  buyerProfilesTable,
  inspectorProfilesTable,
  listingsTable,
  listingImagesTable,
} from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ─── Image map by make ────────────────────────────────────────────────────────

const IMAGES: Record<string, string[]> = {
  Toyota: [
    "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&q=80",
    "https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=800&q=80",
  ],
  Honda: [
    "https://images.unsplash.com/photo-1588258219511-64eb629cb833?w=800&q=80",
    "https://images.unsplash.com/photo-1614200179396-2bdb77ebf81b?w=800&q=80",
  ],
  "Mercedes-Benz": [
    "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80",
    "https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800&q=80",
  ],
  BMW: [
    "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
    "https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?w=800&q=80",
  ],
  Lexus: [
    "https://images.unsplash.com/photo-1614200179396-2bdb77ebf81b?w=800&q=80",
    "https://images.unsplash.com/photo-1563694983011-6f4d90358083?w=800&q=80",
  ],
  Hyundai: [
    "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800&q=80",
    "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80",
  ],
  Kia: [
    "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&q=80",
    "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&q=80",
  ],
  Audi: [
    "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80",
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
  ],
  Ford: [
    "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80",
    "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80",
  ],
  Volkswagen: [
    "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&q=80",
    "https://images.unsplash.com/photo-1600712242805-5f78671b24da?w=800&q=80",
  ],
  Porsche: [
    "https://images.unsplash.com/photo-1606152421802-db97b9c7a11b?w=800&q=80",
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
  ],
  default: [
    "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80",
    "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80",
  ],
};

function img(make: string): string[] {
  return IMAGES[make] ?? IMAGES.default;
}

// ─── Car listings data ────────────────────────────────────────────────────────

type ListingSeed = {
  make: string; model: string; year: number; price: number;
  condition: "new" | "used" | "certified_pre_owned";
  location: string; mileage: number; color: string;
  carType: string; transmission: string; fuelType: string; driveType: string;
  doors: number; description: string; isFeatured: boolean;
};

const listingSeeds: ListingSeed[] = [
  // Toyota
  { make:"Toyota", model:"Camry", year:2020, price:9_500_000, condition:"used", location:"Lagos", mileage:42000, color:"Pearl White", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Foreign used Toyota Camry in excellent condition. Single owner, well maintained, no accident history. Full leather interior, push-to-start, backup camera.", isFeatured:true },
  { make:"Toyota", model:"Camry", year:2018, price:7_200_000, condition:"used", location:"Abuja", mileage:68000, color:"Midnight Black", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Registered Toyota Camry SE. Clean and neat, no hidden fault. Available for test drive in Abuja.", isFeatured:false },
  { make:"Toyota", model:"Corolla", year:2019, price:6_800_000, condition:"used", location:"Port Harcourt", mileage:55000, color:"Silver", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Foreign used Toyota Corolla LE. Fuel-efficient and reliable. Recent service done.", isFeatured:false },
  { make:"Toyota", model:"Corolla", year:2022, price:11_500_000, condition:"new", location:"Lagos", mileage:0, color:"Super White", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Brand new Toyota Corolla 2022 model. Full manufacturer warranty. Registered Lagos plate available.", isFeatured:true },
  { make:"Toyota", model:"Highlander", year:2019, price:22_000_000, condition:"used", location:"Abuja", mileage:49000, color:"Predawn Gray", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used Toyota Highlander XLE V6. 7-seater, sunroof, leather seats, navigation. Pristine condition.", isFeatured:true },
  { make:"Toyota", model:"Highlander", year:2021, price:31_000_000, condition:"used", location:"Lagos", mileage:22000, color:"Blizzard Pearl", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Toyota Highlander XLE. Virtually brand new. Loaded with all options.", isFeatured:false },
  { make:"Toyota", model:"Land Cruiser", year:2020, price:68_000_000, condition:"used", location:"Abuja", mileage:35000, color:"White Pearl", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"4WD", doors:4, description:"Foreign used Toyota Land Cruiser GXR. V8 engine, no accident, full options. The best SUV money can buy.", isFeatured:true },
  { make:"Toyota", model:"RAV4", year:2020, price:17_500_000, condition:"used", location:"Lagos", mileage:38000, color:"Magnetic Gray", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Toyota RAV4 Adventure trim. All-wheel drive, heated seats, Apple CarPlay. Ready for Lagos roads.", isFeatured:false },
  { make:"Toyota", model:"Venza", year:2021, price:24_000_000, condition:"used", location:"Abuja", mileage:28000, color:"Coastal Gray", carType:"SUV", transmission:"Automatic", fuelType:"Hybrid", driveType:"AWD", doors:4, description:"Foreign used Toyota Venza Hybrid. Panoramic sunroof, 12.3 inch touchscreen, JBL audio. Save on fuel.", isFeatured:true },
  // Honda
  { make:"Honda", model:"Accord", year:2019, price:8_500_000, condition:"used", location:"Lagos", mileage:52000, color:"Lunar Silver", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Foreign used Honda Accord Sport 2.0T. Turbo engine, 19-inch wheels, sport exhaust. Clean title.", isFeatured:false },
  { make:"Honda", model:"Accord", year:2021, price:13_000_000, condition:"used", location:"Abuja", mileage:18000, color:"Sonic Gray Pearl", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Honda Accord 2021 EX-L. Loaded! Leather, heated seats, wireless Apple CarPlay, Honda Sensing safety suite.", isFeatured:true },
  { make:"Honda", model:"CR-V", year:2020, price:14_500_000, condition:"used", location:"Lagos", mileage:40000, color:"Obsidian Blue", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Honda CR-V EX-L AWD. Turbocharged, panoramic roof, hands-free liftgate. Perfect family SUV.", isFeatured:false },
  { make:"Honda", model:"Civic", year:2020, price:7_800_000, condition:"used", location:"Ibadan", mileage:44000, color:"Rallye Red", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Tokunbo Honda Civic Sport. Sporty sedan with turbocharged 1.5L engine. Low mileage, clean title.", isFeatured:false },
  // Mercedes-Benz
  { make:"Mercedes-Benz", model:"C300", year:2020, price:23_000_000, condition:"used", location:"Lagos", mileage:36000, color:"Polar White", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"RWD", doors:4, description:"Foreign used Mercedes-Benz C300 AMG Line. Panoramic roof, Burmester sound, ambient lighting. Well maintained.", isFeatured:true },
  { make:"Mercedes-Benz", model:"GLE450", year:2020, price:45_000_000, condition:"used", location:"Abuja", mileage:29000, color:"Selenite Gray", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Mercedes GLE450 4MATIC. AMG package, air suspension, 360 camera. Ultimate luxury SUV.", isFeatured:true },
  { make:"Mercedes-Benz", model:"E350", year:2019, price:28_500_000, condition:"used", location:"Lagos", mileage:41000, color:"Obsidian Black", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"RWD", doors:4, description:"Mercedes-Benz E350 with AMG trim. Massage seats, head-up display, widescreen cockpit. Flagship comfort.", isFeatured:false },
  { make:"Mercedes-Benz", model:"GLC300", year:2021, price:38_000_000, condition:"used", location:"Lagos", mileage:19000, color:"Iridium Silver", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Nearly new GLC300 4MATIC. Panoramic sunroof, MBUX infotainment, Burmester audio. Only 19k miles.", isFeatured:true },
  // BMW
  { make:"BMW", model:"320i", year:2019, price:18_500_000, condition:"used", location:"Lagos", mileage:47000, color:"Mineral White", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"RWD", doors:4, description:"Foreign used BMW 320i Sport Line. Dynamic package, M Sport steering wheel, heated seats. Drives beautifully.", isFeatured:false },
  { make:"BMW", model:"X5 xDrive40i", year:2020, price:48_000_000, condition:"used", location:"Abuja", mileage:32000, color:"Phytonic Blue", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo BMW X5 xDrive40i. M Sport package, panoramic roof, Harman Kardon, gesture control. Stunning.", isFeatured:true },
  { make:"BMW", model:"530i", year:2021, price:38_000_000, condition:"used", location:"Lagos", mileage:22000, color:"Carbon Black", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"RWD", doors:4, description:"BMW 5 Series 530i Luxury Line. Laser headlights, Bowers & Wilkins sound, driving assistant pro.", isFeatured:false },
  { make:"BMW", model:"X3 xDrive30i", year:2020, price:28_000_000, condition:"used", location:"Port Harcourt", mileage:38000, color:"Alpine White", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used BMW X3 xDrive30i. Panoramic roof, navigation, heated leather seats. Perfect condition.", isFeatured:false },
  // Lexus
  { make:"Lexus", model:"ES 350", year:2020, price:18_000_000, condition:"used", location:"Lagos", mileage:35000, color:"Eminent White Pearl", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Tokunbo Lexus ES350 Luxury. 12.3 inch display, Mark Levinson audio, ventilated seats. Japanese quality.", isFeatured:true },
  { make:"Lexus", model:"RX 350", year:2021, price:32_000_000, condition:"used", location:"Abuja", mileage:24000, color:"Sonic Titanium", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used Lexus RX350 F Sport. Panoramic moonroof, 12.3 inch display, 3-zone climate. Exceptional.", isFeatured:true },
  { make:"Lexus", model:"LX 570", year:2019, price:62_000_000, condition:"used", location:"Abuja", mileage:42000, color:"Liquid Platinum", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"4WD", doors:4, description:"Foreign used Lexus LX570 full option. 8-seater, triple-zone climate, rear entertainment.", isFeatured:true },
  // Hyundai
  { make:"Hyundai", model:"Sonata", year:2020, price:7_500_000, condition:"used", location:"Ibadan", mileage:50000, color:"Electric Shadow", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Tokunbo Hyundai Sonata SEL Plus. Panoramic sunroof, Bose sound, wireless charging. Top value sedan.", isFeatured:false },
  { make:"Hyundai", model:"Tucson", year:2021, price:12_000_000, condition:"used", location:"Lagos", mileage:30000, color:"Amazon Gray", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used Hyundai Tucson Limited. 10.25 inch touchscreen, safe exit assist, panoramic sunroof.", isFeatured:false },
  { make:"Hyundai", model:"Santa Fe", year:2020, price:15_500_000, condition:"used", location:"Abuja", mileage:40000, color:"Typhoon Silver", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Hyundai Santa Fe Calligraphy. Quilted Nappa leather, panoramic sunroof, BOSE premium audio.", isFeatured:false },
  // Kia
  { make:"Kia", model:"Sportage", year:2020, price:9_500_000, condition:"used", location:"Port Harcourt", mileage:46000, color:"Snow White Pearl", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used Kia Sportage EX Premium. Panoramic sunroof, Bose audio, ventilated seats. Reliable family car.", isFeatured:false },
  { make:"Kia", model:"Stinger", year:2020, price:18_000_000, condition:"used", location:"Lagos", mileage:32000, color:"Sunset Yellow", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Rare Kia Stinger GT AWD. 365hp twin-turbo V6. 0-60 in 4.6 seconds. Head-turning performance sedan.", isFeatured:true },
  { make:"Kia", model:"Telluride", year:2021, price:19_500_000, condition:"used", location:"Abuja", mileage:27000, color:"Aurora Black", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Kia Telluride SX. 8-seater, dual sunroof, Harman Kardon, ventilated seats. Spacious and premium.", isFeatured:false },
  // Audi
  { make:"Audi", model:"A6", year:2020, price:26_000_000, condition:"used", location:"Lagos", mileage:33000, color:"Mythos Black", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used Audi A6 Prestige. Virtual cockpit, MMI touch response, B&O audio. German engineering.", isFeatured:false },
  { make:"Audi", model:"Q7", year:2020, price:42_000_000, condition:"used", location:"Abuja", mileage:28000, color:"Glacier White", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Audi Q7 Prestige. Air suspension, adaptive headlights, 3rd row seating. Absolute luxury SUV.", isFeatured:true },
  { make:"Audi", model:"Q5", year:2021, price:28_500_000, condition:"used", location:"Lagos", mileage:21000, color:"Navarra Blue", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Nearly new Audi Q5 Premium Plus. Virtual cockpit, panoramic sunroof, adaptive cruise. Loaded.", isFeatured:false },
  // Ford
  { make:"Ford", model:"Explorer", year:2020, price:21_000_000, condition:"used", location:"Port Harcourt", mileage:44000, color:"Velocity Blue", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Ford Explorer XLT AWD. 7-seater, 10.1 inch touchscreen, Ford Co-Pilot360 safety suite.", isFeatured:false },
  { make:"Ford", model:"Mustang", year:2021, price:28_000_000, condition:"used", location:"Lagos", mileage:18000, color:"Grabber Blue", carType:"Coupe", transmission:"Automatic", fuelType:"Petrol", driveType:"RWD", doors:2, description:"American muscle in Lagos! Ford Mustang GT 5.0 V8. 450hp, Brembo brakes, Recaro seats. Thunderous.", isFeatured:true },
  { make:"Ford", model:"Ranger", year:2020, price:15_000_000, condition:"used", location:"Port Harcourt", mileage:60000, color:"Race Red", carType:"Truck", transmission:"Automatic", fuelType:"Diesel", driveType:"4WD", doors:4, description:"Foreign used Ford Ranger Wildtrak 4x4. Bi-turbo diesel, off-road package, bed liner, tow bar.", isFeatured:false },
  // Volkswagen
  { make:"Volkswagen", model:"Tiguan", year:2020, price:14_500_000, condition:"used", location:"Lagos", mileage:37000, color:"Deep Black Pearl", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used Volkswagen Tiguan SEL R-Line. Panoramic sunroof, Fender audio, 3rd row seating option.", isFeatured:false },
  { make:"Volkswagen", model:"Passat", year:2020, price:11_500_000, condition:"used", location:"Abuja", mileage:48000, color:"Reflex Silver", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Tokunbo Volkswagen Passat SEL. Fender audio, digital cockpit, adaptive cruise control. Executive sedan.", isFeatured:false },
  // Porsche
  { make:"Porsche", model:"Cayenne", year:2020, price:65_000_000, condition:"used", location:"Lagos", mileage:25000, color:"Carrara White Metallic", carType:"SUV", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Tokunbo Porsche Cayenne S. 440hp V8, air suspension, PDCC, Bose Surround. The ultimate performance SUV.", isFeatured:true },
  { make:"Porsche", model:"Panamera", year:2021, price:72_000_000, condition:"used", location:"Abuja", mileage:17000, color:"Jet Black Metallic", carType:"Sedan", transmission:"Automatic", fuelType:"Petrol", driveType:"AWD", doors:4, description:"Foreign used Porsche Panamera 4S. 440hp, Sport Chrono, matrix LED, Burmester 3D. Executive perfection.", isFeatured:true },
  // New cars
  { make:"Toyota", model:"RAV4 Hybrid", year:2023, price:26_000_000, condition:"new", location:"Lagos", mileage:0, color:"Supersonic Red", carType:"SUV", transmission:"Automatic", fuelType:"Hybrid", driveType:"AWD", doors:4, description:"Brand new Toyota RAV4 Hybrid 2023. Superior fuel economy, safety suite, 8-inch touchscreen. Direct import.", isFeatured:true },
  { make:"Honda", model:"HR-V", year:2023, price:14_000_000, condition:"new", location:"Abuja", mileage:0, color:"Sonic Gray Pearl", carType:"Hatchback", transmission:"Automatic", fuelType:"Petrol", driveType:"FWD", doors:4, description:"Brand new Honda HR-V 2023. Sporty crossover with turbocharged engine and LaneWatch system.", isFeatured:false },
];

// ─── Main seed function ───────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding database...");

  // Clear existing data in proper dependency order
  await db.delete(listingImagesTable);
  await db.delete(listingsTable);
  await db.delete(sellerProfilesTable);
  await db.delete(buyerProfilesTable);
  await db.delete(inspectorProfilesTable);
  await db.delete(usersTable);
  console.log("✓ Cleared existing data");

  // ─── Create user accounts ────────────────────────────────────────────────

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const [seller] = await db.insert(usersTable).values({
    email: "seller@huceautos.com",
    passwordHash,
    firstName: "Emeka",
    lastName: "Okafor",
    phone: "+234-803-111-0001",
    role: "seller",
    accountType: "company",
    status: "active",
    emailVerified: true,
  }).returning();

  const [buyer] = await db.insert(usersTable).values({
    email: "buyer@huceautos.com",
    passwordHash,
    firstName: "Chioma",
    lastName: "Eze",
    phone: "+234-805-222-0002",
    role: "buyer",
    accountType: "individual",
    status: "active",
    emailVerified: true,
  }).returning();

  const [inspector] = await db.insert(usersTable).values({
    email: "inspector@huceautos.com",
    passwordHash,
    firstName: "Taiwo",
    lastName: "Adeyemi",
    phone: "+234-807-333-0003",
    role: "inspector",
    accountType: "individual",
    status: "active",
    emailVerified: true,
  }).returning();

  await db.insert(usersTable).values({
    email: "admin@huceautos.com",
    passwordHash,
    firstName: "Izuokumo",
    lastName: "Ebikake",
    phone: "+234-808-444-0004",
    role: "admin",
    accountType: "individual",
    status: "active",
    emailVerified: true,
  }).returning();

  console.log("✓ Created 4 user accounts (seller, buyer, inspector, admin)");
  console.log("  seller@huceautos.com    / Password123!");
  console.log("  buyer@huceautos.com     / Password123!");
  console.log("  inspector@huceautos.com / Password123!");
  console.log("  admin@huceautos.com     / Password123!");

  // ─── Create role profiles ────────────────────────────────────────────────

  await db.insert(sellerProfilesTable).values({
    userId: seller!.id,
    businessName: "Okafor Premium Motors",
    lotName: "OPM Showroom Lagos",
    verificationStatus: "verified",
    isVerified: true,
    rating: 4.9,
    totalListings: listingSeeds.length,
    totalSales: 12,
    bio: "Lagos-based certified dealer specialising in foreign-used and brand-new vehicles.",
    location: "Lagos",
  });

  await db.insert(buyerProfilesTable).values({
    userId: buyer!.id,
    billingAddress: "12 Adeola Odeku Street, Victoria Island, Lagos",
  });

  await db.insert(inspectorProfilesTable).values({
    userId: inspector!.id,
    licenseNumber: "NIS-2023-04581",
    serviceArea: "Lagos, Abuja, Port Harcourt",
    bio: "Certified vehicle inspector with 8 years of experience across Nigeria.",
    rating: 4.8,
    totalInspections: 230,
    isAvailable: true,
  });

  console.log("✓ Created seller, buyer, and inspector profiles");

  // ─── Insert listings ─────────────────────────────────────────────────────

  const insertedListings = await db
    .insert(listingsTable)
    .values(
      listingSeeds.map((l) => ({
        sellerId: seller!.id,
        title: `${l.year} ${l.make} ${l.model}`,
        make: l.make,
        model: l.model,
        year: l.year,
        price: l.price,
        condition: l.condition,
        location: l.location,
        mileage: l.mileage,
        color: l.color,
        carType: l.carType,
        transmission: l.transmission,
        fuelType: l.fuelType,
        driveType: l.driveType,
        doors: l.doors,
        description: l.description,
        isFeatured: l.isFeatured,
        status: "active" as const,
      })),
    )
    .returning();

  console.log(`✓ Inserted ${insertedListings.length} listings`);

  // ─── Attach images to each listing ──────────────────────────────────────

  const imageRows = insertedListings.flatMap((listing, idx) => {
    const seed = listingSeeds[idx]!;
    const urls = img(seed.make);
    return urls.map((url, order) => ({
      listingId: listing.id,
      url,
      mediaType: "image" as const,
      displayOrder: order,
      isPrimary: order === 0,
    }));
  });

  await db.insert(listingImagesTable).values(imageRows);
  console.log(`✓ Attached ${imageRows.length} images`);

  console.log("🎉 Seed complete!");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  pool.end();
  process.exit(1);
});
