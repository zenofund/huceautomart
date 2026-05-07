import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDashboardNav } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import { AcceptOfferDialog } from "@/components/dialogs/accept-offer-dialog";
import { CounterOfferDialog } from "@/components/dialogs/counter-offer-dialog";
import { DeclineOfferDialog } from "@/components/dialogs/decline-offer-dialog";

// ─── Types ───────────────────────────────────────────────────────────────────
type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "countered"
  | "completed"
  | "expired"
  | "cancelled";

interface OfferRow {
  id: number;
  listingId: number;
  buyerId: number;
  amount: number;
  counterAmount: number | null;
  status: OfferStatus;
  buyerMessage: string | null;
  sellerMessage: string | null;
  createdAt: string;
  updatedAt: string;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  buyerEmail: string | null;
  listingMake: string | null;
  listingModel: string | null;
  listingYear: number | null;
}

interface OffersResponse {
  offers: OfferRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatNaira(amount: number): string {
  return `N ${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buyerNameOf(o: OfferRow): string {
  return (
    [o.buyerFirstName, o.buyerLastName].filter(Boolean).join(" ") ||
    o.buyerEmail ||
    `Buyer #${o.buyerId}`
  );
}

function carDetailsOf(o: OfferRow): string {
  const parts = [o.listingMake, o.listingModel, o.listingYear]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" ");
  return parts || `Listing #${o.listingId}`;
}

// Tasteful pagination strip: shows neighbors of the current page plus first &
// last with an ellipsis. Mirrors the pattern in the reference (1 2 3 … 8 9 10).
function paginationItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "ellipsis")[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  items.push(1);
  if (left > 2) items.push("ellipsis");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function SellerOffersPage() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { navItems } = useDashboardNav();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);

  const [acceptTarget, setAcceptTarget] = useState<OfferRow | null>(null);
  const [counterTarget, setCounterTarget] = useState<OfferRow | null>(null);
  const [declineTarget, setDeclineTarget] = useState<OfferRow | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Auth/role guard
  useEffect(() => {
    if (user === null) {
      navigate("/sign-in");
    } else if (user && user.role !== "seller") {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  // Debounce the search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadOffers = useCallback(async () => {
    if (!user || user.role !== "seller") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/sellers/me/offers?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load offers");
      const json = (await res.json()) as OffersResponse;
      setOffers(json.offers);
      setPagination(json.pagination);
    } catch (err) {
      toast({
        title: "Couldn't load offers",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, page, debouncedSearch, toast]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  if (!user || user.role !== "seller") return null;

  const dashboardUser: DashboardUser = {
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      "Seller",
    email: user.email ?? "",
    avatarUrl: user.profilePhotoUrl ?? undefined,
  };

  // ─── Action handlers ─────────────────────────────────────────────────────
  async function handleAccept() {
    if (!acceptTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`/api/offers/${acceptTarget.id}/accept`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error ?? "Failed to accept offer");
      }
      toast({
        title: "Offer accepted",
        description: "The buyer has been notified to proceed with payment.",
      });
      setAcceptTarget(null);
      await loadOffers();
    } catch (err) {
      toast({
        title: "Couldn't accept offer",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleCounter(amount: number, message: string) {
    if (!counterTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`/api/offers/${counterTarget.id}/counter`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, message: message || undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error ?? "Failed to send counter offer");
      }
      toast({
        title: "Counter offer sent",
        description: "The buyer has been notified.",
      });
      setCounterTarget(null);
      await loadOffers();
    } catch (err) {
      toast({
        title: "Couldn't send counter",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!declineTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`/api/offers/${declineTarget.id}/decline`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error ?? "Failed to decline offer");
      }
      toast({
        title: "Offer declined",
        description: "The buyer has been notified of your decision.",
      });
      setDeclineTarget(null);
      await loadOffers();
    } catch (err) {
      toast({
        title: "Couldn't decline offer",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setActionSubmitting(false);
    }
  }

  return (
    <DashboardLayout
      user={dashboardUser}
      navItems={navItems}
      title="Offers"
      onLogout={logout}
    >
      {/* Page heading — matches buyer dashboard pages */}
      <div className="mb-6">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">Offers</h1>
      </div>

      {/* Header row: count on the left, search centered (matches reference) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-xl font-extrabold text-gray-900">
          Offers({pagination.total})
        </h3>
        <div className="relative w-full sm:max-w-md sm:mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search here..."
            className="w-full rounded-full border border-gray-200 pl-9 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="input-search-offers"
          />
        </div>
        <div className="hidden sm:block sm:w-32" aria-hidden />
      </div>

      {/* Spreadsheet — single container, no nested cards. Mobile-first:
          horizontally scroll on narrow viewports so the row layout stays
          consistent with the design and never collapses. */}
      <div className="-mx-1 overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-12 gap-x-4 px-2 py-3 text-xs font-medium text-gray-400 border-b border-gray-200">
            <div className="col-span-1">TXN ID</div>
            <div className="col-span-2">Name</div>
            <div className="col-span-2">Offer Amount</div>
            <div className="col-span-2">Car Details</div>
            <div className="col-span-5" />
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : offers.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              {debouncedSearch
                ? "No offers match your search."
                : "You haven't received any offers yet."}
            </div>
          ) : (
            offers.map((o) => {
              // Seller can only act while the ball is in their court (status=pending).
              // status=countered means the seller already countered and is waiting
              // for the buyer to respond — no further seller action required.
              const canAct = o.status === "pending";
              return (
                <div
                  key={o.id}
                  className="grid grid-cols-12 gap-x-4 px-2 py-4 items-center text-sm border-b border-gray-100"
                  data-testid={`offer-row-${o.id}`}
                >
                  <div className="col-span-1 text-gray-700 italic">
                    {String(o.id).padStart(2, "0")}
                  </div>
                  <div className="col-span-2 italic text-gray-700 truncate">
                    {buyerNameOf(o)}
                  </div>
                  <div className="col-span-2 italic text-gray-700 whitespace-nowrap">
                    {formatNaira(o.amount)}
                  </div>
                  <button
                    onClick={() => navigate(`/seller/listings/${o.listingId}`)}
                    className="col-span-2 italic text-gray-700 hover:text-primary text-left truncate"
                    data-testid={`link-listing-${o.listingId}`}
                  >
                    {carDetailsOf(o)}
                  </button>
                  <div className="col-span-5 flex items-center justify-end gap-3">
                    {canAct ? (
                      <>
                        <button
                          onClick={() => setAcceptTarget(o)}
                          disabled={actionSubmitting}
                          className="whitespace-nowrap rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                          data-testid={`button-accept-${o.id}`}
                        >
                          Accept Offer
                        </button>
                        <button
                          onClick={() => setCounterTarget(o)}
                          disabled={actionSubmitting}
                          className="whitespace-nowrap rounded-full border border-gray-200 px-5 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                          data-testid={`button-counter-${o.id}`}
                        >
                          Counter Offer
                        </button>
                        <button
                          onClick={() => setDeclineTarget(o)}
                          disabled={actionSubmitting}
                          className="whitespace-nowrap rounded-full bg-[#F5C0AE] px-5 py-2 text-xs font-semibold text-white hover:bg-[#EFB099] disabled:opacity-60"
                          data-testid={`button-decline-${o.id}`}
                        >
                          Decline Offer
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs font-medium capitalize ${
                        o.status === "countered"
                          ? "text-amber-600"
                          : o.status === "accepted"
                            ? "text-primary"
                            : "text-gray-400"
                      }`}>
                        {o.status === "countered" ? "Awaiting buyer" : o.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination strip (matches reference: Previous • 1 2 3 … 8 9 10 • Next) */}
      {pagination.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-1">
            {paginationItems(page, pagination.totalPages).map((it, i) =>
              it === "ellipsis" ? (
                <span
                  key={`e-${i}`}
                  className="px-2 text-gray-400 select-none"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={it}
                  onClick={() => setPage(it)}
                  className={cn(
                    "min-w-[36px] h-9 rounded-md px-2 text-sm font-medium transition-colors",
                    it === page
                      ? "bg-primary/10 text-primary"
                      : "text-gray-600 hover:bg-gray-50",
                  )}
                  data-testid={`button-page-${it}`}
                >
                  {it}
                </button>
              ),
            )}
          </div>

          <button
            onClick={() =>
              setPage((p) => Math.min(pagination.totalPages, p + 1))
            }
            disabled={page >= pagination.totalPages}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Confirmation dialogs */}
      <AcceptOfferDialog
        open={!!acceptTarget}
        onClose={() => (actionSubmitting ? null : setAcceptTarget(null))}
        onConfirm={handleAccept}
        submitting={actionSubmitting}
        amount={acceptTarget?.amount ?? 0}
      />
      <CounterOfferDialog
        open={!!counterTarget}
        onClose={() => (actionSubmitting ? null : setCounterTarget(null))}
        onConfirm={handleCounter}
        submitting={actionSubmitting}
        initialAmount={counterTarget?.amount ?? 0}
      />
      <DeclineOfferDialog
        open={!!declineTarget}
        onClose={() => (actionSubmitting ? null : setDeclineTarget(null))}
        onConfirm={handleDecline}
        submitting={actionSubmitting}
      />
    </DashboardLayout>
  );
}
