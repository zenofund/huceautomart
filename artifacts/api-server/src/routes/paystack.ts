import { Router, raw } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  bankAccountsTable,
  paymentIntentsTable,
  walletAccountsTable,
  walletTransactionsTable,
  inspectionsTable,
  listingsTable,
  usersTable,
  offersTable,
  purchasesTable,
  sellerProfilesTable,
  subscriptionPlansTable,
  subscriptionsTable,
  type PaymentIntent,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import { autoAssignInspector } from "../lib/inspectorAssignment";
import {
  initializeTransaction,
  listBanks,
  resolveAccount,
  verifyTransaction,
  verifyWebhookSignature,
  type VerifyTransactionResponse,
} from "../lib/paystack";
import { createNotification } from "../lib/notifications";
import { sendDepositSuccessfulEmail, sendPurchaseConfirmedEmail } from "../lib/email";

const router = Router();

// In-memory cache for the bank list (Paystack rarely changes these and the
// list is ~250 entries we'd otherwise re-fetch on every form open).
let bankCache: { fetchedAt: number; data: unknown[] } | null = null;
const BANK_CACHE_MS = 12 * 60 * 60 * 1000; // 12h
let bankRefreshPromise: Promise<void> | null = null;
const FALLBACK_BANKS = [
  { name: "Access Bank", code: "044", slug: "access-bank" },
  { name: "Citibank Nigeria", code: "023", slug: "citibank-nigeria" },
  { name: "Ecobank Nigeria", code: "050", slug: "ecobank-nigeria" },
  { name: "Fidelity Bank", code: "070", slug: "fidelity-bank" },
  { name: "First Bank of Nigeria", code: "011", slug: "first-bank-of-nigeria" },
  { name: "First City Monument Bank", code: "214", slug: "first-city-monument-bank" },
  { name: "Globus Bank", code: "00103", slug: "globus-bank" },
  { name: "Guaranty Trust Bank", code: "058", slug: "guaranty-trust-bank" },
  { name: "Keystone Bank", code: "082", slug: "keystone-bank" },
  { name: "Moniepoint MFB", code: "50515", slug: "moniepoint-mfb" },
  { name: "Opay", code: "999992", slug: "opay" },
  { name: "Polaris Bank", code: "076", slug: "polaris-bank" },
  { name: "Providus Bank", code: "101", slug: "providus-bank" },
  { name: "Stanbic IBTC Bank", code: "221", slug: "stanbic-ibtc-bank" },
  { name: "Sterling Bank", code: "232", slug: "sterling-bank" },
  { name: "Titan Trust Bank", code: "102", slug: "titan-trust-bank" },
  { name: "Union Bank of Nigeria", code: "032", slug: "union-bank-of-nigeria" },
  { name: "United Bank For Africa", code: "033", slug: "united-bank-for-africa" },
  { name: "Wema Bank", code: "035", slug: "wema-bank" },
  { name: "Zenith Bank", code: "057", slug: "zenith-bank" },
] as const;

function legacyBankCode(bankName: string): string {
  const digest = createHash("sha1")
    .update(bankName.trim().toLowerCase())
    .digest("hex")
    .slice(0, 8);
  return `legacy-${digest}`;
}

async function syncSellerProfileBankFromDefault(tx: any, userId: number) {
  const [user] = await tx
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (user?.role !== "seller") return;

  const [defaultAccount] = await tx
    .select({
      bankName: bankAccountsTable.bankName,
      accountNumber: bankAccountsTable.accountNumber,
      accountName: bankAccountsTable.accountName,
    })
    .from(bankAccountsTable)
    .where(
      and(
        eq(bankAccountsTable.userId, userId),
        eq(bankAccountsTable.isDefault, true),
      ),
    )
    .orderBy(desc(bankAccountsTable.updatedAt))
    .limit(1);

  const payload = defaultAccount
    ? {
        bankName: defaultAccount.bankName,
        bankAccountNumber: defaultAccount.accountNumber,
        bankAccountName: defaultAccount.accountName,
      }
    : {
        bankName: null,
        bankAccountNumber: null,
        bankAccountName: null,
      };

  const [profile] = await tx
    .select({ id: sellerProfilesTable.id })
    .from(sellerProfilesTable)
    .where(eq(sellerProfilesTable.userId, userId))
    .limit(1);

  if (profile) {
    await tx
      .update(sellerProfilesTable)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(sellerProfilesTable.userId, userId));
    return;
  }

  await tx.insert(sellerProfilesTable).values({
    userId,
    ...payload,
    verificationStatus: "unverified",
  });
}

function toSlimBanks(
  banks: Awaited<ReturnType<typeof listBanks>>,
): { name: string; code: string; slug: string }[] {
  return banks
    .filter((b) => b.active && b.currency === "NGN")
    .map((b) => ({ name: b.name, code: b.code, slug: b.slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function refreshBankCache(req: AuthRequest): Promise<void> {
  if (bankRefreshPromise) return bankRefreshPromise;
  bankRefreshPromise = (async () => {
    const banks = await listBanks("nigeria");
    bankCache = { fetchedAt: Date.now(), data: toSlimBanks(banks) };
  })()
    .catch((err) => {
      req.log.warn({ err }, "background bank cache refresh failed");
    })
    .finally(() => {
      bankRefreshPromise = null;
    });
  return bankRefreshPromise;
}

// ─── GET /api/paystack/banks ────────────────────────────────────────────────
router.get("/paystack/banks", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (bankCache && Date.now() - bankCache.fetchedAt < BANK_CACHE_MS) {
      res.json({ data: bankCache.data, source: "cache" });
      return;
    }

    // Serve stale cache immediately and refresh in background. This keeps the
    // bank dropdown snappy even when Paystack is slow.
    if (bankCache?.data?.length) {
      void refreshBankCache(req);
      res.json({
        data: bankCache.data,
        source: "stale_cache",
        warning: "Refreshing bank list in background.",
      });
      return;
    }

    const banks = await listBanks("nigeria");
    const slim = toSlimBanks(banks);
    bankCache = { fetchedAt: Date.now(), data: slim };
    res.json({ data: slim, source: "paystack" });
  } catch (err) {
    req.log.error({ err }, "listBanks failed");
    // Graceful fallback: keep bank verification usable when upstream Paystack
    // bank directory is temporarily unavailable.
    if (bankCache?.data?.length) {
      res.json({
        data: bankCache.data,
        source: "stale_cache",
        warning: "Paystack banks temporarily unavailable; using cached list.",
      });
      return;
    }
    res.json({
      data: FALLBACK_BANKS,
      source: "fallback",
      warning: "Paystack banks temporarily unavailable; using fallback list.",
    });
  }
});

// ─── POST /api/paystack/resolve-account ─────────────────────────────────────
// Body: { accountNumber, bankCode } → { accountName }
// Used by both the "verify before save" flow on the bank-accounts form and
// the seller payout setup.
router.post(
  "/paystack/resolve-account",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { accountNumber, bankCode } = (req.body ?? {}) as {
        accountNumber?: unknown;
        bankCode?: unknown;
      };
      const acct = String(accountNumber ?? "").trim();
      const code = String(bankCode ?? "").trim();
      if (!/^\d{10}$/.test(acct)) {
        res.status(400).json({ error: "Account number must be 10 digits" });
        return;
      }
      if (!code) {
        res.status(400).json({ error: "Bank code is required" });
        return;
      }
      const data = await resolveAccount(acct, code);
      res.json({
        accountNumber: data.account_number,
        accountName: data.account_name,
      });
    } catch (err) {
      req.log.warn({ err }, "resolveAccount failed");
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message.replace(/^Paystack \/bank\/resolve.*?failed: /, "")
            : "Could not resolve account",
      });
    }
  },
);

// ─── Bank accounts (CRUD) ───────────────────────────────────────────────────

router.get("/me/bank-accounts", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    let rows = await db
      .select()
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, userId))
      .orderBy(desc(bankAccountsTable.isDefault), desc(bankAccountsTable.createdAt));

    // Backward-compatible bridge for sellers that saved bank details only in
    // seller_profiles (legacy settings flow) but not in bank_accounts yet.
    if (rows.length === 0) {
      const [user] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (user?.role === "seller") {
        const [sellerProfile] = await db
          .select({
            bankName: sellerProfilesTable.bankName,
            bankAccountNumber: sellerProfilesTable.bankAccountNumber,
            bankAccountName: sellerProfilesTable.bankAccountName,
          })
          .from(sellerProfilesTable)
          .where(eq(sellerProfilesTable.userId, userId))
          .limit(1);

        const bankName = sellerProfile?.bankName?.trim() ?? "";
        const accountNumberRaw = sellerProfile?.bankAccountNumber?.trim() ?? "";
        const accountNumber = accountNumberRaw.replace(/\D/g, "");
        const accountName = sellerProfile?.bankAccountName?.trim() ?? "";

        if (bankName && accountNumber.length === 10 && accountName) {
          const code = legacyBankCode(bankName);
          const [existing] = await db
            .select({ id: bankAccountsTable.id })
            .from(bankAccountsTable)
            .where(
              and(
                eq(bankAccountsTable.userId, userId),
                eq(bankAccountsTable.accountNumber, accountNumber),
                or(
                  eq(bankAccountsTable.bankCode, code),
                  sql`lower(${bankAccountsTable.bankName}) = lower(${bankName})`,
                ),
              ),
            )
            .limit(1);

          if (!existing) {
            await db.insert(bankAccountsTable).values({
              userId,
              bankCode: code,
              bankName,
              accountNumber,
              accountName,
              isDefault: true,
            });
          }

          rows = await db
            .select()
            .from(bankAccountsTable)
            .where(eq(bankAccountsTable.userId, userId))
            .orderBy(desc(bankAccountsTable.isDefault), desc(bankAccountsTable.createdAt));
        }
      }
    }

    res.json({ data: rows });
  } catch (err) {
    req.log.error({ err }, "list bank accounts failed");
    res.status(500).json({ error: "Failed to list bank accounts" });
  }
});

// Resolves the account against Paystack first so we never store a name a
// user typed in by hand. If the same (user, bank, account) was already
// saved we return the existing row instead of erroring on the unique index.
router.post("/me/bank-accounts", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { bankCode, bankName, accountNumber, makeDefault } = (req.body ??
      {}) as {
      bankCode?: unknown;
      bankName?: unknown;
      accountNumber?: unknown;
      makeDefault?: unknown;
    };
    const code = String(bankCode ?? "").trim();
    const name = String(bankName ?? "").trim();
    const acct = String(accountNumber ?? "").trim();
    if (!code || !name || !/^\d{10}$/.test(acct)) {
      res.status(400).json({ error: "Invalid bank or account number" });
      return;
    }

    const resolved = await resolveAccount(acct, code);

    const result = await db.transaction(async (tx) => {
      if (makeDefault) {
        // Ensure exactly one default per user.
        await tx
          .update(bankAccountsTable)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(bankAccountsTable.userId, req.user!.userId));
      }

      const existing = await tx
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.userId, req.user!.userId),
            eq(bankAccountsTable.bankCode, code),
            eq(bankAccountsTable.accountNumber, resolved.account_number),
          ),
        )
        .limit(1)
        .then((r) => r[0]);

      if (existing) {
        const [updated] = await tx
          .update(bankAccountsTable)
          .set({
            bankName: name,
            accountName: resolved.account_name,
            isDefault: makeDefault ? true : existing.isDefault,
            updatedAt: new Date(),
          })
          .where(eq(bankAccountsTable.id, existing.id))
          .returning();
        await syncSellerProfileBankFromDefault(tx, req.user!.userId);
        return updated;
      }

      const [created] = await tx
        .insert(bankAccountsTable)
        .values({
          userId: req.user!.userId,
          bankCode: code,
          bankName: name,
          accountNumber: resolved.account_number,
          accountName: resolved.account_name,
          isDefault: Boolean(makeDefault),
        })
        .returning();
      await syncSellerProfileBankFromDefault(tx, req.user!.userId);
      return created;
    });

    res.status(201).json({ bankAccount: result });
  } catch (err) {
    req.log.warn({ err }, "save bank account failed");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to save bank account",
    });
  }
});

router.delete(
  "/me/bank-accounts/:id",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const result = await db.transaction(async (tx) => {
        const deleted = await tx
          .delete(bankAccountsTable)
          .where(
            and(
              eq(bankAccountsTable.id, id),
              eq(bankAccountsTable.userId, req.user!.userId),
            ),
          )
          .returning({
            id: bankAccountsTable.id,
            wasDefault: bankAccountsTable.isDefault,
          });
        if (deleted.length === 0) return deleted;

        if (deleted[0].wasDefault) {
          const [nextDefault] = await tx
            .select({ id: bankAccountsTable.id })
            .from(bankAccountsTable)
            .where(eq(bankAccountsTable.userId, req.user!.userId))
            .orderBy(desc(bankAccountsTable.createdAt))
            .limit(1);
          if (nextDefault) {
            await tx
              .update(bankAccountsTable)
              .set({ isDefault: true, updatedAt: new Date() })
              .where(eq(bankAccountsTable.id, nextDefault.id));
          }
        }

        await syncSellerProfileBankFromDefault(tx, req.user!.userId);
        return deleted;
      });
      if (result.length === 0) {
        res.status(404).json({ error: "Bank account not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "delete bank account failed");
      res.status(500).json({ error: "Failed to delete bank account" });
    }
  },
);

// ─── Initialize a payment ───────────────────────────────────────────────────
// Body: { purpose, amount?, inspectionId?, listingId?, callbackUrl }
// For `inspection` and `listing_purchase`, the amount is read from the
// server-side record so a tampered client can't underpay.

router.post("/payments/init", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const body = req.body as {
      purpose?: unknown;
      amount?: unknown;
      inspectionId?: unknown;
      listingId?: unknown;
      planId?: unknown;
      callbackUrl?: unknown;
    };

    const purpose = String(body.purpose ?? "");
    if (!["wallet_topup", "inspection", "listing_purchase", "subscription"].includes(purpose)) {
      res.status(400).json({ error: "Invalid purpose" });
      return;
    }
    const callbackUrl = String(body.callbackUrl ?? "").trim();
    if (!/^https?:\/\//.test(callbackUrl)) {
      res.status(400).json({ error: "Invalid callbackUrl" });
      return;
    }

    // Resolve the trusted amount + linked record id by purpose.
    let amountNaira = 0;
    let inspectionId: number | null = null;
    let listingId: number | null = null;
    let subscriptionPlanId: number | null = null;

    if (purpose === "wallet_topup") {
      const amt = Number(body.amount);
      if (!Number.isFinite(amt) || amt < 100 || amt > 50_000_000) {
        res
          .status(400)
          .json({ error: "Amount must be between ₦100 and ₦50,000,000" });
        return;
      }
      amountNaira = amt;
    } else if (purpose === "inspection") {
      const id = Number(body.inspectionId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid inspectionId" });
        return;
      }
      const [insp] = await db
        .select()
        .from(inspectionsTable)
        .where(eq(inspectionsTable.id, id))
        .limit(1);
      if (!insp || insp.buyerId !== userId) {
        res.status(404).json({ error: "Inspection not found" });
        return;
      }
      // Block re-paying an already paid/closed inspection so a buyer can't
      // initialize Paystack against a "scheduled" or "completed" record and
      // see a successful charge with no business-effect on the apply step.
      if (insp.status !== "pending") {
        res.status(409).json({ error: "Inspection is already paid or closed" });
        return;
      }
      amountNaira = Number(insp.fee);
      inspectionId = insp.id;
    } else if (purpose === "listing_purchase") {
      const id = Number(body.listingId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid listingId" });
        return;
      }
      const [listing] = await db
        .select()
        .from(listingsTable)
        .where(eq(listingsTable.id, id))
        .limit(1);
      if (!listing || listing.status !== "active") {
        res.status(404).json({ error: "Listing not available" });
        return;
      }
      if (listing.sellerId === userId) {
        res.status(400).json({ error: "You cannot purchase your own listing" });
        return;
      }
      // Use the negotiated (settled) offer amount when an accepted offer exists.
      // Fall back to the listing's ask price for direct (un-negotiated) purchases.
      const [acceptedOffer] = await db
        .select({ amount: offersTable.amount })
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
      amountNaira = acceptedOffer ? Number(acceptedOffer.amount) : Number(listing.price);
      listingId = listing.id;
    } else if (purpose === "subscription") {
      const planIdInput = Number(body.planId);
      if (!Number.isInteger(planIdInput) || planIdInput <= 0) {
        res.status(400).json({ error: "Invalid planId" });
        return;
      }
      const [plan] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(and(eq(subscriptionPlansTable.id, planIdInput), eq(subscriptionPlansTable.isActive, true)))
        .limit(1);
      if (!plan) {
        res.status(404).json({ error: "Subscription plan not found or inactive" });
        return;
      }
      if (Number(plan.price) <= 0) {
        res.status(400).json({ error: "Free plans do not require payment — use POST /api/subscriptions/free instead" });
        return;
      }
      amountNaira = Number(plan.price);
      subscriptionPlanId = plan.id;
    }

    // Get the user's email for Paystack (it requires one even if we don't
    // surface it on the redirect).
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const reference = `HUCE-${purpose.toUpperCase().slice(0, 4)}-${randomUUID()}`;

    const init = await initializeTransaction({
      email: user.email,
      amountNaira,
      reference,
      callbackUrl,
      metadata: { userId, purpose, inspectionId, listingId },
    });

    await db.insert(paymentIntentsTable).values({
      userId,
      reference,
      purpose: purpose as "wallet_topup" | "inspection" | "listing_purchase" | "subscription",
      amount: amountNaira,
      status: "initialized",
      inspectionId,
      listingId,
      planId: subscriptionPlanId,
      authorizationUrl: init.authorization_url,
    });

    res.status(201).json({
      reference,
      authorizationUrl: init.authorization_url,
      amount: amountNaira,
    });
  } catch (err) {
    req.log.error({ err }, "payments/init failed");
    res.status(502).json({
      error:
        err instanceof Error ? err.message : "Failed to initialize payment",
    });
  }
});

// ─── Apply a verified payment to its target (idempotent) ────────────────────
// Both the verify-by-reference endpoint and the webhook funnel through here.
// Uses a row-level locked SELECT inside a transaction + a status-conditional
// UPDATE so concurrent calls (user redirect + webhook) cannot double-apply.

async function applyPaymentSuccess(
  reference: string,
  paystack: VerifyTransactionResponse,
): Promise<{ status: "applied" | "already" | "missing" | "mismatch"; intent?: PaymentIntent }> {
  const txResult = await db.transaction(async (tx) => {
    const intent = await tx
      .select()
      .from(paymentIntentsTable)
      .where(eq(paymentIntentsTable.reference, reference))
      .for("update")
      .limit(1)
      .then((r) => r[0]);

    if (!intent) return { status: "missing" as const };
    if (intent.status === "success") return { status: "already" as const, intent };

    // Paystack returns kobo; we stored naira.
    const paidNaira = Math.round(paystack.amount) / 100;
    if (Math.abs(paidNaira - intent.amount) > 0.01) {
      await tx
        .update(paymentIntentsTable)
        .set({
          status: "failed",
          paystackResponse: paystack,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntentsTable.id, intent.id));
      return { status: "mismatch" as const, intent };
    }

    // Mark the intent successful first (status-conditional so a parallel
    // call cannot also pass this gate).
    const [marked] = await tx
      .update(paymentIntentsTable)
      .set({
        status: "success",
        channel: paystack.channel ?? null,
        paidAt: paystack.paid_at ? new Date(paystack.paid_at) : new Date(),
        paystackResponse: paystack,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentIntentsTable.id, intent.id),
          eq(paymentIntentsTable.status, "initialized"),
        ),
      )
      .returning();
    if (!marked) return { status: "already" as const, intent };

    if (intent.purpose === "wallet_topup") {
      // Lazy-create wallet, then atomic credit + transaction record.
      const existing = await tx
        .select()
        .from(walletAccountsTable)
        .where(eq(walletAccountsTable.userId, intent.userId))
        .limit(1)
        .then((r) => r[0]);
      const wallet =
        existing ??
        (await tx
          .insert(walletAccountsTable)
          .values({ userId: intent.userId, balance: 0, currency: "NGN" })
          .returning()
          .then((r) => r[0]));

      const [updated] = await tx
        .update(walletAccountsTable)
        .set({
          balance: sql`${walletAccountsTable.balance} + ${intent.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(walletAccountsTable.id, wallet.id))
        .returning();

      await tx.insert(walletTransactionsTable).values({
        walletId: wallet.id,
        type: "deposit",
        amount: intent.amount,
        status: "completed",
        reference: `PSK-${reference}`,
        description: "Wallet top-up via Paystack",
        balanceBefore: updated.balance - intent.amount,
        balanceAfter: updated.balance,
        metadata: { paystackReference: reference },
      });
    } else if (intent.purpose === "inspection" && intent.inspectionId) {
      // Mark the inspection as paid. We don't touch the workflow status
      // (`pending → assigned → active → completed`) because that's driven
      // by the inspector queue, not by payment. `paidAt IS NULL` cleanly
      // separates "awaiting payment" from "awaiting inspector" inside the
      // same `pending` workflow status.
      await tx
        .update(inspectionsTable)
        .set({ paidAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(inspectionsTable.id, intent.inspectionId),
            isNull(inspectionsTable.paidAt),
          ),
        );
    } else if (intent.purpose === "listing_purchase" && intent.listingId) {
      // Atomically: lock the listing, refuse if it isn't active, flip it to
      // `sold`, and record a `purchases` row. The status-conditional update
      // is the idempotency guard — if a parallel webhook already marked the
      // listing sold, the second flip returns 0 rows and we skip the
      // purchase insert (the intent stays "success" because the money was
      // genuinely received; the duplicate just becomes a no-op side-effect).
      const [listing] = await tx
        .select({
          id: listingsTable.id,
          sellerId: listingsTable.sellerId,
          price: listingsTable.price,
          status: listingsTable.status,
        })
        .from(listingsTable)
        .where(eq(listingsTable.id, intent.listingId))
        .for("update")
        .limit(1);

      if (listing && listing.status === "active") {
        const flipped = await tx
          .update(listingsTable)
          .set({ status: "sold", updatedAt: new Date() })
          .where(
            and(
              eq(listingsTable.id, listing.id),
              eq(listingsTable.status, "active"),
            ),
          )
          .returning({ id: listingsTable.id });

        if (flipped.length > 0) {
          // Best-effort: link the purchase to an accepted offer from this
          // buyer if one exists; otherwise it's a direct buy-now.
          const [acceptedOffer] = await tx
            .select({ id: offersTable.id })
            .from(offersTable)
            .where(
              and(
                eq(offersTable.listingId, listing.id),
                eq(offersTable.buyerId, intent.userId),
                eq(offersTable.status, "accepted"),
              ),
            )
            .orderBy(desc(offersTable.createdAt))
            .limit(1);

          await tx.insert(purchasesTable).values({
            offerId: acceptedOffer?.id ?? null,
            listingId: listing.id,
            buyerId: intent.userId,
            sellerId: listing.sellerId,
            amount: intent.amount,
            platformFee: 0,
            sellerPayout: intent.amount,
            paymentMethod: "paystack",
            // Funds are held in escrow until buyer confirms purchase.
            paymentStatus: "in_escrow",
            receiptNumber: `RCP-${reference}`,
          });

          if (acceptedOffer) {
            await tx
              .update(offersTable)
              // Keep offer accepted until buyer confirms purchase.
              .set({ status: "accepted", updatedAt: new Date() })
              .where(eq(offersTable.id, acceptedOffer.id));
          }
        }
      }
    }

    if (intent.purpose === "subscription" && intent.planId) {
      // Fetch the plan to know the duration
      const [plan] = await tx
        .select({ durationDays: subscriptionPlansTable.durationDays })
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, intent.planId))
        .limit(1);
      if (plan) {
        const expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
        // Upsert: if the seller already has an active subscription, renew it;
        // otherwise create a new one.
        const [existing] = await tx
          .select({ id: subscriptionsTable.id })
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.sellerId, intent.userId))
          .orderBy(desc(subscriptionsTable.createdAt))
          .limit(1);
        if (existing) {
          await tx
            .update(subscriptionsTable)
            .set({
              planId: intent.planId,
              status: "active",
              expiresAt,
            })
            .where(eq(subscriptionsTable.id, existing.id));
        } else {
          await tx.insert(subscriptionsTable).values({
            sellerId: intent.userId,
            planId: intent.planId,
            status: "active",
            expiresAt,
          });
        }
      }
    }

    return { status: "applied" as const, intent: marked };
  });

  // After the transaction commits, attempt proximity-based auto-assignment.
  // This is fire-and-forget: errors are logged but never surface to the caller.
  if (
    txResult.status === "applied" &&
    txResult.intent?.purpose === "wallet_topup"
  ) {
    const [user] = await db
      .select({
        email: usersTable.email,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, txResult.intent.userId))
      .limit(1);
    if (user?.email) {
      void sendDepositSuccessfulEmail({
        email: user.email,
        firstName: user.firstName || "there",
        amount: Number(txResult.intent.amount),
        paidAt: txResult.intent.paidAt ? new Date(txResult.intent.paidAt) : new Date(),
      }).catch((error) => {
        console.error("deposit email send failed", error);
      });
    }
  }

  if (
    txResult.status === "applied" &&
    txResult.intent?.purpose === "inspection" &&
    txResult.intent?.inspectionId
  ) {
    void createNotification({
      userId: txResult.intent.userId,
      type: "purchase_paid",
      title: "Inspection payment confirmed",
      message: `Payment for inspection #${txResult.intent.inspectionId} was successful.`,
      entityType: "inspection",
      entityId: txResult.intent.inspectionId,
      priority: "high",
    }).catch(() => {});

    autoAssignInspector(txResult.intent.inspectionId).catch((e) =>
      console.error("auto-assign inspection post-payment error", e),
    );
  }

  if (
    txResult.status === "applied" &&
    txResult.intent?.purpose === "listing_purchase"
  ) {
    const [purchase] = await db
      .select({
        id: purchasesTable.id,
        listingId: purchasesTable.listingId,
        amount: purchasesTable.amount,
        buyerId: purchasesTable.buyerId,
        sellerId: purchasesTable.sellerId,
      })
      .from(purchasesTable)
      .where(eq(purchasesTable.receiptNumber, `RCP-${reference}`))
      .limit(1);
    if (purchase) {
      void createNotification({
        userId: purchase.buyerId,
        type: "purchase_paid",
        title: "Payment successful",
        message: `Purchase #${purchase.id} is now in escrow and awaiting your confirmation.`,
        entityType: "purchase",
        entityId: purchase.id,
        priority: "critical",
      }).catch(() => {});
      void createNotification({
        userId: purchase.sellerId,
        type: "purchase_paid",
        title: "Vehicle purchase paid",
        message: `A buyer paid for purchase #${purchase.id}. Funds are in escrow until buyer confirmation.`,
        entityType: "purchase",
        entityId: purchase.id,
        priority: "critical",
      }).catch(() => {});

      const [[buyer], [seller], [listing]] = await Promise.all([
        db
          .select({
            email: usersTable.email,
            firstName: usersTable.firstName,
          })
          .from(usersTable)
          .where(eq(usersTable.id, purchase.buyerId))
          .limit(1),
        db
          .select({
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
          })
          .from(usersTable)
          .where(eq(usersTable.id, purchase.sellerId))
          .limit(1),
        db
          .select({
            make: listingsTable.make,
            model: listingsTable.model,
            year: listingsTable.year,
          })
          .from(listingsTable)
          .where(eq(listingsTable.id, purchase.listingId))
          .limit(1),
      ]);

      if (buyer?.email) {
        const sellerName = [seller?.firstName, seller?.lastName].filter(Boolean).join(" ") || "Seller";
        const carName = listing
          ? `${listing.make} ${listing.model} ${listing.year}`
          : `Listing #${purchase.listingId}`;
        void sendPurchaseConfirmedEmail({
          email: buyer.email,
          firstName: buyer.firstName || "there",
          carName,
          price: Number(purchase.amount),
          sellerName,
          purchaseId: purchase.id,
        }).catch((error) => {
          console.error("purchase confirmation email send failed", error);
        });
      }
    }
  }

  return txResult;
}

// ─── GET /api/payments/verify/:reference ────────────────────────────────────
// Called from the Paystack callback page to confirm + apply the payment.
router.get(
  "/payments/verify/:reference",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const reference = String(req.params.reference ?? "");
      if (!reference) {
        res.status(400).json({ error: "Missing reference" });
        return;
      }

      const [intent] = await db
        .select()
        .from(paymentIntentsTable)
        .where(eq(paymentIntentsTable.reference, reference))
        .limit(1);
      if (!intent || intent.userId !== req.user!.userId) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }

      const paystack = await verifyTransaction(reference);
      if (paystack.status !== "success") {
        await db
          .update(paymentIntentsTable)
          .set({
            status: paystack.status === "abandoned" ? "abandoned" : "failed",
            paystackResponse: paystack,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentIntentsTable.id, intent.id),
              eq(paymentIntentsTable.status, "initialized"),
            ),
          );
        res.json({
          reference,
          status: paystack.status,
          purpose: intent.purpose,
          amount: intent.amount,
        });
        return;
      }

      const result = await applyPaymentSuccess(reference, paystack);
      const isSuccess = result.status === "applied" || result.status === "already";
      res.json({
        reference,
        status: isSuccess ? "success" : "failed",
        purpose: intent.purpose,
        amount: intent.amount,
        applied: result.status,
      });
    } catch (err) {
      req.log.error({ err }, "payments/verify failed");
      res.status(502).json({
        error: err instanceof Error ? err.message : "Verification failed",
      });
    }
  },
);

// ─── Webhook (Paystack → us) ────────────────────────────────────────────────
// Mounted with raw body parsing so the HMAC signature can be checked
// against the exact bytes Paystack signed. Always returns 200 quickly per
// Paystack's webhook contract; we log everything else.
router.post(
  "/paystack/webhook",
  raw({ type: "*/*" }),
  async (req, res) => {
    const signature = req.header("x-paystack-signature");
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody) || !verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    let event: { event?: string; data?: VerifyTransactionResponse };
    try {
      event = JSON.parse(rawBody.toString("utf8")) as typeof event;
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    if (event.event === "charge.success" && event.data?.reference) {
      try {
        // Re-verify with Paystack instead of trusting the webhook payload
        // outright — Paystack themselves recommend this defence-in-depth
        // step.
        const verified = await verifyTransaction(event.data.reference);
        if (verified.status === "success") {
          await applyPaymentSuccess(event.data.reference, verified);
        }
      } catch (err) {
        req.log.error({ err }, "webhook applyPayment failed");
      }
    }

    res.json({ ok: true });
  },
);

// ─── GET /api/me/subscription ────────────────────────────────────────────────
// Returns the seller's current active subscription + plan details, or null.
router.get("/me/subscription", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const [row] = await db
      .select({
        id: subscriptionsTable.id,
        status: subscriptionsTable.status,
        expiresAt: subscriptionsTable.expiresAt,
        plan: {
          id: subscriptionPlansTable.id,
          name: subscriptionPlansTable.name,
          price: subscriptionPlansTable.price,
          maxListings: subscriptionPlansTable.maxListings,
          maxPhotos: subscriptionPlansTable.maxPhotos,
          durationDays: subscriptionPlansTable.durationDays,
          featuredListingEnabled: subscriptionPlansTable.featuredListingEnabled,
          analyticsDashboardEnabled: subscriptionPlansTable.analyticsDashboardEnabled,
          features: subscriptionPlansTable.features,
          isFeatured: subscriptionPlansTable.isFeatured,
        },
      })
      .from(subscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
      .where(
        and(
          eq(subscriptionsTable.sellerId, userId),
          eq(subscriptionsTable.status, "active"),
        ),
      )
      .orderBy(desc(subscriptionsTable.expiresAt))
      .limit(1);

    if (!row || row.expiresAt < now) {
      res.json({ subscription: null });
      return;
    }
    res.json({ subscription: row });
  } catch (err) {
    req.log.error({ err }, "GET /me/subscription failed");
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

// ─── POST /api/subscriptions/free ────────────────────────────────────────────
// Activates a free (price=0) plan for the authenticated seller without payment.
router.post("/subscriptions/free", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const body = req.body as { planId?: unknown };
    const planId = Number(body.planId);
    if (!Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: "Invalid planId" });
      return;
    }
    const [plan] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(and(eq(subscriptionPlansTable.id, planId), eq(subscriptionPlansTable.isActive, true)))
      .limit(1);
    if (!plan) {
      res.status(404).json({ error: "Plan not found or inactive" });
      return;
    }
    if (Number(plan.price) > 0) {
      res.status(400).json({ error: "This plan requires payment — use POST /api/payments/init" });
      return;
    }
    const expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
    const [existing] = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.sellerId, userId))
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(1);
    if (existing) {
      await db
        .update(subscriptionsTable)
        .set({ planId, status: "active", expiresAt })
        .where(eq(subscriptionsTable.id, existing.id));
    } else {
      await db.insert(subscriptionsTable).values({ sellerId: userId, planId, status: "active", expiresAt });
    }
    res.json({ success: true, expiresAt });
  } catch (err) {
    req.log.error({ err }, "POST /subscriptions/free failed");
    res.status(500).json({ error: "Failed to activate free plan" });
  }
});

export default router;
