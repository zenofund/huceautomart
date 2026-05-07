import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const existing = await client.query("SELECT COUNT(*) FROM sellers");
if (parseInt(existing.rows[0].count) > 0) {
  console.log("Database already seeded. Skipping.");
  await client.end();
  process.exit(0);
}

const sellers = [
  ["Chinedu Okafor", "Okafor Auto Hub", "Lagos, Nigeria", "+234 803 555 0101", "chinedu@okaforautohub.ng", true, 4.8, 42],
  ["Aisha Bello", "Bello Premium Motors", "Abuja, Nigeria", "+234 805 555 0202", "aisha@bellomotors.ng", true, 4.6, 31],
  ["Emeka Nwosu", "Nwosu Auto Mart", "Port Harcourt, Nigeria", "+234 807 555 0303", "emeka@nwosuautomart.ng", false, 4.2, 18],
  ["Folake Adeyemi", "Adeyemi Auto Sales", "Ibadan, Nigeria", "+234 809 555 0404", "folake@adeyemiauto.ng", true, 4.9, 55],
  ["Tunde Balogun", "Balogun Cars Ltd", "Lagos, Nigeria", "+234 802 555 0505", "tunde@baloguncars.ng", true, 4.7, 38],
  ["Ngozi Eze", "Eze Motors", "Enugu, Nigeria", "+234 806 555 0606", "ngozi@ezemotors.ng", false, 4.3, 22],
];

const insertedSellerIds = [];
for (const s of sellers) {
  const res = await client.query(
    `INSERT INTO sellers (name, lot_name, location, phone, email, verified, rating, total_listings) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    s
  );
  insertedSellerIds.push(res.rows[0].id);
}

console.log(`Inserted ${insertedSellerIds.length} sellers.`);

const sId = (i) => insertedSellerIds[i % insertedSellerIds.length];

const cars = [
  {
    make: "Toyota", model: "Camry", year: 2020, price: 18500000, condition: "used",
    location: "Lagos, Nigeria", mileage: 45000, color: "Pearl White",
    car_type: "Sedan", transmission: "Automatic", fuel_type: "Petrol", drive_type: "FWD", doors: 4,
    description: "Clean Tokunbo Toyota Camry. First body, accident-free, fully loaded with leather seats and reverse camera.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&q=80"]),
    seller_id: sId(0), featured: true
  },
  {
    make: "Honda", model: "Accord", year: 2019, price: 15200000, condition: "used",
    location: "Abuja, Nigeria", mileage: 60000, color: "Sonic Gray",
    car_type: "Sedan", transmission: "Automatic", fuel_type: "Petrol", drive_type: "FWD", doors: 4,
    description: "Naija-used Honda Accord in excellent condition. Bluetooth, reverse camera, AC chilling.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80"]),
    seller_id: sId(1), featured: false
  },
  {
    make: "Lexus", model: "RX 350", year: 2018, price: 32000000, condition: "used",
    location: "Lagos, Nigeria", mileage: 70000, color: "Obsidian Black",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "AWD", doors: 4,
    description: "Foreign-used Lexus RX 350 F Sport. Premium leather, sunroof, Mark Levinson sound system.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80"]),
    seller_id: sId(4), featured: true
  },
  {
    make: "Mercedes-Benz", model: "C300", year: 2021, price: 42500000, condition: "used",
    location: "Abuja, Nigeria", mileage: 28000, color: "Polar White",
    car_type: "Sedan", transmission: "Automatic", fuel_type: "Petrol", drive_type: "RWD", doors: 4,
    description: "Tokunbo Mercedes-Benz C300 4MATIC. AMG line, panoramic roof, burmester sound.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80"]),
    seller_id: sId(1), featured: true
  },
  {
    make: "Toyota", model: "Hilux", year: 2022, price: 38000000, condition: "new",
    location: "Port Harcourt, Nigeria", mileage: 0, color: "Glacier White",
    car_type: "Truck", transmission: "Automatic", fuel_type: "Diesel", drive_type: "4WD", doors: 4,
    description: "Brand new Toyota Hilux Adventure. Diesel engine, perfect for oilfield and rough terrain.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1571894979427-a2f5c4c08d67?w=800&q=80"]),
    seller_id: sId(2), featured: true
  },
  {
    make: "Toyota", model: "Corolla", year: 2017, price: 9800000, condition: "used",
    location: "Ibadan, Nigeria", mileage: 88000, color: "Silver Metallic",
    car_type: "Sedan", transmission: "Automatic", fuel_type: "Petrol", drive_type: "FWD", doors: 4,
    description: "Reliable Naija-used Toyota Corolla LE. Very economical, perfect first car.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&q=80"]),
    seller_id: sId(3), featured: false
  },
  {
    make: "Lexus", model: "GX 460", year: 2019, price: 45000000, condition: "used",
    location: "Lagos, Nigeria", mileage: 52000, color: "Nebula Gray",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "4WD", doors: 4,
    description: "Tokunbo Lexus GX 460 Premium. Third row seating, captain chairs, off-road package.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80"]),
    seller_id: sId(0), featured: true
  },
  {
    make: "Honda", model: "CR-V", year: 2020, price: 21500000, condition: "used",
    location: "Abuja, Nigeria", mileage: 40000, color: "Modern Steel",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "AWD", doors: 4,
    description: "Foreign-used Honda CR-V EX-L. Leather, sunroof, Honda Sensing safety suite.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80"]),
    seller_id: sId(1), featured: false
  },
  {
    make: "Toyota", model: "Land Cruiser Prado", year: 2021, price: 78000000, condition: "used",
    location: "Lagos, Nigeria", mileage: 25000, color: "Pearl White",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "4WD", doors: 4,
    description: "Tokunbo Toyota Prado VX-L. Full option, 7 seater, premium leather, JBL sound.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80"]),
    seller_id: sId(4), featured: true
  },
  {
    make: "Hyundai", model: "Elantra", year: 2018, price: 8500000, condition: "used",
    location: "Enugu, Nigeria", mileage: 75000, color: "Phantom Black",
    car_type: "Sedan", transmission: "Automatic", fuel_type: "Petrol", drive_type: "FWD", doors: 4,
    description: "Affordable Naija-used Hyundai Elantra. Low fuel consumption, AC chilling, alloy wheels.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80"]),
    seller_id: sId(5), featured: false
  },
  {
    make: "Ford", model: "Edge", year: 2017, price: 14500000, condition: "used",
    location: "Port Harcourt, Nigeria", mileage: 95000, color: "Ruby Red",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "AWD", doors: 4,
    description: "Tokunbo Ford Edge SEL. Spacious family SUV, panoramic roof, Sync 3 infotainment.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80"]),
    seller_id: sId(2), featured: false
  },
  {
    make: "BMW", model: "X5", year: 2020, price: 52000000, condition: "used",
    location: "Lagos, Nigeria", mileage: 35000, color: "Alpine White",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "AWD", doors: 4,
    description: "Foreign-used BMW X5 xDrive40i. M Sport package, Harman Kardon sound, head-up display.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80"]),
    seller_id: sId(0), featured: true
  },
  {
    make: "Kia", model: "Sportage", year: 2019, price: 13800000, condition: "used",
    location: "Ibadan, Nigeria", mileage: 58000, color: "Mineral Silver",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "FWD", doors: 4,
    description: "Naija-used Kia Sportage EX. Reverse camera, leather seats, factory AC working perfect.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80"]),
    seller_id: sId(3), featured: false
  },
  {
    make: "Mercedes-Benz", model: "GLE 350", year: 2018, price: 38500000, condition: "used",
    location: "Abuja, Nigeria", mileage: 62000, color: "Selenite Gray",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "AWD", doors: 4,
    description: "Tokunbo Mercedes-Benz GLE 350 4MATIC. Premium package, panoramic roof, 360 camera.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80"]),
    seller_id: sId(1), featured: true
  },
  {
    make: "Toyota", model: "RAV4", year: 2022, price: 28500000, condition: "new",
    location: "Lagos, Nigeria", mileage: 0, color: "Blueprint Blue",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Hybrid", drive_type: "AWD", doors: 4,
    description: "Brand new Toyota RAV4 Hybrid XLE. Excellent fuel economy, perfect for Lagos traffic.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80"]),
    seller_id: sId(4), featured: false
  },
  {
    make: "Nissan", model: "Pathfinder", year: 2016, price: 11200000, condition: "used",
    location: "Enugu, Nigeria", mileage: 110000, color: "Magnetic Black",
    car_type: "SUV", transmission: "Automatic", fuel_type: "Petrol", drive_type: "4WD", doors: 4,
    description: "Naija-used Nissan Pathfinder SL. 7 seater, leather interior, perfect family SUV.",
    images: JSON.stringify(["https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80"]),
    seller_id: sId(5), featured: false
  },
];

for (const car of cars) {
  await client.query(
    `INSERT INTO cars (make, model, year, price, condition, location, mileage, color, car_type, transmission, fuel_type, drive_type, doors, description, images, seller_id, featured)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [car.make, car.model, car.year, car.price, car.condition, car.location, car.mileage,
     car.color, car.car_type, car.transmission, car.fuel_type, car.drive_type, car.doors,
     car.description, car.images, car.seller_id, car.featured]
  );
}

console.log(`Inserted ${cars.length} cars.`);
console.log("Database seeded successfully!");

await client.end();
