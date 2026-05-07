import { Router } from "express";
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  walletAccountsTable,
  walletTransactionsTable,
  inspectionsTable,
  listingsTable,
  offersTable,
  purchasesTable,
  bankAccountsTable,
  usersTable,
  financeSettingsTable,
  type WalletAccount,
  type WalletTransaction,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";

const router = Router();

class WalletPayConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletPayConflict";
  }
}

const VALID_TX_TYPES = [
  "deposit",
  "withdrawal",
  "payment",
  "receipt",
  "commission",
  "refund",
  "inspection_fee",
  "inspection_earning",
] as const;

const VALID_TX_STATUS = ["pending", "completed", "failed", "reversed"] as const;

const MIN_AMOUNT = 100; // ₦100 minimum
const MAX_AMOUNT = 50_000_000; // ₦50M upper safety cap
const ESCROW_WITHDRAWAL_FEE_KEY = "escrow_withdrawal_fee_percent";
const DEFAULT_ESCROW_WITHDRAWAL_FEE_PERCENT = 0;

function computeEscrowFeeAmounts(grossAmount: number, percent: number) {
  const safeGross = Number.isFinite(grossAmount) ? Math.max(0, grossAmount) : 0;
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const feeAmount = Math.round(safeGross * (safePercent / 100));
  const netAmount = Math.max(0, safeGross - feeAmount);
  return { feeAmount, netAmount };
}

function serializeAccount(a: WalletAccount) {
  return {
    id: a.id,
    userId: a.userId,
    balance: a.balance,
    currency: a.currency,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function serializeTransaction(t: WalletTransaction) {
  return {
    id: t.id,
    walletId: t.walletId,
    type: t.type,
    amount: t.amount,
    status: t.status,
    reference: t.reference,
    description: t.description,
    balanceBefore: t.balanceBefore,
    balanceAfter: t.balanceAfter,
    metadata: t.metadata,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/**
 * Load or lazily-create the caller's wallet account.
 *
 * Uses an atomic INSERT ... ON CONFLICT (user_id) DO UPDATE so concurrent
 * first-time requests can't race into a duplicate-key 500. The DO UPDATE
 * is a no-op (touches updated_at only) but is required for `RETURNING *`
 * to yield the existing row on conflict.
 *
 * Accepts an optional Drizzle transaction so callers inside `db.transaction`
 * can reuse the same connection and avoid lock-ordering surprises.
 */
async function getOrCreateWallet(
  userId: number,
  tx: any = db,
): Promise<WalletAccount> {
  const [row] = await tx
    .insert(walletAccountsTable)
    .values({ userId, balance: 0, currency: "NGN" })
    .onConflictDoUpdate({
      target: walletAccountsTable.userId,
      set: { updatedAt: new Date() },
    })
    .returning();
  return row;
}

// ─── GET /wallet ──────────────────────────────────────────────────────────────
// Returns the authenticated user's wallet account (creating it if missing).

router.get("/wallet", requireAuth, async (req: AuthRequest, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user!.userId);
    res.json({ wallet: serializeAccount(wallet) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load wallet" });
  }
});

// ─── GET /wallet/withdrawal-fee ───────────────────────────────────────────────
// Returns the current escrow fee % for seller withdrawals plus a preview.
router.get("/wallet/withdrawal-fee", requireAuth, async (req: AuthRequest, res) => {
  try {
    const gross = Number(req.query.amount ?? 0);
    const [row] = await db
      .select({ value: financeSettingsTable.value })
      .from(financeSettingsTable)
      .where(eq(financeSettingsTable.key, ESCROW_WITHDRAWAL_FEE_KEY))
      .limit(1);
    const percent = Math.min(
      100,
      Math.max(0, Number(row?.value ?? DEFAULT_ESCROW_WITHDRAWAL_FEE_PERCENT) || 0),
    );
    const { feeAmount, netAmount } = computeEscrowFeeAmounts(gross, percent);
    res.json({ percent, feeAmount, netAmount });
  } catch (err) {
    console.error("wallet withdrawal fee error", err);
    res.status(500).json({ error: "Failed to load withdrawal fee" });
  }
});

// ─── GET /wallet/transactions ─────────────────────────────────────────────────
// Lists the caller's transactions with optional filters.
//   ?status=pending|completed|failed|reversed (comma-separated allowed)
//   ?type=deposit|withdrawal|... (comma-separated allowed)
//   ?q=text  — searches description + reference
//   ?limit=N (default 50, max 200) ?offset=N

router.get("/wallet/transactions", requireAuth, async (req: AuthRequest, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user!.userId);

    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? ""), 10) || 50, 1),
      200,
    );
    const offset = Math.max(
      Number.parseInt(String(req.query.offset ?? ""), 10) || 0,
      0,
    );

    const statusCsv = String(req.query.status ?? "").trim();
    const typeCsv = String(req.query.type ?? "").trim();
    const q = String(req.query.q ?? "").trim();

    const statuses = statusCsv
      ? statusCsv
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is (typeof VALID_TX_STATUS)[number] =>
            (VALID_TX_STATUS as readonly string[]).includes(s),
          )
      : [];

    const types = typeCsv
      ? typeCsv
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is (typeof VALID_TX_TYPES)[number] =>
            (VALID_TX_TYPES as readonly string[]).includes(s),
          )
      : [];

    const conditions = [eq(walletTransactionsTable.walletId, wallet.id)];
    if (statuses.length > 0) {
      conditions.push(
        or(
          ...statuses.map((s) => eq(walletTransactionsTable.status, s)),
        )!,
      );
    }
    if (types.length > 0) {
      conditions.push(
        or(...types.map((t) => eq(walletTransactionsTable.type, t)))!,
      );
    }
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(walletTransactionsTable.description, pattern),
          ilike(walletTransactionsTable.reference, pattern),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(walletTransactionsTable)
      .where(and(...conditions))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total } = { total: 0 }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(walletTransactionsTable)
      .where(and(...conditions));

    // Enrich inspection_earning rows with the buyer's name.
    // The reference is always "INSPECTION-EARN-<inspectionId>".
    const earningRefs = rows
      .filter((r) => r.type === "inspection_earning")
      .map((r) => {
        const m = r.reference?.match(/^INSPECTION-EARN-(\d+)$/);
        return m ? { txId: r.id, inspectionId: Number(m[1]) } : null;
      })
      .filter((x): x is { txId: number; inspectionId: number } => x !== null);

    const buyerNameMap = new Map<number, string>(); // walletTxId → buyerName

    if (earningRefs.length > 0) {
      const inspectionIds = earningRefs.map((r) => r.inspectionId);
      const buyers = await db
        .select({
          inspectionId: inspectionsTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(inspectionsTable)
        .innerJoin(usersTable, eq(usersTable.id, inspectionsTable.buyerId))
        .where(inArray(inspectionsTable.id, inspectionIds));

      const inspectionToBuyer = new Map(
        buyers.map((b) => [
          b.inspectionId,
          `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim(),
        ]),
      );

      for (const ref of earningRefs) {
        const name = inspectionToBuyer.get(ref.inspectionId);
        if (name) buyerNameMap.set(ref.txId, name);
      }
    }

    res.json({
      wallet: serializeAccount(wallet),
      transactions: rows.map((r) => ({
        ...serializeTransaction(r),
        buyerName: buyerNameMap.get(r.id) ?? null,
      })),
      pagination: { limit, offset, total: Number(total) || 0 },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load transactions" });
  }
});

// ─── POST /wallet/deposit ─────────────────────────────────────────────────────
// Records a manual bank-transfer deposit REQUEST as a pending transaction.
// The wallet balance is NOT credited here — credit only happens after ops
// reconciles the request against the bank statement and flips the row to
// `completed`. Self-credit (the user calling this endpoint to mint balance)
// was the previous critical vulnerability and is no longer possible.
//
// For instant credit, the buyer must use Paystack via /payments/init, which
// only credits on a verified webhook.

router.post("/wallet/deposit", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { amount, description } = req.body as {
      amount?: number | string;
      description?: string;
    };

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    if (amt < MIN_AMOUNT) {
      res.status(400).json({ error: `Minimum deposit is ₦${MIN_AMOUNT}` });
      return;
    }
    if (amt > MAX_AMOUNT) {
      res.status(400).json({ error: "Amount exceeds the allowed limit" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      // Ensure a wallet exists so the pending row has somewhere to live.
      // Atomic upsert avoids races when two concurrent first-time deposits
      // both see "no wallet" and try to insert.
      const resolved = await getOrCreateWallet(req.user!.userId, tx);

      // Snapshot balance — pending transactions don't change it, but this
      // gives us a consistent audit point if/when ops marks it completed.
      const before = resolved.balance;

      const [txRow] = await tx
        .insert(walletTransactionsTable)
        .values({
          walletId: resolved.id,
          type: "deposit",
          amount: amt,
          status: "pending",
          reference: `DEP-${randomUUID()}`,
          description: description?.trim() || "Wallet Deposit · Bank (pending review)",
          balanceBefore: before,
          balanceAfter: before,
        })
        .returning();

      return { wallet: resolved, transaction: txRow };
    });

    res.status(202).json({
      wallet: serializeAccount(result.wallet),
      transaction: serializeTransaction(result.transaction),
      pending: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record deposit" });
  }
});

// ─── POST /wallet/pay ─────────────────────────────────────────────────────────
// Debits the buyer's wallet for an inspection booking or a listing purchase.
// The amount is resolved server-side from the linked record so the client
// cannot under-pay. Inspection status flips `pending → scheduled` on success.

router.post("/wallet/pay", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { purpose, inspectionId, listingId } = req.body as {
      purpose?: string;
      inspectionId?: number;
      listingId?: number;
    };

    if (purpose !== "inspection" && purpose !== "listing_purchase") {
      res.status(400).json({ error: "Invalid purpose" });
      return;
    }

    const userId = req.user!.userId;

    // The whole flow runs inside a single transaction so that wallet debit
    // and the side-effect (inspection status flip / purchase recording) are
    // committed together — a race that prevents the side-effect rolls back
    // the debit. We re-validate the target row *inside* the transaction
    // instead of trusting the pre-transaction read.
    type Outcome =
      | { ok: true; wallet: WalletAccount; transaction: WalletTransaction; amount: number }
      | { ok: false; status: number; error: string };

    const result: Outcome = await db.transaction(async (tx) => {
      let amount = 0;
      let description = "";

      if (purpose === "inspection") {
        const id = Number(inspectionId);
        if (!Number.isInteger(id) || id <= 0) {
          return { ok: false as const, status: 400, error: "inspectionId required" };
        }
        const [insp] = await tx
          .select()
          .from(inspectionsTable)
          .where(eq(inspectionsTable.id, id))
          .for("update")
          .limit(1);
        if (!insp) {
          return { ok: false as const, status: 404, error: "Inspection not found" };
        }
        if (insp.buyerId !== userId) {
          return { ok: false as const, status: 403, error: "Not your inspection" };
        }
        if (insp.status !== "pending") {
          return { ok: false as const, status: 409, error: "Inspection already paid or closed" };
        }
        amount = Number(insp.fee) || 0;
        description = `Inspection #${insp.id} fee`;
      } else {
        const id = Number(listingId);
        if (!Number.isInteger(id) || id <= 0) {
          return { ok: false as const, status: 400, error: "listingId required" };
        }
        const [listing] = await tx
          .select()
          .from(listingsTable)
          .where(eq(listingsTable.id, id))
          .for("update")
          .limit(1);
        if (!listing) {
          return { ok: false as const, status: 404, error: "Listing not found" };
        }
        if (listing.status !== "active") {
          return { ok: false as const, status: 409, error: "Listing is not available" };
        }
        if (listing.sellerId === userId) {
          return { ok: false as const, status: 400, error: "You cannot purchase your own listing" };
        }
        // Use the negotiated offer amount when an accepted offer exists;
        // fall back to listing's ask price for direct (un-negotiated) purchases.
        const [acceptedOffer] = await tx
          .select({ id: offersTable.id, amount: offersTable.amount })
          .from(offersTable)
          .where(
            and(
              eq(offersTable.listingId, listing.id),
              eq(offersTable.buyerId, userId),
              eq(offersTable.status, "accepted"),
            ),
          )
          .orderBy(desc(offersTable.createdAt))
          .limit(1);
        amount = acceptedOffer ? Number(acceptedOffer.amount) : (Number(listing.price) || 0);
        description = `Listing #${listing.id} purchase`;
      }

      if (amount <= 0) {
        return { ok: false as const, status: 400, error: "Resolved amount is zero" };
      }

      const [wallet] = await tx
        .select()
        .from(walletAccountsTable)
        .where(eq(walletAccountsTable.userId, userId))
        .for("update")
        .limit(1);

      if (!wallet || wallet.balance < amount) {
        return { ok: false as const, status: 402, error: "Insufficient wallet balance" };
      }

      const [updated] = await tx
        .update(walletAccountsTable)
        .set({
          balance: sql`${walletAccountsTable.balance} - ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(walletAccountsTable.id, wallet.id))
        .returning();

      const before = updated.balance + amount;
      const after = updated.balance;

      const [txRow] = await tx
        .insert(walletTransactionsTable)
        .values({
          walletId: wallet.id,
          type: "payment",
          amount,
          status: "completed",
          reference: `WPY-${randomUUID()}`,
          description,
          balanceBefore: before,
          balanceAfter: after,
          metadata: { purpose, inspectionId, listingId },
        })
        .returning();

      // Apply the linked side-effect. We require the status transition to
      // actually happen — if some parallel mutation flipped the row out of
      // its expected state between our locked read and now, throw to roll
      // back the debit instead of charging the user for a no-op.
      if (purpose === "inspection") {
        const flipped = await tx
          .update(inspectionsTable)
          .set({ paidAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(inspectionsTable.id, Number(inspectionId)),
              isNull(inspectionsTable.paidAt),
            ),
          )
          .returning({ id: inspectionsTable.id });
        if (flipped.length === 0) {
          throw new WalletPayConflict("This inspection has already been paid");
        }
      } else if (purpose === "listing_purchase") {
        // Flip the listing to "sold" — the status-conditional update is the
        // idempotency guard; a parallel call that already flipped it returns 0.
        const flipped = await tx
          .update(listingsTable)
          .set({ status: "sold", updatedAt: new Date() })
          .where(
            and(
              eq(listingsTable.id, Number(listingId)),
              eq(listingsTable.status, "active"),
            ),
          )
          .returning({ id: listingsTable.id, sellerId: listingsTable.sellerId });
        if (flipped.length === 0) {
          throw new WalletPayConflict("This listing is no longer available");
        }
        const soldListing = flipped[0];
        // Resolve the accepted offer (if any) to link it to the purchase record.
        const [acceptedOffer] = await tx
          .select({ id: offersTable.id })
          .from(offersTable)
          .where(
            and(
              eq(offersTable.listingId, Number(listingId)),
              eq(offersTable.buyerId, userId),
              eq(offersTable.status, "accepted"),
            ),
          )
          .orderBy(desc(offersTable.createdAt))
          .limit(1);
        // Create the purchase record.
        await tx.insert(purchasesTable).values({
          offerId: acceptedOffer?.id ?? null,
          listingId: Number(listingId),
          buyerId: userId,
          sellerId: soldListing.sellerId,
          amount,
          platformFee: 0,
          sellerPayout: amount,
          paymentMethod: "wallet",
          // Funds are held in escrow until buyer confirms purchase.
          paymentStatus: "in_escrow",
          receiptNumber: `RCP-WPY-${(txRow.reference || randomUUID()).replace("WPY-", "")}`,
        });
        // Keep offer accepted until buyer confirms purchase.
        if (acceptedOffer) {
          await tx
            .update(offersTable)
            .set({ status: "accepted", updatedAt: new Date() })
            .where(eq(offersTable.id, acceptedOffer.id));
        }
      }

      return { ok: true as const, wallet: updated, transaction: txRow, amount };
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      wallet: serializeAccount(result.wallet),
      transaction: serializeTransaction(result.transaction),
      amount: result.amount,
    });
  } catch (err) {
    if (err instanceof WalletPayConflict) {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Wallet payment failed" });
  }
});

// ─── POST /wallet/withdraw ────────────────────────────────────────────────────
// Records a pending withdrawal request for admin approval.
// Wallet balance is debited only after admin approval + transfer attempt.

router.post("/wallet/withdraw", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { amount, description, bankAccountId, bankName, accountNumber } =
      req.body as {
        amount?: number | string;
        description?: string;
        bankAccountId?: number | string;
        bankName?: string;
        accountNumber?: string;
      };

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    if (amt < MIN_AMOUNT) {
      res.status(400).json({ error: `Minimum withdrawal is ₦${MIN_AMOUNT}` });
      return;
    }
    if (amt > MAX_AMOUNT) {
      res.status(400).json({ error: "Amount exceeds the allowed limit" });
      return;
    }

    // Resolve the destination bank account. The UI sends a bankAccountId,
    // but we also accept (bankName, accountNumber) for backward-compat —
    // either way, we MUST verify the account belongs to a Paystack-resolved
    // row owned by this user. Free-text payouts are not allowed.
    const userId = req.user!.userId;
    let destination: typeof bankAccountsTable.$inferSelect | undefined;

    const idNum = Number(bankAccountId);
    if (Number.isFinite(idNum) && idNum > 0) {
      [destination] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, idNum),
            eq(bankAccountsTable.userId, userId),
          ),
        )
        .limit(1);
    } else if (
      typeof bankName === "string" &&
      typeof accountNumber === "string" &&
      /^\d{10}$/.test(accountNumber)
    ) {
      [destination] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.userId, userId),
            eq(bankAccountsTable.bankName, bankName),
            eq(bankAccountsTable.accountNumber, accountNumber),
          ),
        )
        .limit(1);
    }

    if (!destination) {
      res.status(400).json({
        error:
          "Withdrawals must go to a verified bank account. Add one in Bank Accounts first.",
      });
      return;
    }

    const result = await db.transaction(async (tx) => {
      // Lazy-create the wallet so a brand-new user hitting withdraw gets a
      // clean "Insufficient balance" rather than a confusing 404. Atomic
      // upsert avoids races on first-touch.
      const resolved = await getOrCreateWallet(userId, tx);

      const [pendingAgg] = await tx
        .select({
          total: sql<number>`COALESCE(SUM(${walletTransactionsTable.amount}), 0)::float`,
        })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.walletId, resolved.id),
            eq(walletTransactionsTable.type, "withdrawal"),
            eq(walletTransactionsTable.status, "pending"),
          ),
        );

      const pendingAmount = Number(pendingAgg?.total ?? 0);
      const availableForRequest = Number(resolved.balance) - pendingAmount;
      if (!Number.isFinite(availableForRequest) || availableForRequest < amt) {
        return { error: "Insufficient available balance" as const };
      }

      const [owner] = await tx
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      const isSeller = owner?.role === "seller";
      let escrowFeePercent = 0;
      if (isSeller) {
        const [feeRow] = await tx
          .select({ value: financeSettingsTable.value })
          .from(financeSettingsTable)
          .where(eq(financeSettingsTable.key, ESCROW_WITHDRAWAL_FEE_KEY))
          .limit(1);
        escrowFeePercent = Math.min(
          100,
          Math.max(0, Number(feeRow?.value ?? DEFAULT_ESCROW_WITHDRAWAL_FEE_PERCENT) || 0),
        );
      }
      const { feeAmount, netAmount } = isSeller
        ? computeEscrowFeeAmounts(amt, escrowFeePercent)
        : { feeAmount: 0, netAmount: amt };

      const before = resolved.balance;
      const after = resolved.balance;

      const [txRow] = await tx
        .insert(walletTransactionsTable)
        .values({
          walletId: resolved.id,
          type: "withdrawal",
          amount: amt,
          status: "pending",
          reference: `WDR-${randomUUID()}`,
          description:
            description?.trim() ||
            `Withdrawal request · ${destination.bankName} · ****${destination.accountNumber.slice(-4)}`,
          balanceBefore: before,
          balanceAfter: after,
          metadata: {
            bankAccountId: destination.id,
            bankName: destination.bankName,
            bankCode: destination.bankCode,
            accountNumber: destination.accountNumber,
            accountName: destination.accountName,
            requestedByUserId: userId,
            requestedAt: new Date().toISOString(),
            processing: false,
            escrowFeePercent,
            escrowFeeAmount: feeAmount,
            netPayoutAmount: netAmount,
          },
        })
        .returning();

      return { wallet: resolved, transaction: txRow };
    });

    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(202).json({
      wallet: serializeAccount(result.wallet),
      transaction: serializeTransaction(result.transaction),
      pending: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to withdraw" });
  }
});

// ─── GET /wallet/transactions/:id ─────────────────────────────────────────────
// Returns a single transaction (ownership-scoped).

router.get(
  "/wallet/transactions/:id",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid transaction id" });
        return;
      }
      const wallet = await getOrCreateWallet(req.user!.userId);
      const tx = await db
        .select()
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.id, id),
            eq(walletTransactionsTable.walletId, wallet.id),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!tx) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }
      res.json({ transaction: serializeTransaction(tx) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load transaction" });
    }
  },
);

export default router;
