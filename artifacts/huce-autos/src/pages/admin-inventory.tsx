import { useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  ExternalLink,
  ImageOff,
  X,
  Check,
  Upload,
  UserCheck,
  Wand2,
  Star,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ReceiptDialog } from "@/components/dialogs/receipt-dialog";
import { DeleteListingDialog } from "@/components/dialogs/delete-listing-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const API_BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(e.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Tab definition ───────────────────────────────────────────────────────────

const INVENTORY_TABS = [
  { value: "listings", label: "Listings" },
  { value: "offers", label: "Offers" },
  { value: "purchases", label: "Purchases" },
  { value: "inspection", label: "Inspection" },
  { value: "categories", label: "Car Categories" },
  { value: "features", label: "Car Features" },
] as const;

type InventoryTab = (typeof INVENTORY_TABS)[number]["value"];

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatDate(s: string | Date | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return (
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function formatNGN(n: number) {
  return "₦" + Number(n).toLocaleString("en-NG");
}

function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 1) return [1];
  const pages: (number | "…")[] = [];
  let last = 0;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) {
      if (last && i - last > 1) pages.push("…");
      pages.push(i);
      last = i;
    }
  }
  return pages;
}

// ─── Reusable Pagination ──────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Previous
      </button>
      <div className="hidden sm:flex items-center gap-1">
        {buildPages(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span
              key={`e${i}`}
              className="w-8 text-center text-gray-400 text-sm"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p as number)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <span className="sm:hidden text-sm text-gray-500">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        Next <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Reusable search + filter header ─────────────────────────────────────────

function TabHeader({
  title,
  search,
  onSearch,
  filterContent,
  filterActive,
  extra,
}: {
  title: string;
  search: string;
  onSearch: (v: string) => void;
  filterContent?: React.ReactNode;
  filterActive?: boolean;
  extra?: React.ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <h1 className="text-xl font-bold text-gray-900 shrink-0">{title}</h1>
      <div className="relative flex-1 min-w-[180px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search here..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        {extra}
        {filterContent && (
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 text-sm border px-3 py-2 rounded-lg transition-colors",
                  filterActive
                    ? "border-primary text-primary bg-primary/5"
                    : "text-gray-500 border-gray-200 bg-white hover:bg-gray-50",
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-2 rounded-xl">
              {filterContent}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTINGS TAB
// ─────────────────────────────────────────────────────────────────────────────

interface ListingRow {
  id: number;
  make: string;
  model: string;
  year: number;
  price: number;
  status: string;
  viewCount: number;
  createdAt: string;
}

function ListingsTab() {
  const [, navigate] = useLocation();
  const [activeStatus, setActiveStatus] = useState<"active" | "sold">("active");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout(
      (window as unknown as { _listSt?: ReturnType<typeof setTimeout> })._listSt,
    );
    (window as unknown as { _listSt?: ReturnType<typeof setTimeout> })._listSt =
      setTimeout(() => {
        setDebouncedSearch(v);
        setPage(1);
      }, 300);
  }, []);

  const { data, isLoading } = useQuery<{
    items: ListingRow[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["admin-listings", activeStatus, debouncedSearch, page],
    queryFn: () =>
      fetchJSON(
        `/admin/listings?status=${activeStatus}&search=${encodeURIComponent(debouncedSearch)}&page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-5 border-b border-gray-100 pb-5 -mx-4 sm:-mx-6 px-4 sm:px-6 -mt-4 sm:-mt-6 pt-4 sm:pt-6">
        <h1 className="text-lg font-black text-gray-900 shrink-0">
          Listings <span className="text-gray-400 font-normal">({data?.total ?? "…"})</span>
        </h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search here..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/admin/inventory/delete-requests")}
              className="flex-1 sm:flex-none bg-primary text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              Delete Listing Request
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filter
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-36 p-2">
                {(["active", "sold"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setActiveStatus(s);
                      setPage(1);
                    }}
                    className={`flex items-center gap-2 w-full text-sm px-2 py-1.5 rounded transition-colors ${
                      activeStatus === s
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${s === "active" ? "bg-green-500" : "bg-red-500"}`}
                    />
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="flex gap-6 border-b border-gray-200 mb-5">
        {(["active", "sold"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setActiveStatus(s);
              setPage(1);
            }}
            className={`pb-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeStatus === s
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-left">
              {["ID", "Car Make", "Car Model", "Year", "Amount", "Upload Date", "View", "Status"].map(
                (h) => (
                  <th
                    key={h}
                    className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-4 pr-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : data?.items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/inventory/${row.id}`)}
                  >
                    <td className="py-4 pr-4 font-semibold text-gray-900">
                      {String(row.id).padStart(2, "0")}
                    </td>
                    <td className="py-4 pr-4 font-semibold text-gray-900">{row.make}</td>
                    <td className="py-4 pr-4 text-gray-700">{row.model || "—"}</td>
                    <td className="py-4 pr-4 text-gray-700">{row.year}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatNGN(row.price)}</td>
                    <td className="py-4 pr-4 text-gray-600 whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="py-4 pr-4 text-gray-600">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5 text-gray-400" />
                        {row.viewCount}
                      </span>
                    </td>
                    <td className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                          row.status === "active"
                            ? "text-green-700"
                            : "text-red-600"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${row.status === "active" ? "bg-green-500" : "bg-red-500"}`}
                        />
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-gray-400 text-sm">
                  No listings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFERS TAB
// ─────────────────────────────────────────────────────────────────────────────

type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "countered"
  | "completed"
  | "expired"
  | "cancelled";

const OFFER_STATUS_META: Record<
  OfferStatus,
  { label: string; dot: string; text: string }
> = {
  accepted:  { label: "Accepted",  dot: "bg-emerald-500", text: "text-emerald-700" },
  pending:   { label: "Pending",   dot: "bg-amber-400",   text: "text-amber-700"  },
  declined:  { label: "Declined",  dot: "bg-red-500",     text: "text-red-700"    },
  countered: { label: "Countered", dot: "bg-blue-500",    text: "text-blue-700"   },
  completed: { label: "Completed", dot: "bg-primary",     text: "text-primary"    },
  expired:   { label: "Expired",   dot: "bg-gray-400",    text: "text-gray-600"   },
  cancelled: { label: "Cancelled", dot: "bg-red-400",     text: "text-red-600"    },
};

const OFFER_FILTER_OPTIONS: { value: OfferStatus | ""; label: string; dot: string }[] = [
  { value: "",          label: "All",       dot: "bg-gray-300"    },
  { value: "accepted",  label: "Accepted",  dot: "bg-emerald-500" },
  { value: "pending",   label: "Pending",   dot: "bg-amber-400"   },
  { value: "cancelled", label: "Cancelled", dot: "bg-red-400"     },
  { value: "declined",  label: "Declined",  dot: "bg-red-500"     },
  { value: "completed", label: "Completed", dot: "bg-primary"     },
  { value: "countered", label: "Countered", dot: "bg-blue-500"    },
  { value: "expired",   label: "Expired",   dot: "bg-gray-400"    },
];

interface OfferRow {
  id: number;
  listingId: number;
  make: string;
  model: string;
  year: number;
  sellerName: string;
  amount: number;
  offerCount: number;
  inspectionStatus: string | null;
  inspectionPassRate: number | null;
  status: OfferStatus;
  createdAt: string;
}

function OffersTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OfferStatus | "">("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout(
      (window as unknown as { _offerSt?: ReturnType<typeof setTimeout> })._offerSt,
    );
    (window as unknown as { _offerSt?: ReturnType<typeof setTimeout> })._offerSt =
      setTimeout(() => {
        setDebouncedSearch(v);
        setPage(1);
      }, 300);
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter) p.set("status", statusFilter);
    return p.toString();
  }, [page, debouncedSearch, statusFilter]);

  const { data, isLoading, isPlaceholderData } = useQuery<{
    items: OfferRow[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>({
    queryKey: ["admin-offers", params],
    queryFn: () => fetchJSON(`/admin/offers?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <TabHeader
        title={`Offers (${data?.pagination.total ?? "…"})`}
        search={search}
        onSearch={handleSearch}
        filterActive={!!statusFilter}
        filterContent={
          <div className="space-y-0.5">
            {OFFER_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setStatusFilter(opt.value);
                  setPage(1);
                }}
                className={cn(
                  "w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors",
                  statusFilter === opt.value
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-gray-50 text-gray-700",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", opt.dot)} />
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left">
              {["TXN ID", "Car Make", "Seller Name", "Amount", "Offer Request", "Inspection Status", "Status"].map(
                (h) => (
                  <th key={h} className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="py-4 pr-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : data?.items.map((row) => {
                  const meta =
                    OFFER_STATUS_META[row.status] ?? {
                      label: row.status,
                      dot: "bg-gray-400",
                      text: "text-gray-600",
                    };
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-gray-100 transition-colors",
                        isPlaceholderData && "opacity-60",
                      )}
                    >
                      <td className="py-4 pr-4 font-semibold italic text-gray-900">
                        {String(row.id).padStart(2, "0")}
                      </td>
                      <td className="py-4 pr-4 font-semibold text-gray-900 whitespace-nowrap">
                        {row.make} {row.model} {row.year}
                      </td>
                      <td className="py-4 pr-4 text-gray-700">{row.sellerName}</td>
                      <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                        {formatNGN(row.amount)}
                      </td>
                      <td className="py-4 pr-4 text-center text-gray-700">
                        {row.offerCount}
                      </td>
                      <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                        {row.inspectionStatus ? (
                          row.inspectionStatus === "completed" ? (
                            <span>
                              Done{" "}
                              {row.inspectionPassRate !== null && (
                                <span className="text-emerald-600 font-medium">
                                  ({row.inspectionPassRate}% Passed)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="capitalize text-gray-600">
                              {row.inspectionStatus}
                            </span>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-4">
                        <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.text)}>
                          <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dot)} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center text-gray-400 text-sm">
                  No offers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={data?.pagination.totalPages ?? 1}
        onPageChange={setPage}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASES TAB
// ─────────────────────────────────────────────────────────────────────────────

type PurchaseStatus = "pending" | "in_escrow" | "completed" | "failed" | "refunded";

const PURCHASE_STATUS_META: Record<PurchaseStatus, { label: string; dot: string; text: string }> = {
  completed: { label: "Paid",      dot: "bg-emerald-500", text: "text-emerald-700" },
  in_escrow: { label: "In-Escrow", dot: "bg-amber-400",   text: "text-amber-700"  },
  pending:   { label: "Pending",   dot: "bg-gray-400",    text: "text-gray-600"   },
  failed:    { label: "Failed",    dot: "bg-red-500",     text: "text-red-700"    },
  refunded:  { label: "Refunded",  dot: "bg-blue-400",    text: "text-blue-700"   },
};

const PURCHASE_FILTER_OPTIONS: { value: PurchaseStatus | ""; label: string; dot: string }[] = [
  { value: "",          label: "All",       dot: "bg-gray-300"    },
  { value: "completed", label: "Paid",      dot: "bg-emerald-500" },
  { value: "in_escrow", label: "In-Escrow", dot: "bg-amber-400"   },
  { value: "pending",   label: "Pending",   dot: "bg-gray-400"    },
  { value: "failed",    label: "Failed",    dot: "bg-red-500"     },
  { value: "refunded",  label: "Refunded",  dot: "bg-blue-400"    },
];

interface PurchaseRow {
  id: number;
  make: string;
  model: string;
  year: number;
  sellerName: string;
  buyerName: string;
  amount: number;
  paymentStatus: PurchaseStatus;
  receiptNumber: string | null;
  createdAt: string;
}

interface ReceiptData {
  id: number;
  invoiceNo: string;
  seller: { name: string; company: string; phone: string; email: string };
  middleman: { company: string; phone: string; email: string };
  buyer: { name: string; phone: string; email: string };
  car: { make: string; vin: string; mileage: string; condition: string; purchaseDate: string; image?: string };
  summation: { subTotal: number; discount: number; total: number };
}

function PurchasesTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | "">("");
  const [page, setPage] = useState(1);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const PAGE_SIZE = 10;

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout(
      (window as unknown as { _purchSt?: ReturnType<typeof setTimeout> })._purchSt,
    );
    (window as unknown as { _purchSt?: ReturnType<typeof setTimeout> })._purchSt =
      setTimeout(() => {
        setDebouncedSearch(v);
        setPage(1);
      }, 300);
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter) p.set("status", statusFilter);
    return p.toString();
  }, [page, debouncedSearch, statusFilter]);

  const { data, isLoading, isPlaceholderData } = useQuery<{
    items: PurchaseRow[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>({
    queryKey: ["admin-purchases", params],
    queryFn: () => fetchJSON(`/admin/purchases?${params}`),
    placeholderData: keepPreviousData,
  });

  const { data: receiptData, isLoading: receiptLoading } = useQuery<ReceiptData>({
    queryKey: ["admin-purchase-receipt", receiptId],
    queryFn: () => fetchJSON<ReceiptData>(`/admin/purchases/${receiptId}`),
    enabled: receiptId !== null,
  });

  return (
    <div>
      <TabHeader
        title={`Purchases (${data?.pagination.total ?? "…"})`}
        search={search}
        onSearch={handleSearch}
        filterActive={!!statusFilter}
        filterContent={
          <div className="space-y-0.5">
            {PURCHASE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setStatusFilter(opt.value);
                  setPage(1);
                }}
                className={cn(
                  "w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors",
                  statusFilter === opt.value
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-gray-50 text-gray-700",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", opt.dot)} />
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="text-left">
              {["TXN ID", "Car Make", "Seller", "Purchase Amount", "Name", "Upload Date", "Status", ""].map(
                (h, i) => (
                  <th key={i} className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide last:pr-0">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-4 pr-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : data?.items.map((row) => {
                  const meta =
                    PURCHASE_STATUS_META[row.paymentStatus] ?? {
                      label: row.paymentStatus,
                      dot: "bg-gray-400",
                      text: "text-gray-600",
                    };
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-gray-100 transition-colors",
                        isPlaceholderData && "opacity-60",
                      )}
                    >
                      <td className="py-4 pr-4 font-semibold italic text-gray-900">
                        {String(row.id).padStart(2, "0")}
                      </td>
                      <td className="py-4 pr-4 font-semibold text-gray-900 whitespace-nowrap">
                        {row.make} {row.model} {row.year}
                      </td>
                      <td className="py-4 pr-4 text-gray-700">{row.sellerName}</td>
                      <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                        {formatNGN(row.amount)}
                      </td>
                      <td className="py-4 pr-4 text-gray-700">{row.buyerName}</td>
                      <td className="py-4 pr-4 text-gray-600 whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="py-4 pr-4">
                        <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.text)}>
                          <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dot)} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-4">
                        <button
                          type="button"
                          onClick={() => setReceiptId(row.id)}
                          className="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors whitespace-nowrap"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  );
                })}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-gray-400 text-sm">
                  No purchases found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={data?.pagination.totalPages ?? 1}
        onPageChange={setPage}
      />

      {receiptData && (
        <ReceiptDialog
          open={receiptId !== null}
          onClose={() => setReceiptId(null)}
          receipt={receiptData}
        />
      )}
      {receiptLoading && receiptId !== null && !receiptData && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTION TAB
// ─────────────────────────────────────────────────────────────────────────────

type InspectionStatus = "pending" | "assigned" | "active" | "completed" | "cancelled";

const INSP_STATUS_META: Record<
  InspectionStatus,
  { label: string; dot: string; text: string }
> = {
  completed: { label: "Completed", dot: "bg-emerald-500", text: "text-emerald-700" },
  pending:   { label: "Pending",   dot: "bg-amber-400",   text: "text-amber-700"  },
  assigned:  { label: "Assigned",  dot: "bg-blue-400",    text: "text-blue-700"   },
  active:    { label: "Active",    dot: "bg-primary",     text: "text-primary"    },
  cancelled: { label: "Cancelled", dot: "bg-red-400",     text: "text-red-600"    },
};

const INSP_FILTER_OPTIONS: { value: InspectionStatus | ""; label: string; dot: string }[] = [
  { value: "",          label: "All",       dot: "bg-gray-300"    },
  { value: "completed", label: "Completed", dot: "bg-emerald-500" },
  { value: "pending",   label: "Pending",   dot: "bg-amber-400"   },
  { value: "assigned",  label: "Assigned",  dot: "bg-blue-400"    },
  { value: "active",    label: "Active",    dot: "bg-primary"     },
  { value: "cancelled", label: "Cancelled", dot: "bg-red-400"     },
];

interface InspectionRow {
  id: number;
  make: string;
  model: string;
  year: number;
  sellerName: string;
  buyerName: string;
  inspectorEarnings: number;
  resultPercent: number | null;
  lastResponse: string;
  status: InspectionStatus;
}

interface ApiSection {
  status: string | null;
  percent: number | null;
}

interface AvailableInspector {
  userId: number;
  firstName: string;
  lastName: string;
  serviceArea: string | null;
  rating: number;
  totalInspections: number;
}

interface InspectionDetail {
  id: number;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  location: string | null;
  fee: number;
  inspectorEarnings: number;
  paidAt: string | null;
  carDetails: string;
  sellerName: string;
  buyerName: string;
  inspectorName: string | null;
  availableInspectors: AvailableInspector[];
  sameLocationInspectors?: AvailableInspector[];
  resultPercent: number | null;
  report: {
    id: number;
    summary: string | null;
    recommendedActions: string | null;
    overallPercent: number | null;
    sections: {
      exterior: ApiSection;
      interior: ApiSection;
      engineTransmission: ApiSection;
      suspensionBrakes: ApiSection;
      tiresWheels: ApiSection;
      lightsElectricals: ApiSection;
    };
    images: string[];
    details: Record<string, unknown> | null;
  } | null;
}

const SECTION_META: Array<{
  key: keyof NonNullable<InspectionDetail["report"]>["sections"];
  title: string;
  subtitle: string;
}> = [
  { key: "exterior",            title: "Exterior",              subtitle: "Paint condition, dents, scratches, rust." },
  { key: "interior",            title: "Interior",              subtitle: "Upholstery, dashboard, electronics (e.g., AC, audio system)." },
  { key: "engineTransmission",  title: "Engine & Transmission", subtitle: "Engine performance, oil leaks, transmission shifts." },
  { key: "suspensionBrakes",    title: "Suspension & Brakes",   subtitle: "Shock absorbers, brake pads, brake performance." },
  { key: "tiresWheels",         title: "Tires & Wheels",        subtitle: "Tread depth, alignment, condition of rims." },
  { key: "lightsElectricals",   title: "Lights & Electricals",  subtitle: "Headlights, indicators, battery, wiring." },
];

function ratingColor(r: number) {
  if (r >= 70) return "bg-primary/10 text-primary";
  if (r >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-600";
}

function InspectionDetailView({
  id,
  onBack,
}: {
  id: number;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [assignMsg, setAssignMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading, isError } = useQuery<InspectionDetail>({
    queryKey: ["admin-inspection-detail", id],
    queryFn: () => fetchJSON(`/admin/inspections/${id}`),
  });

  const manualAssign = useMutation({
    mutationFn: (inspectorId: number) =>
      fetchJSON(`/admin/inspections/${id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectorId }),
      }),
    onSuccess: () => {
      setAssignMsg({ type: "ok", text: "Inspector assigned successfully." });
      qc.invalidateQueries({ queryKey: ["admin-inspection-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-inspections"] });
    },
    onError: (e: Error) => {
      setAssignMsg({ type: "err", text: e.message || "Failed to assign inspector." });
    },
  });

  const autoAssign = useMutation({
    mutationFn: () =>
      fetchJSON(`/admin/inspections/${id}/auto-assign`, { method: "POST" }),
    onSuccess: () => {
      setAssignMsg({ type: "ok", text: "Inspector auto-assigned by proximity." });
      qc.invalidateQueries({ queryKey: ["admin-inspection-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-inspections"] });
    },
    onError: (e: Error) => {
      setAssignMsg({ type: "err", text: e.message || "No available inspector found near this location." });
    },
  });

  const recommendations: string[] = data?.report?.recommendedActions
    ? data.report.recommendedActions
        .split(/\r?\n|;|•|·/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const formatScheduled = (s: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary transition-colors mb-5"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-5">
        Vehicle Inspection Report
      </h2>

      {isLoading && (
        <div className="py-16 flex items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {isError && (
        <div className="py-16 text-center text-sm text-red-500">
          Failed to load inspection.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5 mb-5">
            {[
              { label: "Car Details",            value: data.carDetails },
              { label: "Seller's Name:",         value: data.sellerName },
              { label: "Inspection Date | Time", value: formatScheduled(data.scheduledAt) },
              { label: "Inspection Location",    value: data.location ?? "—" },
              { label: "Inspector's Name",       value: data.inspectorName ?? "Awaiting assignment" },
            ].map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <div className="text-xs text-gray-400 mb-1 whitespace-nowrap">{label}</div>
                <div className="text-sm sm:text-base font-bold text-gray-900 leading-snug">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-10 gap-y-4 mb-6">
            <div className="min-w-0">
              <div className="text-xs text-gray-400 mb-1">Inspection Amount</div>
              <div className="text-sm sm:text-base font-bold text-gray-900">
                ₦{Math.round(data.fee).toLocaleString()}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-400 mb-1">Inspection Earnings</div>
              <div className="text-sm sm:text-base font-bold text-gray-900">
                ₦{Math.round(data.inspectorEarnings).toLocaleString()}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-400 mb-1">Overall Status</div>
              {data.resultPercent !== null ? (
                <span
                  className={cn(
                    "inline-block rounded-full px-4 py-1.5 text-sm font-bold",
                    ratingColor(data.resultPercent),
                  )}
                >
                  Rating: {data.resultPercent}%
                </span>
              ) : (
                <span className="inline-block rounded-full px-4 py-1.5 text-sm font-bold bg-gray-100 text-gray-500 capitalize">
                  {data.status}
                </span>
              )}
            </div>
          </div>

          {/* ── Inspector Assignment Panel ── */}
          {(data.status === "pending" || data.status === "assigned") && (
            <div className="mb-6 rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Inspector Assignment
                  </h3>
                  {data.inspectorName ? (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Currently assigned to <span className="font-semibold text-gray-700">{data.inspectorName}</span>. You can reassign below.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-0.5">No inspector assigned yet. Auto-assign by proximity or pick one manually.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setAssignMsg(null); autoAssign.mutate(); }}
                  disabled={autoAssign.isPending || manualAssign.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {autoAssign.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  Auto-Assign
                </button>
              </div>

              {assignMsg && (
                <div
                  className={cn(
                    "mb-4 flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium",
                    assignMsg.type === "ok"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-600",
                  )}
                >
                  {assignMsg.type === "ok" ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  {assignMsg.text}
                </div>
              )}

              {(data.sameLocationInspectors ?? []).length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  No available inspectors found in this inspection location.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
                  {(data.sameLocationInspectors ?? []).map((insp) => (
                    <div
                      key={insp.userId}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {insp.firstName} {insp.lastName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {insp.serviceArea ?? "Service area not set"} &bull;{" "}
                          <Star className="inline h-3 w-3 text-amber-400 -mt-0.5" />
                          {" "}{insp.rating.toFixed(1)} &bull; {insp.totalInspections} jobs
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setAssignMsg(null); manualAssign.mutate(insp.userId); }}
                        disabled={autoAssign.isPending || manualAssign.isPending}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
                      >
                        {manualAssign.isPending && manualAssign.variables === insp.userId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                        Assign
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Separator className="mb-8" />

          {data.report?.summary && (
            <div className="mb-8">
              <h3 className="text-lg font-extrabold text-gray-900 mb-2">Summary</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{data.report.summary}</p>
            </div>
          )}

          {data.report ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-8">
                {SECTION_META.map(({ key, title, subtitle }) => {
                  const sec = data.report!.sections[key];
                  const pct = sec.percent ?? 0;
                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-5 flex flex-col gap-3"
                    >
                      <div>
                        <span className="text-sm font-bold text-gray-900">{title}: </span>
                        <span className="text-xs text-gray-400">{subtitle}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">
                        Status:{" "}
                        {sec.status ? sec.status.charAt(0).toUpperCase() + sec.status.slice(1) : "—"}
                      </p>
                      <span
                        className={cn(
                          "inline-block self-start rounded-full px-3 py-1 text-xs font-semibold",
                          ratingColor(pct),
                        )}
                      >
                        Rating: {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                <div>
                  <h3 className="text-lg font-extrabold text-gray-900 mb-4">Recommendations</h3>
                  {recommendations.length > 0 ? (
                    <ul className="space-y-2">
                      {recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400">No recommendations.</p>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-900 mb-4">Photos</h3>
                  {data.report.images.length > 0 ? (
                    <ul className="space-y-2">
                      {data.report.images.map((url, i) => (
                        <li key={i}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            ViewImage
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400">No photos uploaded.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              The inspector has not submitted the report yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Inspection Types CRUD ────────────────────────────────────────────────────

interface InspectionType {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationHours: number;
  isActive: boolean;
  createdAt: string;
}

function InspectionTypesTab() {
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<InspectionType | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    durationHours: "2",
    isActive: true,
  });

  const { data: types = [], isLoading } = useQuery<InspectionType[]>({
    queryKey: ["admin-inspection-types"],
    queryFn: () => fetchJSON("/admin/inspection-types"),
  });

  const resetForm = () =>
    setFormData({ name: "", description: "", price: "", durationHours: "2", isActive: true });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price: parseFloat(formData.price),
        durationHours: parseInt(formData.durationHours),
        isActive: formData.isActive,
      };
      if (editingId !== null) {
        return fetchJSON(`/admin/inspection-types/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return fetchJSON("/admin/inspection-types", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-inspection-types"] });
      setEditingId(null);
      setAddingNew(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJSON(`/admin/inspection-types/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-inspection-types"] });
    },
  });

  const startEdit = (t: InspectionType) => {
    setEditingId(t.id);
    setAddingNew(false);
    setFormData({
      name: t.name,
      description: t.description ?? "",
      price: String(t.price),
      durationHours: String(t.durationHours),
      isActive: t.isActive,
    });
  };

  const startAdd = () => {
    setEditingId(null);
    setAddingNew(true);
    resetForm();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAddingNew(false);
    resetForm();
  };

  const showForm = editingId !== null || addingNew;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900">Inspection Types</h2>
        {!showForm && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Type
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">
            {editingId !== null ? "Edit Inspection Type" : "New Inspection Type"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Basic Inspection"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Price (₦) *</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData((f) => ({ ...f, price: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. 15000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duration (hours)</label>
              <input
                type="number"
                value={formData.durationHours}
                onChange={(e) => setFormData((f) => ({ ...f, durationHours: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={formData.isActive ? "active" : "inactive"}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, isActive: e.target.value === "active" }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Optional description…"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!formData.name.trim() || !formData.price || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="inline-flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
          {saveMutation.isError && (
            <p className="text-sm text-red-500 mt-2">
              {(saveMutation.error as Error).message}
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left">
              {["Name", "Description", "Price", "Duration", "Status", ""].map((h, i) => (
                <th key={i} className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide last:pr-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-4 pr-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : types.map((t) => (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-t border-gray-100",
                      editingId === t.id && "bg-primary/5",
                    )}
                  >
                    <td className="py-4 pr-4 font-semibold text-gray-900">{t.name}</td>
                    <td className="py-4 pr-4 text-gray-600 max-w-[200px] truncate">
                      {t.description || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-4 pr-4 text-gray-700">{formatNGN(t.price)}</td>
                    <td className="py-4 pr-4 text-gray-700">{t.durationHours}h</td>
                    <td className="py-4 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-sm font-medium",
                          t.isActive ? "text-emerald-700" : "text-gray-500",
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            t.isActive ? "bg-emerald-500" : "bg-gray-400",
                          )}
                        />
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          className="text-gray-400 hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(t)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            {!isLoading && types.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-gray-400 text-sm">
                  No inspection types yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DeleteListingDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMutation.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        submitting={deleteMutation.isPending}
        title="Are you sure you want to delete this inspection type?"
        description="Deleting this inspection type removes it from future scheduling and pricing."
        subtitle={pendingDelete ? `"${pendingDelete.name}"` : undefined}
        confirmLabel="Delete Type"
      />
    </div>
  );
}

// ─── Inspection Tab (list + detail + types) ───────────────────────────────────

function InspectionTab() {
  const [subTab, setSubTab] = useState<"inspections" | "types">("inspections");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InspectionStatus | "">("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const PAGE_SIZE = 10;

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout(
      (window as unknown as { _inspSt?: ReturnType<typeof setTimeout> })._inspSt,
    );
    (window as unknown as { _inspSt?: ReturnType<typeof setTimeout> })._inspSt =
      setTimeout(() => {
        setDebouncedSearch(v);
        setPage(1);
      }, 300);
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter) p.set("status", statusFilter);
    return p.toString();
  }, [page, debouncedSearch, statusFilter]);

  const { data, isLoading, isPlaceholderData } = useQuery<{
    items: InspectionRow[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>({
    queryKey: ["admin-inspections", params],
    queryFn: () => fetchJSON(`/admin/inspections?${params}`),
    placeholderData: keepPreviousData,
    enabled: subTab === "inspections",
  });

  if (detailId !== null) {
    return (
      <InspectionDetailView
        id={detailId}
        onBack={() => setDetailId(null)}
      />
    );
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-5">
        {(
          [
            { value: "inspections", label: "Inspection" },
            { value: "types", label: "Inspection Types" },
          ] as const
        ).map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSubTab(s.value)}
            className={`pb-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              subTab === s.value
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {subTab === "types" ? (
        <InspectionTypesTab />
      ) : (
        <>
          <TabHeader
            title={`Inspection (${data?.pagination.total ?? "…"})`}
            search={search}
            onSearch={handleSearch}
            filterActive={!!statusFilter}
            filterContent={
              <div className="space-y-0.5">
                {INSP_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setPage(1);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors",
                      statusFilter === opt.value
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-gray-50 text-gray-700",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", opt.dot)} />
                    {opt.label}
                  </button>
                ))}
              </div>
            }
          />

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="text-left">
                  {[
                    "TXN ID",
                    "Car Make",
                    "Seller Name",
                    "Name",
                    "Inspection Earnings",
                    "Inspection Result",
                    "Last Response",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="py-4 pr-4">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((row) => {
                      const meta =
                        INSP_STATUS_META[row.status] ?? {
                          label: row.status,
                          dot: "bg-gray-400",
                          text: "text-gray-600",
                        };
                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            "border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors",
                            isPlaceholderData && "opacity-60",
                          )}
                          onClick={() => setDetailId(row.id)}
                        >
                          <td className="py-4 pr-4 font-semibold italic text-gray-900">
                            {String(row.id).padStart(2, "0")}
                          </td>
                          <td className="py-4 pr-4 font-semibold text-gray-900 whitespace-nowrap">
                            {row.make} {row.model} {row.year}
                          </td>
                          <td className="py-4 pr-4 text-gray-700">{row.sellerName}</td>
                          <td className="py-4 pr-4 text-gray-700">{row.buyerName}</td>
                          <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                            {formatNGN(row.inspectorEarnings)}
                          </td>
                          <td className="py-4 pr-4">
                            {row.resultPercent !== null ? (
                              <span
                                className={cn(
                                  "text-sm font-semibold",
                                  row.resultPercent >= 70
                                    ? "text-emerald-600"
                                    : row.resultPercent >= 40
                                      ? "text-amber-600"
                                      : "text-red-500",
                                )}
                              >
                                {row.resultPercent}%
                              </span>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="py-4 pr-4 text-gray-600 whitespace-nowrap">
                            {formatDate(row.lastResponse)}
                          </td>
                          <td className="py-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 font-medium",
                                meta.text,
                              )}
                            >
                              <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dot)} />
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                {!isLoading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-400 text-sm">
                      No inspections found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={data?.pagination.totalPages ?? 1}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES TAB
// ─────────────────────────────────────────────────────────────────────────────

interface DbCategory {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

interface CategoryForm {
  name: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
}

const CATEGORY_BLANK: CategoryForm = { name: "", description: "", imageUrl: "", isActive: true };

function CategoriesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<CategoryForm>(CATEGORY_BLANK);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [formUploading, setFormUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: categories, isLoading } = useQuery<DbCategory[]>({
    queryKey: ["admin-categories"],
    queryFn: () => fetchJSON("/admin/categories"),
  });

  const save = useMutation({
    mutationFn: (payload: { id?: number; body: Partial<CategoryForm> }) =>
      fetchJSON(
        payload.id ? `/admin/categories/${payload.id}` : "/admin/categories",
        {
          method: payload.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      setShowForm(false);
      setEditId(null);
      setForm(CATEGORY_BLANK);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: number) =>
      fetchJSON(`/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      setDeleteId(null);
    },
  });

  const toggleActive = (cat: DbCategory) =>
    save.mutate({ id: cat.id, body: { isActive: !cat.isActive } });

  async function handleImageUpload(file: File, catId: number) {
    setUploadingId(catId);
    try {
      const { uploadFile } = await import("@/lib/upload");
      const { servingUrl } = await uploadFile(file);
      await save.mutateAsync({ id: catId, body: { imageUrl: servingUrl } });
    } catch (e) {
      toast({
        title: "Image upload failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingId(null);
    }
  }

  function openAdd() {
    setEditId(null);
    setForm(CATEGORY_BLANK);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(cat: DbCategory) {
    setEditId(cat.id);
    setForm({
      name: cat.name,
      description: cat.description ?? "",
      imageUrl: cat.imageUrl ?? "",
      isActive: cat.isActive,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm(CATEGORY_BLANK);
    setFormError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    save.mutate({
      id: editId ?? undefined,
      body: {
        name: form.name,
        description: form.description || undefined,
        imageUrl: form.imageUrl || undefined,
        isActive: form.isActive,
      },
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Car Categories</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage browse-by-type categories shown on the homepage
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-primary text-white text-sm px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <form
          onSubmit={submit}
          className="mb-6 border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-4"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-800">
              {editId ? "Edit Category" : "New Category"}
            </span>
            <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. SUV"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category Image</label>
              <div className="flex items-center gap-2">
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt="preview"
                    className="h-10 w-10 rounded-lg object-cover border border-gray-200 shrink-0"
                  />
                )}
                <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-primary/50 hover:bg-gray-50 transition-colors">
                  {formUploading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> Uploading…</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5 shrink-0" />{form.imageUrl ? "Replace image" : "Browse image…"}</>
                  )}
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    disabled={formUploading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setFormUploading(true);
                      setFormError(null);
                      try {
                        const { uploadFile } = await import("@/lib/upload");
                        const { servingUrl } = await uploadFile(f);
                        setForm((prev) => ({ ...prev, imageUrl: servingUrl }));
                      } catch (err) {
                        setFormError((err as Error).message);
                      } finally {
                        setFormUploading(false);
                      }
                    }}
                  />
                </label>
                {form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, imageUrl: "" }))}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description (optional)"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="cat-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 text-primary rounded border-gray-300"
              />
              <label htmlFor="cat-active" className="text-sm text-gray-700 select-none">
                Active (visible on homepage)
              </label>
            </div>
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={closeForm}
              className="text-sm px-4 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {editId ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      )}

      {/* Categories grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !categories?.length ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          No categories yet. Add one above.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="relative group rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Image */}
              <div className="relative h-28 bg-green-50 flex items-center justify-center overflow-hidden">
                {cat.imageUrl ? (
                  <img
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageOff className="h-10 w-10 text-gray-300" />
                )}
                {/* Upload overlay */}
                <label className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors cursor-pointer">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-gray-800 text-xs font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                    {uploadingId === cat.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Upload
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingId === cat.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, cat.id);
                    }}
                  />
                </label>
              </div>

              {/* Body */}
              <div className="p-3">
                <div className="flex items-start justify-between gap-1 mb-0.5">
                  <span className="font-semibold text-sm text-gray-900 truncate">{cat.name}</span>
                  <span
                    className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      cat.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {cat.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                {cat.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">{cat.description}</p>
                )}

                <div className="flex items-center gap-1 mt-2">
                  <button
                    onClick={() => toggleActive(cat)}
                    className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                  >
                    {cat.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => openEdit(cat)}
                    className="p-1 text-gray-400 hover:text-primary transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {deleteId === cat.id ? (
                    <span className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => del.mutate(cat.id)}
                        disabled={del.isPending}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                      </button>
                      <button
                        onClick={() => setDeleteId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeleteId(cat.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-auto"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURES TAB
// ─────────────────────────────────────────────────────────────────────────────

interface DbFeature {
  id: number;
  name: string;
  icon: string | null;
  featureGroup: string | null;
}

interface FeatureForm {
  name: string;
  icon: string;
  featureGroup: string;
}

const FEATURE_BLANK: FeatureForm = { name: "", icon: "", featureGroup: "" };

function FeaturesTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FeatureForm>(FEATURE_BLANK);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: features, isLoading } = useQuery<DbFeature[]>({
    queryKey: ["admin-features"],
    queryFn: () => fetchJSON("/admin/features"),
  });

  const save = useMutation({
    mutationFn: (payload: { id?: number; body: Partial<FeatureForm> }) =>
      fetchJSON(
        payload.id ? `/admin/features/${payload.id}` : "/admin/features",
        {
          method: payload.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-features"] });
      setShowForm(false);
      setEditId(null);
      setForm(FEATURE_BLANK);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: number) =>
      fetchJSON(`/admin/features/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-features"] });
      setDeleteId(null);
    },
  });

  function openAdd() {
    setEditId(null);
    setForm(FEATURE_BLANK);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(f: DbFeature) {
    setEditId(f.id);
    setForm({
      name: f.name,
      icon: f.icon ?? "",
      featureGroup: f.featureGroup ?? "",
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm(FEATURE_BLANK);
    setFormError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    save.mutate({
      id: editId ?? undefined,
      body: {
        name: form.name,
        icon: form.icon || undefined,
        featureGroup: form.featureGroup || undefined,
      },
    });
  }

  const grouped = useMemo(() => {
    if (!features) return {};
    return features.reduce<Record<string, DbFeature[]>>((acc, f) => {
      const g = f.featureGroup ?? "Uncategorised";
      if (!acc[g]) acc[g] = [];
      acc[g].push(f);
      return acc;
    }, {});
  }, [features]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Car Features</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage selectable features for car listings, grouped by category
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-primary text-white text-sm px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Feature
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <form
          onSubmit={submit}
          className="mb-6 border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-4"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-800">
              {editId ? "Edit Feature" : "New Feature"}
            </span>
            <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Leather Seats"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Group</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.featureGroup}
                onChange={(e) => setForm({ ...form, featureGroup: e.target.value })}
                placeholder="e.g. Interior"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Icon (name)</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="e.g. armchair"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={closeForm}
              className="text-sm px-4 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {editId ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      )}

      {/* Feature groups */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !features?.length ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          No features yet. Add one above.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, items]) => (
            <div key={group}>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {group}
              </h4>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 font-medium">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Name</th>
                      <th className="px-4 py-2.5 text-left">Icon</th>
                      <th className="px-4 py-2.5 text-left">Group</th>
                      <th className="px-4 py-2.5 text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((f) => (
                      <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{f.name}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                          {f.icon ?? <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {f.featureGroup ?? <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(f)}
                              className="p-1 text-gray-400 hover:text-primary transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {deleteId === f.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  onClick={() => del.mutate(f.id)}
                                  disabled={del.isPending}
                                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                                >
                                  {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete?"}
                                </button>
                                <button
                                  onClick={() => setDeleteId(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  No
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteId(f.id)}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="py-24 text-center text-gray-400 text-sm">
      {label} — coming soon.
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>("listings");

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        <AdminLocalTabs
          tabs={INVENTORY_TABS.map((t) => ({ key: t.value, label: t.label }))}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as InventoryTab)}
        />

        {/* Content */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            {activeTab === "listings"   && <ListingsTab />}
            {activeTab === "offers"     && <OffersTab />}
            {activeTab === "purchases"  && <PurchasesTab />}
            {activeTab === "inspection" && <InspectionTab />}
            {activeTab === "categories" && <CategoriesTab />}
            {activeTab === "features"   && <FeaturesTab />}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
