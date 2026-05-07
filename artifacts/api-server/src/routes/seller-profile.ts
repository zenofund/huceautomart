import { Router } from "express";
import {
  db,
  bankAccountsTable,
  sellerProfilesTable,
  usersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import { resolveAccount } from "../lib/paystack";
import { createRoleNotifications } from "../lib/notifications";
import { deleteManagedMediaRef } from "../lib/mediaCleanup";

const URL_RE = /^https?:\/\/.+/i;

type PatchPayload = {
  ninNumber?: string;
  ninDocumentUrl?: string;
  proofOfAddressUrl?: string;
  bankCode?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  businessName?: string;
  lotName?: string;
  businessRegNumber?: string;
  bio?: string;
  location?: string;
  website?: string;
  profilePhotoUrl?: string;
};

function validatePatch(body: unknown): { ok: true; data: PatchPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid payload" };
  const b = body as Record<string, unknown>;
  const out: PatchPayload = {};
  const str = (k: string, min: number, max: number): string | null => {
    if (b[k] === undefined) return null;
    if (typeof b[k] !== "string") return null;
    const v = (b[k] as string).trim();
    if (v.length < min || v.length > max) return null;
    return v;
  };
  const url = (k: string): string | null => {
    if (b[k] === undefined) return null;
    if (typeof b[k] !== "string" || !URL_RE.test(b[k] as string)) return null;
    return b[k] as string;
  };

  if (b.ninNumber !== undefined) {
    if (typeof b.ninNumber !== "string" || !/^\d{11}$/.test(b.ninNumber)) {
      return { ok: false, error: "NIN must be 11 digits" };
    }
    out.ninNumber = b.ninNumber;
  }
  if (b.ninDocumentUrl !== undefined) {
    const v = url("ninDocumentUrl");
    if (!v) return { ok: false, error: "Invalid NIN document URL" };
    out.ninDocumentUrl = v;
  }
  if (b.proofOfAddressUrl !== undefined) {
    const v = url("proofOfAddressUrl");
    if (!v) return { ok: false, error: "Invalid proof of address URL" };
    out.proofOfAddressUrl = v;
  }
  if (b.profilePhotoUrl !== undefined) {
    const v = url("profilePhotoUrl");
    if (!v) return { ok: false, error: "Invalid photo URL" };
    out.profilePhotoUrl = v;
  }
  if (b.website !== undefined) {
    const v = url("website");
    if (!v) return { ok: false, error: "Invalid website URL" };
    out.website = v;
  }
  if (b.bankAccountNumber !== undefined) {
    if (typeof b.bankAccountNumber !== "string" || !/^\d{10}$/.test(b.bankAccountNumber)) {
      return { ok: false, error: "Account number must be 10 digits" };
    }
    out.bankAccountNumber = b.bankAccountNumber;
  }
  if (b.bankCode !== undefined) {
    if (typeof b.bankCode !== "string" || !/^\d{1,10}$/.test(b.bankCode.trim())) {
      return { ok: false, error: "Invalid bank code" };
    }
    out.bankCode = b.bankCode.trim();
  }

  const stringFields: Array<[keyof PatchPayload, number, number]> = [
    ["bankName", 2, 120],
    // bankAccountName is intentionally NOT accepted from the client — we
    // always derive it server-side from Paystack's resolveAccount so a
    // user can't payout to "Their Name" while sending money to a stranger.
    ["businessName", 2, 160],
    ["lotName", 0, 160],
    ["businessRegNumber", 0, 60],
    ["bio", 0, 2000],
    ["location", 0, 160],
  ];
  for (const [k, min, max] of stringFields) {
    const v = str(k as string, min, max);
    if (v !== null) (out[k] as string) = v;
  }

  return { ok: true, data: out };
}

const router = Router();

function computeStatuses(
  p: typeof sellerProfilesTable.$inferSelect | undefined,
  profilePhotoUrl: string | null,
  hasBankAccount: boolean,
) {
  // An admin-verified seller (isVerified: true) is considered fully completed
  // regardless of whether they have filled in every individual document field.
  if (p?.isVerified) {
    return {
      nin: "completed",
      proof: "completed",
      bank: "completed",
      profile: "completed",
      allCompleted: true,
    } as const;
  }

  const ninDone = !!p?.ninDocumentUrl && !!p?.ninNumber;
  const proofDone = !!p?.proofOfAddressUrl;
  const bankDone =
    hasBankAccount ||
    (!!p?.bankName && !!p?.bankAccountNumber && !!p?.bankAccountName);
  const profileDone = !!profilePhotoUrl || !!p?.businessName;

  return {
    nin: ninDone ? "completed" : "pending",
    proof: proofDone ? "completed" : "pending",
    bank: bankDone ? "completed" : "pending",
    profile: profileDone ? "completed" : "pending",
    allCompleted: ninDone && proofDone && bankDone && profileDone,
  } as const;
}

router.get(
  "/sellers/me/profile",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      if (user.role !== "seller") {
        res.status(403).json({ error: "Not a seller account" });
        return;
      }

      const [profile] = await db
        .select()
        .from(sellerProfilesTable)
        .where(eq(sellerProfilesTable.userId, userId))
        .limit(1);

      const [bankAccount] = await db
        .select({ id: bankAccountsTable.id })
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.userId, userId))
        .limit(1);

      const verification = computeStatuses(
        profile,
        user.profilePhotoUrl,
        Boolean(bankAccount),
      );

      res.json({
        profile: profile ?? null,
        profilePhotoUrl: user.profilePhotoUrl ?? null,
        verification,
      });
    } catch (err) {
      req.log.error({ err }, "Error fetching seller profile");
      res.status(500).json({ error: "Failed to fetch seller profile" });
    }
  },
);

router.patch(
  "/sellers/me/profile",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const parsed = validatePatch(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const userId = req.user!.userId;

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user || user.role !== "seller") {
        res.status(403).json({ error: "Not a seller account" });
        return;
      }
      const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
      const previousProfilePhotoUrl = user.profilePhotoUrl ?? null;

      const { profilePhotoUrl, bankCode, ...sellerFields } = parsed.data;
      const _sellerFields: Record<string, string> = sellerFields as Record<string, string>;

      // Server-side bank verification. If the caller is touching ANY of the
      // bank fields, we require them to also send bankCode + bankName +
      // bankAccountNumber, then we call Paystack to resolve the account
      // name. The resolved name is the only thing we ever store as
      // bankAccountName — the client value (if any) is ignored.
      const touchingBank =
        _sellerFields.bankName !== undefined ||
        _sellerFields.bankAccountNumber !== undefined ||
        bankCode !== undefined;
      if (touchingBank) {
        if (
          !bankCode ||
          !_sellerFields.bankName ||
          !_sellerFields.bankAccountNumber
        ) {
          res.status(400).json({
            error:
              "Bank update requires bankCode, bankName, and bankAccountNumber.",
          });
          return;
        }
        try {
          const resolved = await resolveAccount(
            _sellerFields.bankAccountNumber,
            bankCode,
          );
          _sellerFields.bankAccountName = resolved.account_name;
          _sellerFields.bankAccountNumber = resolved.account_number;
        } catch (err) {
          res.status(400).json({
            error:
              err instanceof Error
                ? err.message
                : "Could not verify bank account",
          });
          return;
        }
      }

      const result = await db.transaction(async (tx) => {
        if (profilePhotoUrl !== undefined) {
          await tx
            .update(usersTable)
            .set({ profilePhotoUrl, updatedAt: new Date() })
            .where(eq(usersTable.id, userId));
        }

        const [existing] = await tx
          .select()
          .from(sellerProfilesTable)
          .where(eq(sellerProfilesTable.userId, userId))
          .limit(1);

        let profile = existing;
        if (!existing) {
          const [created] = await tx
            .insert(sellerProfilesTable)
            .values({ userId, ..._sellerFields })
            .returning();
          profile = created;
        } else if (Object.keys(_sellerFields).length > 0) {
          const [updated] = await tx
            .update(sellerProfilesTable)
            .set({ ..._sellerFields, updatedAt: new Date() })
            .where(eq(sellerProfilesTable.userId, userId))
            .returning();
          profile = updated;
        }

        // Mirror seller payment details into bank_accounts so wallet withdraw
        // checks use the same verified bank source across all roles.
        if (touchingBank && bankCode && _sellerFields.bankName && _sellerFields.bankAccountNumber && _sellerFields.bankAccountName) {
          const [existingBank] = await tx
            .select()
            .from(bankAccountsTable)
            .where(
              and(
                eq(bankAccountsTable.userId, userId),
                eq(bankAccountsTable.bankCode, bankCode),
                eq(bankAccountsTable.accountNumber, _sellerFields.bankAccountNumber),
              ),
            )
            .limit(1);

          const [defaultBank] = await tx
            .select({ id: bankAccountsTable.id })
            .from(bankAccountsTable)
            .where(
              and(
                eq(bankAccountsTable.userId, userId),
                eq(bankAccountsTable.isDefault, true),
              ),
            )
            .limit(1);

          if (existingBank) {
            await tx
              .update(bankAccountsTable)
              .set({
                bankName: _sellerFields.bankName,
                accountName: _sellerFields.bankAccountName,
                isDefault: defaultBank ? existingBank.isDefault : true,
                updatedAt: new Date(),
              })
              .where(eq(bankAccountsTable.id, existingBank.id));
          } else {
            await tx.insert(bankAccountsTable).values({
              userId,
              bankCode,
              bankName: _sellerFields.bankName,
              accountNumber: _sellerFields.bankAccountNumber,
              accountName: _sellerFields.bankAccountName,
              isDefault: !defaultBank,
            });
          }
        }

        const [freshUser] = await tx
          .select({ profilePhotoUrl: usersTable.profilePhotoUrl })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);

        return { profile, profilePhotoUrl: freshUser?.profilePhotoUrl ?? null };
      });

      const [bankAccount] = await db
        .select({ id: bankAccountsTable.id })
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.userId, userId))
        .limit(1);

      const verification = computeStatuses(
        result.profile,
        result.profilePhotoUrl,
        Boolean(bankAccount),
      );

      if (profilePhotoUrl !== undefined) {
        const newProfilePhotoUrl = result.profilePhotoUrl ?? null;
        if (previousProfilePhotoUrl && previousProfilePhotoUrl !== newProfilePhotoUrl) {
          void deleteManagedMediaRef(previousProfilePhotoUrl, req.log);
        }
      }

      let finalProfile = result.profile;
      if (
        verification.allCompleted &&
        finalProfile &&
        !finalProfile.isVerified &&
        finalProfile.verificationStatus !== "pending"
      ) {
        const [pendingProfile] = await db
          .update(sellerProfilesTable)
          .set({
            verificationStatus: "pending",
            updatedAt: new Date(),
          })
          .where(eq(sellerProfilesTable.userId, userId))
          .returning();
        if (pendingProfile) {
          finalProfile = pendingProfile;
        }
        void createRoleNotifications("admin", {
          type: "system",
          title: "Seller verification awaiting review",
          message: `${displayName} has completed seller verification requirements and is awaiting admin review.`,
          entityType: "seller_profile",
          entityId: finalProfile?.id,
          priority: "high",
          data: { sellerUserId: userId },
        }).catch((err) => {
          req.log.error({ err, userId }, "failed to notify admins for seller verification");
        });
      }

      res.json({
        profile: finalProfile,
        profilePhotoUrl: result.profilePhotoUrl,
        verification: computeStatuses(finalProfile, result.profilePhotoUrl, Boolean(bankAccount)),
      });
    } catch (err) {
      req.log.error({ err }, "Error updating seller profile");
      res.status(500).json({ error: "Failed to update seller profile" });
    }
  },
);

export default router;
