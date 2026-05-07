import { Router } from "express";
import {
  db,
  listingsTable,
  offersTable,
  purchasesTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  walletAccountsTable,
  walletTransactionsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, ne, sql, count, sum } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware";
import { getSellerPlanLimits } from "../lib/subscription";

const router = Router();

router.get(
  "/sellers/me/dashboard",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const [user] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user || user.role !== "seller") {
        res.status(403).json({ error: "Not a seller account" });
        return;
      }

      const plan = await getSellerPlanLimits(userId);
      if (!plan || !plan.analyticsDashboardEnabled) {
        res.status(403).json({
          error: "Your current plan does not include the analytics dashboard. Upgrade your subscription to access seller analytics.",
          code: "ANALYTICS_NOT_AVAILABLE",
          planName: plan?.planName ?? null,
        });
        return;
      }

      const [
        listingsCounts,
        offersCounts,
        revenueRow,
        pendingRevenueRow,
        withdrawnRow,
        unreadMessagesRow,
        conversationsRow,
      ] = await Promise.all([
        // Total + status breakdown for non-deleted listings
        db
          .select({
            status: listingsTable.status,
            count: count(),
          })
          .from(listingsTable)
          .where(
            and(
              eq(listingsTable.sellerId, userId),
              ne(listingsTable.status, "deleted"),
            ),
          )
          .groupBy(listingsTable.status),

        // Offers by status (excluding cancelled/expired for the headline count)
        db
          .select({
            status: offersTable.status,
            count: count(),
          })
          .from(offersTable)
          .where(eq(offersTable.sellerId, userId))
          .groupBy(offersTable.status),

        // Revenue earned: completed purchases payouts
        db
          .select({
            total: sql<number>`COALESCE(SUM(CASE
              WHEN ${purchasesTable.paymentStatus} = 'completed'
              THEN CASE
                WHEN ${purchasesTable.sellerPayout} > 0 THEN ${purchasesTable.sellerPayout}
                ELSE ${purchasesTable.amount} - COALESCE(${purchasesTable.platformFee}, 0)
              END
              ELSE 0
            END), 0)::float`,
          })
          .from(purchasesTable)
          .where(eq(purchasesTable.sellerId, userId)),

        // Pending revenue: pending purchases payouts
        db
          .select({
            total: sql<number>`COALESCE(SUM(CASE
              WHEN ${purchasesTable.paymentStatus} IN ('pending', 'in_escrow')
              THEN CASE
                WHEN ${purchasesTable.sellerPayout} > 0 THEN ${purchasesTable.sellerPayout}
                ELSE ${purchasesTable.amount} - COALESCE(${purchasesTable.platformFee}, 0)
              END
              ELSE 0
            END), 0)::float`,
          })
          .from(purchasesTable)
          .where(eq(purchasesTable.sellerId, userId)),

        // Withdrawn: completed wallet withdrawals for this user
        db
          .select({ total: sum(walletTransactionsTable.amount) })
          .from(walletTransactionsTable)
          .innerJoin(
            walletAccountsTable,
            eq(walletTransactionsTable.walletId, walletAccountsTable.id),
          )
          .where(
            and(
              eq(walletAccountsTable.userId, userId),
              eq(walletTransactionsTable.type, "withdrawal"),
              eq(walletTransactionsTable.status, "completed"),
            ),
          ),

        // Unread messages: messages in DIRECT conversations the user participates
        // in, sent by someone else, after their last_read_at (or all if never read).
        db
          .select({ count: count() })
          .from(messagesTable)
          .innerJoin(
            conversationParticipantsTable,
            and(
              eq(
                conversationParticipantsTable.conversationId,
                messagesTable.conversationId,
              ),
              eq(conversationParticipantsTable.userId, userId),
            ),
          )
          .innerJoin(
            conversationsTable,
            eq(conversationsTable.id, messagesTable.conversationId),
          )
          .where(
            and(
              eq(conversationsTable.type, "direct"),
              ne(messagesTable.senderId, userId),
              sql`(${conversationParticipantsTable.lastReadAt} IS NULL
                   OR ${messagesTable.createdAt} > ${conversationParticipantsTable.lastReadAt})`,
            ),
          ),

        // Total conversations the user participates in
        db
          .select({ count: count() })
          .from(conversationParticipantsTable)
          .innerJoin(
            conversationsTable,
            eq(conversationsTable.id, conversationParticipantsTable.conversationId),
          )
          .where(
            and(
              eq(conversationParticipantsTable.userId, userId),
              eq(conversationsTable.type, "direct"),
            ),
          ),
      ]);

      const listingByStatus: Record<string, number> = {};
      for (const row of listingsCounts) listingByStatus[row.status] = row.count;
      const totalListings =
        (listingByStatus.active ?? 0) +
        (listingByStatus.sold ?? 0) +
        (listingByStatus.pending ?? 0) +
        (listingByStatus.suspended ?? 0);

      const offersByStatus: Record<string, number> = {};
      for (const row of offersCounts) offersByStatus[row.status] = row.count;
      const totalOffers = Object.values(offersByStatus).reduce(
        (a, b) => a + b,
        0,
      );

      const revenueEarned = Number(revenueRow[0]?.total ?? 0);
      const pendingRevenue = Number(pendingRevenueRow[0]?.total ?? 0);
      const withdrawnRevenue = Number(withdrawnRow[0]?.total ?? 0);

      res.json({
        listings: {
          total: totalListings,
          active: listingByStatus.active ?? 0,
          sold: listingByStatus.sold ?? 0,
          pending: listingByStatus.pending ?? 0,
          suspended: listingByStatus.suspended ?? 0,
        },
        offers: {
          total: totalOffers,
          pending: offersByStatus.pending ?? 0,
          accepted: offersByStatus.accepted ?? 0,
          declined: offersByStatus.declined ?? 0,
          completed: offersByStatus.completed ?? 0,
        },
        messages: {
          conversations: conversationsRow[0]?.count ?? 0,
          unread: unreadMessagesRow[0]?.count ?? 0,
        },
        revenue: {
          earned: revenueEarned,
          pending: pendingRevenue,
          withdrawn: withdrawnRevenue,
          total: revenueEarned + pendingRevenue,
          currency: "NGN",
        },
      });
    } catch (err) {
      req.log.error({ err }, "Error fetching seller dashboard");
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  },
);

export default router;
