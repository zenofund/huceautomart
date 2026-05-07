import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import {
  Home,
  ClipboardList,
  Heart,
  Car,
  MessageSquare,
  Wallet,
  HeadphonesIcon,
  UserRound,
  Search,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardNavItem,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { ConfirmPurchaseDialog } from "@/components/dialogs/confirm-purchase-dialog";
import { FeedbackDialog } from "@/components/dialogs/feedback-dialog";
import { ReceiptDialog } from "@/components/dialogs/receipt-dialog";
import { TextPromptDialog } from "@/components/dialogs/text-prompt-dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

const buyerNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  {
    href: "/dashboard/activity",
    label: "Inspection / Offers / Purchases",
    icon: ClipboardList,
  },
  { href: "/dashboard/saved", label: "Saved Car", icon: Heart },
  { href: "/dashboard/history", label: "Viewed Car History", icon: Car },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/support", label: "Customer Support", icon: HeadphonesIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

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

// ─── UI types ────────────────────────────────────────────────────────────────
type Status = "Completed" | "Pending" | "Rejected" | "Accepted";

interface InspectionRow {
  id: string;
  listingId: number;
  carMake: string;
  sellerName: string;
  amount: number;
  result: number | null;
  scheduledAt: string;
  status: Status;
}

interface OfferRow {
  id: string;
  listingId: number;
  carMake: string;
  sellerName: string;
  offerAmount: number;
  offerDate: string;
  inspectionStatus: { done: boolean; passed: number | null };
  purchaseStatus: ApiPurchase["paymentStatus"] | null;
  status: Status;
}

type PurchaseStatus = "In-Escrow" | "Paid" | "Failed" | "Refunded";

interface PurchaseRow {
  id: string;
  carMake: string;
  sellerName: string;
  sellerInvoiceName: string;
  sellerInvoiceType: "Business" | null;
  amount: number;
  purchasedAt: string;
  status: PurchaseStatus;
  receiptNumber: string | null;
  hasReview: boolean;
}

// ─── Server response shapes ─────────────────────────────────────────────────
interface ApiInspection {
  id: number;
  status: "pending" | "assigned" | "active" | "completed" | "cancelled";
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  fee: number;
  type: string | null;
  inspectorName: string | null;
  listingId: number;
  carDetails: string;
  resultPercent: number | null;
}

interface ApiOffer {
  id: number;
  listingId: number;
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
  createdAt: string;
  listingMake: string | null;
  listingModel: string | null;
  listingYear: number | null;
  sellerFirstName: string | null;
  sellerLastName: string | null;
  sellerBusinessName: string | null;
}

interface ApiPurchase {
  id: number;
  offerId: number | null;
  listingId: number;
  amount: number;
  paymentMethod: string | null;
  paymentStatus: "pending" | "in_escrow" | "completed" | "failed" | "refunded";
  receiptNumber: string | null;
  createdAt: string;
  carDetails: string;
  sellerName: string;
  sellerAccountType?: "individual" | "company" | null;
  sellerBusinessName?: string | null;
  sellerLotName?: string | null;
  sellerFirstName?: string | null;
  sellerLastName?: string | null;
  hasReview?: boolean;
}

// ─── Status mappers ──────────────────────────────────────────────────────────
function mapInspectionStatus(s: ApiInspection["status"]): Status {
  if (s === "completed") return "Completed";
  if (s === "cancelled") return "Rejected";
  return "Pending";
}
function mapOfferStatus(s: ApiOffer["status"]): Status {
  if (s === "accepted") return "Accepted";
  if (s === "completed") return "Completed";
  if (s === "declined" || s === "cancelled" || s === "expired")
    return "Rejected";
  return "Pending";
}
function mapPaymentStatus(s: ApiPurchase["paymentStatus"]): PurchaseStatus {
  if (s === "completed") return "Paid";
  if (s === "failed") return "Failed";
  if (s === "refunded") return "Refunded";
  return "In-Escrow";
}

// ─── Format helpers ──────────────────────────────────────────────────────────
function formatNaira(n: number) {
  return `\u20A6 ${Math.round(n).toLocaleString()}.00`;
}
function formatDateTime(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
function offerSellerName(o: ApiOffer): string {
  if (o.sellerBusinessName) return o.sellerBusinessName;
  return `${o.sellerFirstName ?? ""} ${o.sellerLastName ?? ""}`.trim() || "—";
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { dot: string; text: string }> = {
    Completed: { dot: "bg-green-500", text: "text-green-700" },
    Pending: { dot: "bg-amber-500", text: "text-amber-700" },
    Rejected: { dot: "bg-red-500", text: "text-red-700" },
    Accepted: { dot: "bg-green-500", text: "text-green-700" },
  };
  const c = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", c.text)}>
      <span className={cn("h-2 w-2 rounded-full", c.dot)} />
      {status}
    </span>
  );
}

function resultColor(result: number) {
  if (result >= 70) return "text-green-600";
  if (result >= 50) return "text-amber-600";
  return "text-red-500";
}

const PAGE_SIZE = 4;

function TablePagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const pages: (number | "...")[] = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const arr: (number | "...")[] = [1, 2, 3];
    if (page > 4) arr.push("...");
    if (page > 3 && page < totalPages - 2) arr.push(page);
    if (page < totalPages - 3) arr.push("...");
    for (let i = Math.max(totalPages - 2, 4); i <= totalPages; i++) arr.push(i);
    return Array.from(new Set(arr)) as (number | "...")[];
  }, [page, totalPages]);

  return (
    <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="rounded-lg w-full sm:w-auto"
        data-testid="button-prev-page"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
      </Button>
      <div className="flex items-center gap-1">
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e-${i}`} className="px-2 text-sm text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={cn(
                "h-8 min-w-8 px-2 rounded-md text-sm font-medium transition-colors",
                p === page
                  ? "bg-primary/10 text-primary"
                  : "text-gray-600 hover:bg-gray-100",
              )}
              data-testid={`button-page-${p}`}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="rounded-lg w-full sm:w-auto"
        data-testid="button-next-page"
      >
        Next <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  search,
  onSearchChange,
}: {
  title: string;
  count: number;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mb-5">
      <h3 className="text-lg sm:text-xl font-bold text-gray-900 shrink-0">
        {title}({count})
      </h3>
      <div className="relative sm:max-w-md sm:flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search here..."
          className="pl-9 h-10 rounded-full border-gray-200 bg-white"
          data-testid="input-search"
        />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center text-sm text-gray-400">{message}</div>
  );
}

function LoadingState() {
  return (
    <div className="py-16 flex items-center justify-center text-gray-400">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

// ── Inspection tab ────────────────────────────────────────────────────────
function InspectionTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [, navigate] = useLocation();
  const [items, setItems] = useState<InspectionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await jsonFetch<{ items: ApiInspection[] }>(
          "/api/buyer/inspections?pageSize=50",
        );
        if (cancelled) return;
        setItems(
          data.items.map((r) => ({
            id: String(r.id),
            listingId: r.listingId,
            carMake: r.carDetails,
            sellerName: r.inspectorName ?? "Awaiting assignment",
            amount: r.fee,
            result: r.resultPercent,
            scheduledAt: formatDateTime(r.scheduledAt ?? r.createdAt),
            status: mapInspectionStatus(r.status),
          })),
        );
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (items ?? []).filter(
    (r) =>
      r.carMake.toLowerCase().includes(search.toLowerCase()) ||
      r.sellerName.toLowerCase().includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <SectionHeader
        title="Inspection"
        count={items?.length ?? 0}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />

      {items === null && !error && <LoadingState />}
      {error && <EmptyState message={error} />}
      {items !== null && !error && filtered.length === 0 && (
        <EmptyState message="No inspections yet." />
      )}

      {items !== null && !error && filtered.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100">
                  <TableHead className="text-xs font-medium text-gray-400">Inspect ID</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Car Make</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Seller / Inspector</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Inspection Amount</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Inspection Result</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Scheduled Time / Date</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => navigate(`/dashboard/activity/inspection/${r.id}`)}
                    data-testid={`row-inspection-${r.id}`}
                  >
                    <TableCell className="text-sm text-gray-500">{r.id}</TableCell>
                    <TableCell className="text-sm font-medium text-primary underline underline-offset-2">{r.carMake}</TableCell>
                    <TableCell className="text-sm text-gray-700">{r.sellerName}</TableCell>
                    <TableCell className="text-sm text-gray-700">{formatNaira(r.amount)}</TableCell>
                    <TableCell className="text-sm">
                      {r.result === null ? (
                        <span className="text-gray-400">----</span>
                      ) : (
                        <span className={cn("font-semibold", resultColor(r.result))}>{r.result} %</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">{r.scheduledAt}</TableCell>
                    <TableCell>
                      <StatusPill status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-gray-200 bg-white p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
                onClick={() => navigate(`/dashboard/activity/inspection/${r.id}`)}
                data-testid={`card-inspection-${r.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-medium text-gray-400">
                      Inspect ID #{r.id}
                    </div>
                    <div className="text-sm font-semibold text-primary underline underline-offset-2 mt-0.5">
                      {r.carMake}
                    </div>
                    <div className="text-xs text-gray-500">{r.sellerName}</div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-gray-400">Amount</div>
                    <div className="text-gray-900 font-medium">{formatNaira(r.amount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Result</div>
                    <div className="font-semibold">
                      {r.result === null ? (
                        <span className="text-gray-400">----</span>
                      ) : (
                        <span className={resultColor(r.result)}>{r.result} %</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-gray-400">Scheduled</div>
                    <div className="text-gray-900">{r.scheduledAt}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <TablePagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ── Offers tab ────────────────────────────────────────────────────────────
function InspectionBadge({ s }: { s: OfferRow["inspectionStatus"] }) {
  if (!s.done) return <span className="text-sm text-gray-400">------</span>;
  const pct = s.passed ?? 0;
  const color = pct >= 50 ? "text-green-600" : "text-red-500";
  return (
    <span className="text-sm text-gray-700">
      Done <span className={cn("font-semibold", color)}>({pct}% Passed)</span>
    </span>
  );
}

function ActionBtn({
  status,
  purchaseStatus,
  onClick,
}: {
  status: Status;
  purchaseStatus: ApiPurchase["paymentStatus"] | null;
  onClick: () => void;
}) {
  if (status === "Accepted") {
    if (purchaseStatus === "pending" || purchaseStatus === "in_escrow") {
      return (
        <button
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap cursor-default"
        >
          In-Escrow
        </button>
      );
    }
    if (purchaseStatus === "completed") {
      return (
        <button
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800 whitespace-nowrap cursor-default"
        >
          Paid
        </button>
      );
    }
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors whitespace-nowrap"
      >
        Purchase Now
      </button>
    );
  }
  if (status === "Rejected") {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors whitespace-nowrap"
      >
        Declined Offer
      </button>
    );
  }
  return null;
}

function OffersTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [, navigate] = useLocation();
  const [items, setItems] = useState<OfferRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Pull offers and inspections in parallel; we cross-reference inspections
        // by listingId so the offers row can show "inspection done / passed".
        const [offersRes, inspectionsRes, purchasesRes] = await Promise.all([
          jsonFetch<{ offers: ApiOffer[] }>("/api/offers/me"),
          jsonFetch<{ items: ApiInspection[] }>(
            "/api/buyer/inspections?pageSize=50",
          ),
          jsonFetch<{ items: ApiPurchase[] }>("/api/buyer/purchases?pageSize=50"),
        ]);
        if (cancelled) return;

        // Index the most recent completed inspection per listingId.
        const inspByListing = new Map<
          number,
          { done: boolean; passed: number | null }
        >();
        for (const it of inspectionsRes.items) {
          if (it.status === "completed") {
            inspByListing.set(it.listingId, {
              done: true,
              passed: it.resultPercent,
            });
          } else if (!inspByListing.has(it.listingId)) {
            inspByListing.set(it.listingId, { done: false, passed: null });
          }
        }

        // Index latest purchase payment status by offerId so accepted offers
        // can show escrow/paid state instead of re-enabling purchase.
        const purchaseStatusByOffer = new Map<number, ApiPurchase["paymentStatus"]>();
        for (const p of purchasesRes.items) {
          if (p.offerId && !purchaseStatusByOffer.has(p.offerId)) {
            purchaseStatusByOffer.set(p.offerId, p.paymentStatus);
          }
        }

        setItems(
          offersRes.offers.map((o) => ({
            id: String(o.id),
            listingId: o.listingId,
            carMake: `${o.listingMake ?? ""} ${o.listingModel ?? ""} ${o.listingYear ?? ""}`.trim(),
            sellerName: offerSellerName(o),
            offerAmount: o.counterAmount ?? o.amount,
            offerDate: formatDateTime(o.createdAt),
            inspectionStatus: inspByListing.get(o.listingId) ?? {
              done: false,
              passed: null,
            },
            purchaseStatus: purchaseStatusByOffer.get(o.id) ?? null,
            status: mapOfferStatus(o.status),
          })),
        );
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (items ?? []).filter(
    (r) =>
      r.carMake.toLowerCase().includes(search.toLowerCase()) ||
      r.sellerName.toLowerCase().includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goDetail = (id: string) => navigate(`/dashboard/activity/offer/${id}`);

  return (
    <div>
      <SectionHeader
        title="Offers"
        count={items?.length ?? 0}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
      />

      {items === null && !error && <LoadingState />}
      {error && <EmptyState message={error} />}
      {items !== null && !error && filtered.length === 0 && (
        <EmptyState message="No offers yet." />
      )}

      {items !== null && !error && filtered.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100">
                  <TableHead className="text-xs font-medium text-gray-400 whitespace-nowrap">Offer ID</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Car Make</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Seller Name</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Offer Amount</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Offer Date</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Inspection Status</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => goDetail(r.id)}
                    data-testid={`row-offer-${r.id}`}
                  >
                    <TableCell className="text-sm text-gray-500">{r.id}</TableCell>
                    <TableCell className="text-sm font-medium text-primary underline underline-offset-2">{r.carMake}</TableCell>
                    <TableCell className="text-sm text-gray-700">{r.sellerName}</TableCell>
                    <TableCell className="text-sm text-gray-700">{formatNaira(r.offerAmount)}</TableCell>
                    <TableCell className="text-sm text-gray-700">{r.offerDate}</TableCell>
                    <TableCell><InspectionBadge s={r.inspectionStatus} /></TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell><ActionBtn status={r.status} purchaseStatus={r.purchaseStatus} onClick={() => goDetail(r.id)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-gray-200 bg-white p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
                onClick={() => goDetail(r.id)}
                data-testid={`card-offer-${r.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-medium text-gray-400">Offer ID #{r.id}</div>
                    <div className="text-sm font-semibold text-primary underline underline-offset-2 mt-0.5">{r.carMake}</div>
                    <div className="text-xs text-gray-500">{r.sellerName}</div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <div className="text-gray-400">Offer Amount</div>
                    <div className="text-gray-900 font-medium">{formatNaira(r.offerAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Offer Date</div>
                    <div className="text-gray-900">{r.offerDate}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-gray-400">Inspection</div>
                    <InspectionBadge s={r.inspectionStatus} />
                  </div>
                </div>
                <ActionBtn status={r.status} purchaseStatus={r.purchaseStatus} onClick={() => goDetail(r.id)} />
              </div>
            ))}
          </div>

          <TablePagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ── Purchases tab ─────────────────────────────────────────────────────────
function PurchaseStatusPill({ status }: { status: PurchaseStatus }) {
  const dotColor: Record<PurchaseStatus, string> = {
    Paid: "bg-green-500",
    "In-Escrow": "bg-amber-500",
    Failed: "bg-red-500",
    Refunded: "bg-gray-400",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
      <span className={cn("h-2 w-2 rounded-full", dotColor[status])} />
      {status}
    </span>
  );
}

function PurchasesTab({
  buyerName,
  buyerEmail,
}: {
  buyerName: string;
  buyerEmail: string;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [confirmRow, setConfirmRow] = useState<PurchaseRow | null>(null);
  const [disputePromptOpen, setDisputePromptOpen] = useState(false);
  const [feedbackRow, setFeedbackRow] = useState<PurchaseRow | null>(null);
  const [receiptRow, setReceiptRow] = useState<PurchaseRow | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await jsonFetch<{ items: ApiPurchase[] }>(
          "/api/buyer/purchases?pageSize=50",
        );
        if (cancelled) return;
        setPurchases(
          data.items.map((p) => {
            const businessLabel = [p.sellerBusinessName, p.sellerLotName]
              .filter(Boolean)
              .join(" / ");
            const individualName =
              `${p.sellerFirstName ?? ""} ${p.sellerLastName ?? ""}`.trim();
            const sellerInvoiceName =
              p.sellerAccountType === "company"
                ? businessLabel || individualName || p.sellerName
                : individualName || p.sellerName || businessLabel;
            return {
              id: String(p.id),
              carMake: p.carDetails,
              sellerName: p.sellerName,
              sellerInvoiceName,
              sellerInvoiceType:
                p.sellerAccountType === "company" ? "Business" : null,
              amount: p.amount,
              purchasedAt: formatDateTime(p.createdAt),
              status: mapPaymentStatus(p.paymentStatus),
              receiptNumber: p.receiptNumber,
              hasReview: Boolean(p.hasReview),
            };
          }),
        );
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (purchases ?? []).filter(
    (r) =>
      r.carMake.toLowerCase().includes(search.toLowerCase()) ||
      r.sellerName.toLowerCase().includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updatePurchaseStatus = (id: string, status: PurchaseStatus) => {
    setPurchases((prev) =>
      prev
        ? prev.map((p) => (p.id === id ? { ...p, status } : p))
        : prev,
    );
  };
  const markReviewed = (id: string) => {
    setPurchases((prev) =>
      prev ? prev.map((p) => (p.id === id ? { ...p, hasReview: true } : p)) : prev,
    );
  };

  const handleConfirmPurchase = async () => {
    if (!confirmRow) return;
    const targetRow = confirmRow;
    setActioningId(confirmRow.id);
    try {
      const res = await jsonFetch<{ purchase: unknown; reviewRequired?: boolean }>(
        `/api/buyer/purchases/${confirmRow.id}/confirm`,
        {
          method: "PATCH",
        },
      );
      updatePurchaseStatus(confirmRow.id, "Paid");
      setConfirmRow(null);
      if (res.reviewRequired && !targetRow.hasReview) {
        setFeedbackRow({ ...targetRow, status: "Paid" });
      }
    } catch (e) {
      toast({
        title: "Purchase confirmation failed",
        description: e instanceof Error ? e.message : "Failed to confirm purchase",
        variant: "destructive",
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleSubmitReview = async (rating: number, comment: string) => {
    if (!feedbackRow) return;
    setActioningId(feedbackRow.id);
    try {
      await jsonFetch<{ review: unknown }>(`/api/buyer/purchases/${feedbackRow.id}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, comment }),
      });
      markReviewed(feedbackRow.id);
      setFeedbackRow(null);
    } catch (e) {
      toast({
        title: "Review submission failed",
        description: e instanceof Error ? e.message : "Failed to submit review",
        variant: "destructive",
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleCancelPurchase = async () => {
    if (!confirmRow) return;
    setActioningId(confirmRow.id);
    try {
      await jsonFetch<{ purchase: unknown }>(`/api/buyer/purchases/${confirmRow.id}/cancel`, {
        method: "PATCH",
      });
      updatePurchaseStatus(confirmRow.id, "Refunded");
      setConfirmRow(null);
    } catch (e) {
      toast({
        title: "Purchase cancellation failed",
        description: e instanceof Error ? e.message : "Failed to cancel purchase",
        variant: "destructive",
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleRaiseDispute = async (reason: string) => {
    if (!confirmRow) return;
    setActioningId(confirmRow.id);
    try {
      await jsonFetch<{ purchase: unknown }>(`/api/buyer/purchases/${confirmRow.id}/dispute`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      updatePurchaseStatus(confirmRow.id, "In-Escrow");
      setConfirmRow(null);
      setDisputePromptOpen(false);
    } catch (e) {
      toast({
        title: "Dispute request failed",
        description: e instanceof Error ? e.message : "Failed to raise dispute",
        variant: "destructive",
      });
    } finally {
      setActioningId(null);
    }
  };

  const buildReceipt = (r: PurchaseRow) => ({
    invoiceNo: r.receiptNumber ?? `H1-${r.id}`,
    seller: {
      name: r.sellerInvoiceName,
      company: r.sellerInvoiceType ?? "",
      phone: "—",
      email: "—",
    },
    middleman: {
      company: "Huce Autos",
      phone: "—",
      email: "support@huceautos.com",
    },
    buyer: { name: buyerName, phone: "—", email: buyerEmail },
    car: {
      make: r.carMake,
      vin: "—",
      mileage: "—",
      condition: "Used",
      purchaseDate: r.purchasedAt,
    },
    summation: { subTotal: r.amount, discount: 0, total: r.amount },
  });

  const RowAction = ({ r }: { r: PurchaseRow }) => {
    const onClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (r.status === "In-Escrow") setConfirmRow(r);
      else setReceiptRow(r);
    };
    return (
      <button
        onClick={onClick}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors whitespace-nowrap"
      >
        {r.status === "In-Escrow" ? "Confirm Purchase" : "Download Receipt"}
      </button>
    );
  };

  return (
    <div>
      <SectionHeader
        title="Purchases"
        count={purchases?.length ?? 0}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
      />

      {purchases === null && !error && <LoadingState />}
      {error && <EmptyState message={error} />}
      {purchases !== null && !error && filtered.length === 0 && (
        <EmptyState message="No purchases yet." />
      )}

      {purchases !== null && !error && filtered.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100">
                  <TableHead className="text-xs font-medium text-gray-400 whitespace-nowrap">Order ID</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Car Make</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Seller Name</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Purchase Amount</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Purchase Date</TableHead>
                  <TableHead className="text-xs font-medium text-gray-400">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="border-gray-100" data-testid={`row-purchase-${r.id}`}>
                    <TableCell className="text-sm text-gray-500">{r.id}</TableCell>
                    <TableCell className="text-sm text-gray-700">{r.carMake}</TableCell>
                    <TableCell className="text-sm text-gray-700">{r.sellerName}</TableCell>
                    <TableCell className="text-sm text-gray-700">{formatNaira(r.amount)}</TableCell>
                    <TableCell className="text-sm text-gray-700">{r.purchasedAt}</TableCell>
                    <TableCell><PurchaseStatusPill status={r.status} /></TableCell>
                    <TableCell><RowAction r={r} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4" data-testid={`card-purchase-${r.id}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-medium text-gray-400">Order ID #{r.id}</div>
                    <div className="text-sm font-semibold text-gray-900 mt-0.5">{r.carMake}</div>
                    <div className="text-xs text-gray-500">{r.sellerName}</div>
                  </div>
                  <PurchaseStatusPill status={r.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <div className="text-gray-400">Purchase Amount</div>
                    <div className="text-gray-900 font-medium">{formatNaira(r.amount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Purchase Date</div>
                    <div className="text-gray-900">{r.purchasedAt}</div>
                  </div>
                </div>
                <RowAction r={r} />
              </div>
            ))}
          </div>

          <TablePagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {/* Dialogs */}
      <ConfirmPurchaseDialog
        open={!!confirmRow}
        onClose={() => {
          setConfirmRow(null);
          setDisputePromptOpen(false);
        }}
        carMake={confirmRow?.carMake.split(" ").slice(0, 2).join(" ") ?? ""}
        onConfirm={handleConfirmPurchase}
        onCancelPurchase={handleCancelPurchase}
        onRaiseDispute={() => setDisputePromptOpen(true)}
        busy={actioningId === confirmRow?.id}
      />
      <TextPromptDialog
        open={disputePromptOpen}
        onClose={() => setDisputePromptOpen(false)}
        title="Raise Dispute"
        description="Provide dispute reason (optional)."
        placeholder="Type reason"
        confirmLabel="Submit Dispute"
        onConfirm={(reason) => {
          void handleRaiseDispute(reason.trim());
        }}
      />
      <FeedbackDialog
        open={!!feedbackRow}
        onClose={() => setFeedbackRow(null)}
        onSubmit={handleSubmitReview}
      />
      {receiptRow && (
        <ReceiptDialog
          open={!!receiptRow}
          onClose={() => setReceiptRow(null)}
          receipt={buildReceipt(receiptRow)}
        />
      )}
    </div>
  );
}

export default function BuyerActivity() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();

  const userName = authUser
    ? `${authUser.firstName} ${authUser.lastName}`.trim()
    : "Buyer";
  const userEmail = authUser?.email ?? "";

  const user: DashboardUser = {
    name: userName,
    email: userEmail,
    verified: authUser?.emailVerified ?? true,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  return (
    <DashboardLayout
      user={user}
      navItems={buyerNav}
      title="Activity"
      onLogout={handleLogout}
    >
      <div className="mb-4">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">
          Inspection , Offers , Purchases
        </h1>
      </div>

      <Tabs defaultValue="inspection" className="w-full">
        <TabsList className="bg-transparent p-0 h-auto border-b border-gray-200 rounded-none w-full justify-start gap-2 sm:gap-6 overflow-x-auto">
          <TabsTrigger
            value="inspection"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 sm:px-2 pb-3 text-sm sm:text-base font-semibold text-gray-500"
            data-testid="tab-inspection"
          >
            Inspection
          </TabsTrigger>
          <TabsTrigger
            value="offers"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 sm:px-2 pb-3 text-sm sm:text-base font-semibold text-gray-500"
            data-testid="tab-offers"
          >
            Offers
          </TabsTrigger>
          <TabsTrigger
            value="purchases"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 sm:px-2 pb-3 text-sm sm:text-base font-semibold text-gray-500"
            data-testid="tab-purchases"
          >
            Purchases
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inspection" className="mt-6">
          <InspectionTab />
        </TabsContent>
        <TabsContent value="offers" className="mt-6">
          <OffersTab />
        </TabsContent>
        <TabsContent value="purchases" className="mt-6">
          <PurchasesTab buyerName={userName} buyerEmail={userEmail} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
