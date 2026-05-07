import { useCallback, useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft, Loader2, Search } from "lucide-react";
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
import {
  type ListingRow,
  type DetailResponse,
  formatNaira,
  formatUploadDate,
  titleCase,
  SummaryItem,
  OverviewTab,
} from "@/components/listing-detail/listing-detail-shared";

interface OfferRow {
  id: number;
  listingId: number;
  buyerId: number;
  amount: number;
  counterAmount: number | null;
  status:
    | "pending"
    | "accepted"
    | "declined"
    | "countered"
    | "completed"
    | "expired"
    | "cancelled";
  buyerMessage: string | null;
  sellerMessage: string | null;
  createdAt: string;
  updatedAt: string;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  buyerEmail: string | null;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function SellerListingDetailPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/seller/listings/:id");
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { navItems } = useDashboardNav();

  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "offers">("overview");

  // Offers state
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState<OfferRow | null>(null);
  const [counterTarget, setCounterTarget] = useState<OfferRow | null>(null);
  const [declineTarget, setDeclineTarget] = useState<OfferRow | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const loadOffers = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setOffersLoading(true);
    try {
      const res = await fetch(`/api/listings/${id}/offers`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { offers: OfferRow[] };
      setOffers(json.offers);
    } catch {
      toast({
        title: "Couldn't load offers",
        variant: "destructive",
      });
    } finally {
      setOffersLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (!user || !Number.isFinite(id) || tab !== "offers") return;
    void loadOffers();
  }, [user, id, tab, loadOffers]);

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

  // Auth/role guard — redirect non-sellers to their proper home, not blank.
  useEffect(() => {
    if (user === null) {
      navigate("/sign-in");
      return;
    }
    if (user && user.role !== "seller") {
      navigate(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, navigate]);

  // Bail early on invalid :id params (e.g. /seller/listings/foo).
  useEffect(() => {
    if (params && !Number.isFinite(id)) {
      toast({
        title: "Invalid listing",
        description: "That listing link looks broken.",
        variant: "destructive",
      });
      navigate("/seller/listings");
    }
  }, [params, id, navigate, toast]);

  useEffect(() => {
    if (!user || !Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/listings/${id}`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 404) {
            toast({
              title: "Listing not found",
              description: "It may have been deleted.",
              variant: "destructive",
            });
            navigate("/seller/listings");
            return;
          }
          throw new Error("Failed to load");
        }
        const json = (await res.json()) as DetailResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          toast({
            title: "Couldn't load listing",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, navigate, toast]);

  if (!user || user.role !== "seller") return null;

  const dashboardUser: DashboardUser = {
    name: `${user.firstName} ${user.lastName}`.trim() || user.email,
    email: user.email ?? "",
    avatarUrl: undefined,
  };

  const listing = data?.listing;
  const sellerName =
    data?.seller?.businessName ??
    [data?.seller?.firstName, data?.seller?.lastName]
      .filter(Boolean)
      .join(" ") ??
    "—";

  return (
    <DashboardLayout
      user={dashboardUser}
      navItems={navItems}
      title="My Listings"
      onLogout={logout}
    >
      {/* Page heading — matches buyer dashboard pages */}
      <div className="mb-6">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">
          My Listings
        </h1>
      </div>

      {/* Back */}
      <button
        onClick={() => navigate("/seller/listings")}
        className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm mb-3"
        data-testid="button-back"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {loading || !listing ? (
        <div className="py-20 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          {/* Title */}
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-4">
            {listing.make} {listing.model} , {listing.year}
          </h2>

          {/* Summary row (single container, no nested cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-x-6 gap-y-4 pb-6 border-b border-gray-200">
            <SummaryItem
              label="Car Details"
              value={`${listing.make} ${listing.model} , ${listing.year}`}
            />
            <SummaryItem label="Seller's Name" value={sellerName} />
            <SummaryItem
              label="Amount"
              value={formatNaira(listing.price)}
            />
            <SummaryItem
              label="Upload Date"
              value={formatUploadDate(listing.createdAt)}
            />
            <SummaryItem label="Offers" value={String(offers.length)} />
            <SummaryItem label="Views" value={String(listing.viewCount)} />
            <div>
              <p className="text-xs text-gray-400 mb-1">Listing Status</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                  listing.status === "active" &&
                    "bg-emerald-50 text-emerald-700",
                  listing.status === "sold" && "bg-gray-100 text-gray-600",
                  listing.status === "pending" && "bg-amber-50 text-amber-700",
                  listing.status === "suspended" && "bg-red-50 text-red-700",
                )}
              >
                {titleCase(listing.status)}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mt-6">
            <nav className="-mb-px flex gap-6">
              {(["overview", "offers"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "py-3 text-sm font-semibold border-b-2 transition-colors",
                    tab === k
                      ? "border-primary text-primary"
                      : "border-transparent text-gray-500 hover:text-gray-700",
                  )}
                  data-testid={`tab-${k}`}
                >
                  {k === "overview" ? "Car Overview" : "Offers"}
                </button>
              ))}
            </nav>
          </div>

          {tab === "overview" ? (
            <OverviewTab data={data!} />
          ) : (
            <OffersTab
              offers={offers}
              loading={offersLoading}
              actionSubmitting={actionSubmitting}
              onAccept={(o) => setAcceptTarget(o)}
              onCounter={(o) => setCounterTarget(o)}
              onDecline={(o) => setDeclineTarget(o)}
            />
          )}
        </>
      )}

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

// ─── Offers tab ──────────────────────────────────────────────────────────────
function OffersTab({
  offers,
  loading,
  actionSubmitting,
  onAccept,
  onCounter,
  onDecline,
}: {
  offers: OfferRow[];
  loading: boolean;
  actionSubmitting: boolean;
  onAccept: (o: OfferRow) => void;
  onCounter: (o: OfferRow) => void;
  onDecline: (o: OfferRow) => void;
}) {
  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  return <OffersTabContent
    offers={offers}
    actionSubmitting={actionSubmitting}
    onAccept={onAccept}
    onCounter={onCounter}
    onDecline={onDecline}
  />;
}

function OffersTabContent({
  offers,
  actionSubmitting,
  onAccept,
  onCounter,
  onDecline,
}: {
  offers: OfferRow[];
  actionSubmitting: boolean;
  onAccept: (o: OfferRow) => void;
  onCounter: (o: OfferRow) => void;
  onDecline: (o: OfferRow) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = offers.filter((o) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const name = [o.buyerFirstName, o.buyerLastName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      name.includes(q) ||
      String(o.id).includes(q) ||
      String(o.amount).includes(q.replace(/[^0-9]/g, ""))
    );
  });

  return (
    <div className="mt-8">
      {/* Header row: count on the left, search centered (matches reference) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-xl font-extrabold text-gray-900">
          Offers({offers.length})
        </h3>
        <div className="relative w-full sm:max-w-md sm:mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search here..."
            className="w-full rounded-full border border-gray-200 pl-9 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="input-search-offers"
          />
        </div>
        <div className="hidden sm:block sm:w-32" aria-hidden />
      </div>

      {/* Spreadsheet — single container, no nested cards. Mobile-first:
          scroll horizontally so the row stays intact on small viewports. */}
      <div className="-mx-1 overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-12 gap-x-4 px-2 py-3 text-xs font-medium text-gray-400 border-b border-gray-200">
            <div className="col-span-1">TXN ID</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Offer Amount</div>
            <div className="col-span-6" />
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              {offers.length === 0
                ? "No offers yet on this listing."
                : "No offers match your search."}
            </div>
          ) : (
            filtered.map((o) => {
              const buyerName =
                [o.buyerFirstName, o.buyerLastName].filter(Boolean).join(" ") ||
                o.buyerEmail ||
                `Buyer #${o.buyerId}`;
              const canAct = o.status === "pending" || o.status === "countered";
              return (
                <div
                  key={o.id}
                  className="grid grid-cols-12 gap-x-4 px-2 py-4 items-center text-sm border-b border-gray-100"
                  data-testid={`offer-row-${o.id}`}
                >
                  <div className="col-span-1 text-gray-700 italic">
                    {String(o.id).padStart(2, "0")}
                  </div>
                  <div className="col-span-3 italic text-gray-700 truncate">
                    {buyerName}
                  </div>
                  <div className="col-span-2 italic text-gray-700 whitespace-nowrap">
                    {`N ${o.amount.toLocaleString("en-NG", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
                  </div>
                  <div className="col-span-6 flex items-center justify-end gap-3">
                    {canAct ? (
                      <>
                        <button
                          onClick={() => onAccept(o)}
                          disabled={actionSubmitting}
                          className="whitespace-nowrap rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                          data-testid={`button-accept-${o.id}`}
                        >
                          Accept Offer
                        </button>
                        <button
                          onClick={() => onCounter(o)}
                          disabled={actionSubmitting}
                          className="whitespace-nowrap rounded-full border border-gray-200 px-5 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                          data-testid={`button-counter-${o.id}`}
                        >
                          Counter Offer
                        </button>
                        <button
                          onClick={() => onDecline(o)}
                          disabled={actionSubmitting}
                          className="whitespace-nowrap rounded-full bg-[#F5C0AE] px-5 py-2 text-xs font-semibold text-white hover:bg-[#EFB099] disabled:opacity-60"
                          data-testid={`button-decline-${o.id}`}
                        >
                          Decline Offer
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-medium capitalize text-gray-400">
                        {o.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

