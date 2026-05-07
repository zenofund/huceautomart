import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Home, ClipboardList, Heart, Car, MessageSquare,
  Wallet, HeadphonesIcon, UserRound, ChevronLeft,
  CarFront, Gauge, Fuel, Calendar, Settings2, Cog,
  DoorOpen, Palette, Hash, CheckCircle2, Loader2,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardNavItem,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PaymentDialog } from "@/components/dialogs/payment-dialog";
import { NewOfferDialog } from "@/components/dialogs/new-offer-dialog";
import { CounterOfferDialog } from "@/components/dialogs/counter-offer-dialog";

import { generateSlug } from "@/lib/seo";

const buyerNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/activity", label: "Inspection / Offers / Purchases", icon: ClipboardList },
  { href: "/dashboard/saved", label: "Saved Car", icon: Heart },
  { href: "/dashboard/history", label: "Viewed Car History", icon: Car },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/support", label: "Customer Support", icon: HeadphonesIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

// ─── Server response shapes ─────────────────────────────────────────────────
interface ApiOffer {
  id: number;
  listingId: number;
  buyerId: number;
  sellerId: number;
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
  listingMake: string | null;
  listingModel: string | null;
  listingYear: number | null;
  listingPrice: number | null;
  sellerFirstName: string | null;
  sellerLastName: string | null;
  sellerBusinessName: string | null;
}

interface ApiListing {
  id: number;
  make: string;
  model: string;
  year: number;
  price: number;
  condition: string;
  location: string;
  mileage: number;
  color: string | null;
  carType: string | null;
  transmission: string | null;
  fuelType: string | null;
  driveType: string | null;
  doors: number | null;
  vin: string | null;
}

interface ApiListingResponse {
  listing: ApiListing;
  images: Array<{ url: string }>;
  features: Array<{ id: number; name: string; featureGroup: string | null }>;
  sellerName: string;
}

interface ApiWallet {
  wallet: { balance: number | string };
}

interface ApiPurchaseLookup {
  items: Array<{
    offerId: number | null;
    paymentStatus: "pending" | "in_escrow" | "completed" | "failed" | "refunded";
  }>;
}

// ─── Fetch helper ────────────────────────────────────────────────────────────
async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function offerSellerName(o: ApiOffer): string {
  if (o.sellerBusinessName) return o.sellerBusinessName;
  return `${o.sellerFirstName ?? ""} ${o.sellerLastName ?? ""}`.trim() || "—";
}
function formatNaira(n: number) {
  return `\u20A6 ${Math.round(n).toLocaleString()}.00`;
}
function formatDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Maps DB status to a display label.
// "countered" is kept separate so the buyer sees a distinct "Countered" state
// with different action buttons (not conflated with "Pending").
type UiStatus = "Accepted" | "Pending" | "Countered" | "Rejected" | "Completed" | "Cancelled";

function uiStatus(s: ApiOffer["status"]): UiStatus {
  if (s === "accepted") return "Accepted";
  if (s === "completed") return "Completed";
  if (s === "cancelled") return "Cancelled";
  if (s === "declined" || s === "expired") return "Rejected";
  if (s === "countered") return "Countered";
  return "Pending";
}

function bucketFeatures(features: Array<{ name: string; featureGroup: string | null }>) {
  const buckets = { interior: [] as string[], safety: [] as string[], exterior: [] as string[], comfort: [] as string[] };
  for (const f of features) {
    const g = (f.featureGroup ?? "").toLowerCase();
    if (g.includes("interior")) buckets.interior.push(f.name);
    else if (g.includes("safety") || g.includes("security")) buckets.safety.push(f.name);
    else if (g.includes("exterior")) buckets.exterior.push(f.name);
    else buckets.comfort.push(f.name);
  }
  return buckets;
}

function MetaCol({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] text-gray-400 mb-0.5 whitespace-nowrap">{label}</div>
      <div className="text-sm font-bold text-gray-900 leading-snug">{value}</div>
    </div>
  );
}

function SpecRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <Icon className="h-4 w-4 text-gray-300 shrink-0" />
      <span className="w-28 text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-gray-700 py-0.5">
      <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
      {text}
    </li>
  );
}

export default function BuyerOfferDetail() {
  const { user: authUser, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const offerId = params.id;

  const [offer, setOffer] = useState<ApiOffer | null>(null);
  const [listing, setListing] = useState<ApiListingResponse | null>(null);
  const [wallet, setWallet] = useState<number>(0);
  const [purchaseStatus, setPurchaseStatus] = useState<
    ApiPurchaseLookup["items"][number]["paymentStatus"] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Button loading states
  const [cancelling, setCancelling] = useState(false);
  const [accepting, setAccepting] = useState(false);

  // Dialog visibility
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [newOfferOpen, setNewOfferOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterSubmitting, setCounterSubmitting] = useState(false);

  useEffect(() => {
    if (!offerId) return;
    let cancelled = false;
    (async () => {
      try {
        const [offerRes, walletRes, purchasesRes] = await Promise.all([
          jsonFetch<{ offer: ApiOffer }>(`/api/offers/${offerId}`),
          jsonFetch<ApiWallet>("/api/wallet").catch(() => null),
          jsonFetch<ApiPurchaseLookup>("/api/buyer/purchases?pageSize=100").catch(() => null),
        ]);
        if (cancelled) return;
        setOffer(offerRes.offer);
        if (walletRes) setWallet(Number(walletRes.wallet.balance) || 0);
        if (purchasesRes?.items) {
          const match = purchasesRes.items.find((p) => p.offerId === offerRes.offer.id);
          setPurchaseStatus(match?.paymentStatus ?? null);
        } else {
          setPurchaseStatus(null);
        }
        const listingRes = await jsonFetch<ApiListingResponse>(
          `/api/buyer/listings/${offerRes.offer.listingId}`,
        );
        if (!cancelled) setListing(listingRes);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, [offerId]);

  const user: DashboardUser = {
    name: authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "Buyer",
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? true,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => { await logout(); setLocation("/sign-in"); };

  // Cancel the offer
  const handleCancel = async () => {
    if (!offer || cancelling) return;
    setCancelling(true);
    try {
      const res = await jsonFetch<{ offer: ApiOffer }>(`/api/offers/${offer.id}/cancel`, { method: "PATCH" });
      setOffer(res.offer);
      toast({ title: "Offer cancelled" });
    } catch (e) {
      toast({ title: "Could not cancel", description: e instanceof Error ? e.message : "Please try again", variant: "destructive" });
    } finally { setCancelling(false); }
  };

  // Buyer accepts the seller's counter-offer
  const handleAcceptCounter = async () => {
    if (!offer || accepting) return;
    setAccepting(true);
    try {
      const res = await jsonFetch<{ offer: ApiOffer }>(`/api/offers/${offer.id}/buyer-accept`, { method: "PATCH" });
      setOffer(res.offer);
      toast({ title: "Counter accepted", description: "The seller's price has been accepted. You can now proceed to purchase." });
    } catch (e) {
      toast({ title: "Could not accept counter", description: e instanceof Error ? e.message : "Please try again", variant: "destructive" });
    } finally { setAccepting(false); }
  };

  // Buyer counters the seller's counter-offer
  const handleBuyerCounter = async (amount: number, message: string) => {
    if (!offer) return;
    setCounterSubmitting(true);
    try {
      const res = await jsonFetch<{ offer: ApiOffer }>(`/api/offers/${offer.id}/buyer-counter`, {
        method: "PATCH",
        body: JSON.stringify({ amount, message: message || undefined }),
      });
      setOffer(res.offer);
      setCounterOpen(false);
      toast({ title: "Counter offer sent", description: "The seller has been notified." });
    } catch (e) {
      toast({ title: "Could not send counter", description: e instanceof Error ? e.message : "Please try again", variant: "destructive" });
    } finally { setCounterSubmitting(false); }
  };

  const features = useMemo(() => (listing ? bucketFeatures(listing.features) : null), [listing]);

  const statusColor: Record<string, string> = {
    Accepted: "bg-primary/10 text-primary",
    Completed: "bg-primary/10 text-primary",
    Countered: "bg-amber-100 text-amber-700",
    Pending: "bg-amber-100 text-amber-700",
    Rejected: "bg-red-100 text-red-600",
    Cancelled: "bg-gray-100 text-gray-600",
  };

  if (!offer && !error) {
    return (
      <DashboardLayout user={user} navItems={buyerNav} title="Offer Detail" onLogout={handleLogout}>
        <div className="py-16 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !offer) {
    return (
      <DashboardLayout user={user} navItems={buyerNav} title="Offer Detail" onLogout={handleLogout}>
        <div className="py-16 text-center text-sm text-red-500">{error ?? "Offer not found."}</div>
      </DashboardLayout>
    );
  }

  const status = uiStatus(offer.status);
  const carHeader = `${offer.listingMake ?? ""} ${offer.listingModel ?? ""}, ${offer.listingYear ?? ""}`.trim();
  const sellerNameFromOffer = offerSellerName(offer);
  const sellerName = sellerNameFromOffer !== "—"
    ? sellerNameFromOffer
    : (listing?.sellerName ?? "—");
  const listingPrice = offer.listingPrice ?? listing?.listing.price ?? null;

  // The canonical "agreed" amount — after buyer-accept, `amount` is normalised
  // to the counter price. For a direct seller-accept, `amount` is the buyer's
  // original offer. Either way, `amount` is always the right purchase price.
  const agreedAmount = offer.amount;
  const sellerCounterAmount = offer.counterAmount;
  const isEscrowed = purchaseStatus === "pending" || purchaseStatus === "in_escrow";
  const isPaid = purchaseStatus === "completed";
  const canPurchaseNow = status === "Accepted" && !isEscrowed && !isPaid;

  return (
    <DashboardLayout user={user} navItems={buyerNav} title="Offer Detail" onLogout={handleLogout}>
      <div className="mb-3">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">Inspection , Offers , Purchases</h1>
      </div>

      <button
        onClick={() => setLocation("/dashboard/activity")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary transition-colors mb-4"
        data-testid="button-back"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Offer for {carHeader}</h2>

      {/* Meta strip – row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4 mb-4">
        <MetaCol
          label="Car Details"
          value={
            <span className="flex items-center gap-2 flex-wrap">
              {carHeader}
              <button
                onClick={() => setLocation(`/cars/${offer.listingId}-${generateSlug(carHeader)}`)}
                className="rounded-full border border-primary px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/5 whitespace-nowrap"
                data-testid="button-view-car"
              >
                View Car Details
              </button>
            </span>
          }
          className="col-span-2 sm:col-span-1"
        />
        <MetaCol label="Seller's Name:" value={sellerName} />
        <MetaCol label="Offer Amount" value={formatNaira(agreedAmount)} />
        <MetaCol label="Offer Date" value={formatDate(offer.createdAt)} />
        <MetaCol label="Listing Price" value={listingPrice !== null ? formatNaira(listingPrice) : "—"} />
        <MetaCol
          label="Offer Status"
          value={
            <span className={cn("inline-block rounded-full px-3 py-0.5 text-xs font-semibold", statusColor[status])}>
              {status}
            </span>
          }
        />
      </div>

      {/* Seller counter strip — shown whenever the seller has an active counter */}
      {sellerCounterAmount !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4 mb-5">
          <MetaCol label="Seller's Counter Amount" value={formatNaira(sellerCounterAmount)} />
          <MetaCol label="Seller's Counter Date" value={formatDate(offer.updatedAt)} />
          <MetaCol label="Seller's Name:" value={sellerName} />
          <MetaCol label="Listing Price" value={listingPrice !== null ? formatNaira(listingPrice) : "—"} />
        </div>
      )}

      {/* Contextual hint when seller has countered */}
      {status === "Countered" && (
        <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          The seller has countered with <strong>{sellerCounterAmount != null ? formatNaira(sellerCounterAmount) : "a new price"}</strong>.
          You can accept it, counter back, or cancel your offer.
        </div>
      )}

      {offer.buyerMessage && (
        <div className="mb-5"><MetaCol label="Your message" value={offer.buyerMessage} /></div>
      )}
      {offer.sellerMessage && (
        <div className="mb-5"><MetaCol label="Seller's reply" value={offer.sellerMessage} /></div>
      )}

      <Separator className="mb-6" />

      {/* Car Overview */}
      <h3 className="text-sm font-bold text-gray-900 mb-3">Car Overview</h3>
      {!listing ? (
        <div className="py-8 flex items-center justify-center text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 mb-6">
            <div>
              <SpecRow icon={CarFront}  label="Car Type"     value={listing.listing.carType ?? "—"} />
              <SpecRow icon={Gauge}     label="Mileage"      value={`${listing.listing.mileage.toLocaleString()} km`} />
              <SpecRow icon={Fuel}      label="Fuel Type"    value={listing.listing.fuelType ?? "—"} />
              <SpecRow icon={Calendar}  label="Year"         value={String(listing.listing.year)} />
              <SpecRow icon={Settings2} label="Transmission" value={listing.listing.transmission ?? "—"} />
              <SpecRow icon={Cog}       label="Drive Type"   value={listing.listing.driveType ?? "—"} />
            </div>
            <div>
              <SpecRow icon={CarFront} label="Condition" value={listing.listing.condition} />
              <SpecRow icon={DoorOpen} label="Doors"     value={listing.listing.doors ? `${listing.listing.doors} Doors` : "—"} />
              <SpecRow icon={Palette}  label="Color"     value={listing.listing.color ?? "—"} />
              <SpecRow icon={Hash}     label="VIN"       value={listing.listing.vin ?? "—"} />
            </div>
          </div>

          <h3 className="text-sm font-bold text-gray-900 mb-4">Features</h3>
          {features && (features.interior.length + features.safety.length + features.exterior.length + features.comfort.length > 0) ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
              {(["interior", "safety", "exterior", "comfort"] as const).map((g) => (
                <div key={g}>
                  <div className="text-xs font-bold text-gray-800 mb-2 capitalize">
                    {g === "comfort" ? "Comfort & Convenience" : g}
                  </div>
                  <ul className="space-y-0.5">
                    {features[g].length === 0
                      ? <li className="text-xs text-gray-400">—</li>
                      : features[g].map((f) => <FeatureItem key={f} text={f} />)}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-8">No features listed.</p>
          )}
        </>
      )}

      {/* ── Action buttons ──────────────────────────────────────────────────
          Layout mirrors the reference design: up to 3 buttons side-by-side.
          Which buttons are active/disabled depends on the current offer state.
      ────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">

        {/* "Purchase Now" — only when the offer is accepted */}
        <button
          onClick={() => {
            if (canPurchaseNow) setPaymentOpen(true);
          }}
          disabled={!canPurchaseNow}
          className={cn(
            "rounded-full px-5 py-2.5 text-sm font-semibold transition-colors",
            canPurchaseNow
              ? "bg-primary text-white hover:bg-primary/90"
              : isEscrowed
                ? "bg-amber-100 text-amber-800 cursor-not-allowed"
                : isPaid
                  ? "bg-green-100 text-green-800 cursor-not-allowed"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed",
          )}
          data-testid="button-purchase"
        >
          {isEscrowed ? "In-Escrow" : isPaid ? "Paid" : "Purchase Now"}
        </button>

        {/* "Accept Counter Offer" — only when status=Countered */}
        {status === "Countered" && (
          <button
            onClick={handleAcceptCounter}
            disabled={accepting}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            data-testid="button-accept-counter"
          >
            {accepting ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Accept Counter Offer"}
          </button>
        )}

        {/* "Cancel Offer" — active when pending or countered */}
        <button
          onClick={handleCancel}
          disabled={cancelling || (status !== "Pending" && status !== "Countered")}
          className={cn(
            "rounded-full px-5 py-2.5 text-sm font-semibold transition-colors",
            status === "Pending" || status === "Countered"
              ? "bg-[#F5C0AE] text-white hover:bg-[#EFB099] disabled:opacity-60"
              : "bg-[#F5C0AE]/40 text-white/60 cursor-not-allowed",
          )}
          data-testid="button-cancel-offer"
        >
          {cancelling ? "Cancelling…" : "Cancel Offer"}
        </button>

        {/* "Counter Back" — shown when status=Countered */}
        {status === "Countered" && (
          <button
            onClick={() => setCounterOpen(true)}
            className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            data-testid="button-counter-back"
          >
            Counter Back
          </button>
        )}

        {/* "Make New Offer" — shown when offer is done (rejected/cancelled) or as an option on accepted */}
        <button
          onClick={() => setNewOfferOpen(true)}
          disabled={status === "Pending" || status === "Countered" || status === "Accepted"}
          className={cn(
            "rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors",
            status !== "Pending" && status !== "Countered" && status !== "Accepted"
              ? "border-gray-300 text-gray-600 hover:bg-gray-50"
              : "border-gray-200 text-gray-300 cursor-not-allowed",
          )}
          data-testid="button-make-new-offer"
        >
          Make New Offer
        </button>

      </div>

      {/* Dialogs */}
      <PaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        amount={agreedAmount}
        carMake={`${carHeader} (${sellerName})`}
        walletBalance={wallet}
        purpose="listing_purchase"
        listingId={offer.listingId}
      />
      <NewOfferDialog
        open={newOfferOpen}
        onClose={() => setNewOfferOpen(false)}
        listingId={offer.listingId}
        onCreated={(newId) => setLocation(`/dashboard/activity/offer/${newId}`)}
      />
      <CounterOfferDialog
        open={counterOpen}
        onClose={() => (counterSubmitting ? null : setCounterOpen(false))}
        onConfirm={handleBuyerCounter}
        submitting={counterSubmitting}
        initialAmount={sellerCounterAmount ?? agreedAmount}
      />
    </DashboardLayout>
  );
}
