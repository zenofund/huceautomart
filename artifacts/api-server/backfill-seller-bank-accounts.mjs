import pg from "pg";
import { createHash } from "node:crypto";

const dryRun = process.argv.includes("--dry-run");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const client = await pool.connect();

function legacyBankCode(bankName) {
  const digest = createHash("sha1")
    .update(bankName.trim().toLowerCase())
    .digest("hex")
    .slice(0, 8);
  return `legacy-${digest}`;
}

try {
  console.log(dryRun ? "Running seller bank backfill (dry-run)..." : "Running seller bank backfill...");
  await client.query("BEGIN");

  const sellers = await client.query(
    `
      SELECT
        sp.user_id AS "userId",
        trim(sp.bank_name) AS "bankName",
        trim(sp.bank_account_number) AS "accountNumber",
        trim(sp.bank_account_name) AS "accountName"
      FROM seller_profiles sp
      INNER JOIN users u ON u.id = sp.user_id
      WHERE u.role = 'seller'
        AND sp.bank_name IS NOT NULL
        AND trim(sp.bank_name) <> ''
        AND sp.bank_account_number IS NOT NULL
        AND trim(sp.bank_account_number) ~ '^\\d{10}$'
        AND sp.bank_account_name IS NOT NULL
        AND trim(sp.bank_account_name) <> ''
    `,
  );

  let inserted = 0;
  let updated = 0;

  for (const row of sellers.rows) {
    const userId = Number(row.userId);
    const bankName = String(row.bankName);
    const accountNumber = String(row.accountNumber);
    const accountName = String(row.accountName);
    const bankCode = legacyBankCode(bankName);

    const existing = await client.query(
      `
        SELECT id, is_default AS "isDefault"
        FROM bank_accounts
        WHERE user_id = $1
          AND account_number = $2
          AND (bank_code = $3 OR lower(bank_name) = lower($4))
        LIMIT 1
      `,
      [userId, accountNumber, bankCode, bankName],
    );

    const hasDefault = await client.query(
      `
        SELECT id
        FROM bank_accounts
        WHERE user_id = $1 AND is_default = true
        LIMIT 1
      `,
      [userId],
    );

    if (existing.rowCount && existing.rows[0]) {
      const existingRow = existing.rows[0];
      await client.query(
        `
          UPDATE bank_accounts
          SET
            bank_code = $1,
            bank_name = $2,
            account_name = $3,
            is_default = CASE WHEN $4::boolean THEN true ELSE is_default END,
            updated_at = NOW()
          WHERE id = $5
        `,
        [bankCode, bankName, accountName, hasDefault.rowCount === 0, existingRow.id],
      );
      updated += 1;
      continue;
    }

    await client.query(
      `
        INSERT INTO bank_accounts (
          user_id, bank_code, bank_name, account_number, account_name, is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [userId, bankCode, bankName, accountNumber, accountName, hasDefault.rowCount === 0],
    );
    inserted += 1;
  }

  if (dryRun) {
    await client.query("ROLLBACK");
  } else {
    await client.query("COMMIT");
  }

  const scanned = sellers.rowCount;
  const skipped = scanned - inserted - updated;
  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned,
        inserted,
        updated,
        skipped,
      },
      null,
      2,
    ),
  );
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Backfill failed:", err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
