import bcrypt from "bcryptjs";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
const email = "godsautos@huce.test";
const password = "Password123!";
const hash = await bcrypt.hash(password, 12);
try {
  await c.query("BEGIN");
  const u = await c.query(
    `INSERT INTO users (email,password_hash,first_name,last_name,phone,role,account_type,status,email_verified,profile_photo_url)
     VALUES ($1,$2,$3,$4,$5,'seller','company','active',true,$6)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,phone=EXCLUDED.phone,role='seller',account_type='company',status='active',email_verified=true,profile_photo_url=EXCLUDED.profile_photo_url,updated_at=NOW()
     RETURNING id`,
    [email,hash,"Chinedu","Okafor","+2348031110001","https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop"]);
  const userId = u.rows[0].id;
  await c.query(
    `INSERT INTO seller_profiles (user_id,business_name,lot_name,business_reg_number,nin_number,nin_document_url,proof_of_address_url,verification_status,is_verified,bank_name,bank_account_number,bank_account_name,bio,location,website)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'verified',true,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (user_id) DO UPDATE SET business_name=EXCLUDED.business_name,lot_name=EXCLUDED.lot_name,business_reg_number=EXCLUDED.business_reg_number,nin_number=EXCLUDED.nin_number,nin_document_url=EXCLUDED.nin_document_url,proof_of_address_url=EXCLUDED.proof_of_address_url,verification_status='verified',is_verified=true,bank_name=EXCLUDED.bank_name,bank_account_number=EXCLUDED.bank_account_number,bank_account_name=EXCLUDED.bank_account_name,bio=EXCLUDED.bio,location=EXCLUDED.location,website=EXCLUDED.website,updated_at=NOW()`,
    [userId,"God's Autos","God's Autos Main Showroom","RC1029384","12345678901","https://example.com/docs/nin-godsautos.pdf","https://example.com/docs/proof-godsautos.pdf","GTBank","0123456789","Chinedu Okafor","Premium pre-owned and new vehicles in Abuja, FCT.","Abuja, FCT","https://godsautos.example.com"]);
  await c.query("COMMIT");
  console.log("Seeded:", { userId, email, password });
} catch (e) { await c.query("ROLLBACK"); throw e; }
finally { c.release(); await pool.end(); }
