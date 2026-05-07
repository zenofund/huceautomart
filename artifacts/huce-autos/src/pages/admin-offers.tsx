import { useState, useCallback, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface PagedResponse {
  items: OfferRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNGN(n: number) {
  return `₦${n.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

const STATUS_META: Record<
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

const FILTER_OPTIONS: { value: OfferStatus | ""; label: string; dot: string }[] = [
  { value: "",          label: "All Statuses", dot: "bg-gray-300"    },
  { value: "accepted",  label: "Accepted",     dot: "bg-emerald-500" },
  { value: "pending",   label: "Pending",      dot: "bg-amber-400"   },
  { value: "cancelled", label: "Cancelled",    dot: "bg-red-400"     },
  { value: "declined",  label: "Declined",     dot: "bg-red-500"     },
  { value: "completed", label: "Completed",    dot: "bg-primary"     },
  { value: "countered", label: "Countered",    dot: "bg-blue-500"    },
  { value: "expired",   label: "Expired",      dot: "bg-gray-400"    },
];

function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [];
  if (current <= 4) {
    for (let i = 1; i <= Math.min(5, total); i++) pages.push(i);
    if (total > 6) pages.push("…");
    if (total > 5) pages.push(total - 1);
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push(2);
    pages.push("…");
    for (let i = Math.max(3, total - 4); i <= total; i++) pages.push(i);
  } else {
    pages.push(1, 2, "…", current - 1, current, current + 1, "…", total - 1, total);
  }
  return pages;
}

function InspectionCell({
  status,
  passRate,
}: {
  status: string | null;
  passRate: number | null;
}) {
  if (!status) return <span className="text-gray-400">—</span>;
  if (status === "completed") {
    return (
      <span>
        Done{" "}
        {passRate !== null && (
          <span className="text-emerald-600 font-medium">
            ({passRate}% Passed)
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="capitalize text-gray-600">{status}</span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOffersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OfferStatus | "">("");
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const pageSize = 10;

  const debounce = useCallback((val: string) => {
    setDebouncedSearch(val);
    setPage(1);
  }, []);

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearch(val);
    clearTimeout((handleSearch as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
      () => debounce(val),
      300,
    );
  }

  const params = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter) p.set("status", statusFilter);
    return p.toString();
  }, [page, debouncedSearch, statusFilter]);

  const { data, isLoading, isPlaceholderData } = useQuery<PagedResponse>({
    queryKey: ["admin-offers", params],
    queryFn: async () => {
      const res = await fetch(`/api/admin/offers?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<PagedResponse>;
    },
    placeholderData: keepPreviousData,
  });

  const pageNumbers = useMemo(
    () => buildPageNumbers(page, data?.pagination.totalPages ?? 1),
    [page, data?.pagination.totalPages],
  );

  const skeletonRows = Array.from({ length: pageSize });

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <h1 className="text-lg font-extrabold text-gray-900 shrink-0">
              Offers
            </h1>

            {/* Search (centred on desktop) */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={handleSearch}
                placeholder="Search here..."
                className="w-full rounded-full border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>

            {/* Filter */}
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors shrink-0",
                    statusFilter
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50",
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filter
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-2 rounded-xl">
                <div className="space-y-0.5">
                  {FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setStatusFilter(opt.value);
                        setPage(1);
                        setFilterOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition-colors",
                        statusFilter === opt.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-gray-50 text-gray-700",
                      )}
                    >
                      <span
                        className={cn("h-2.5 w-2.5 rounded-full shrink-0", opt.dot)}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className="overflow-x-auto no-scrollbar -mx-6 px-6">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="py-3 pr-4 w-14">ID</th>
                  <th className="py-3 pr-4">Car Make</th>
                  <th className="py-3 pr-4">Seller Name</th>
                  <th className="py-3 pr-4">Amount</th>
                  <th className="py-3 pr-4 text-center">Offer Request</th>
                  <th className="py-3 pr-4">Inspection Status</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  skeletonRows.map((_, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="py-4 pr-4">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-16 text-center text-sm text-gray-400"
                    >
                      {debouncedSearch || statusFilter
                        ? "No offers match your search."
                        : "No offers yet."}
                    </td>
                  </tr>
                ) : (
                  data?.items.map((row) => {
                    const meta = STATUS_META[row.status] ?? {
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
                        <td className="py-4 pr-4 font-semibold text-gray-900 italic">
                          {String(row.id).padStart(2, "0")}
                        </td>
                        <td className="py-4 pr-4 font-semibold text-gray-900 whitespace-nowrap">
                          {row.make} {row.model} {row.year}
                        </td>
                        <td className="py-4 pr-4 text-gray-700">
                          {row.sellerName}
                        </td>
                        <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                          {formatNGN(row.amount)}
                        </td>
                        <td className="py-4 pr-4 text-center text-gray-700">
                          {row.offerCount}
                        </td>
                        <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                          <InspectionCell
                            status={row.inspectionStatus}
                            passRate={row.inspectionPassRate}
                          />
                        </td>
                        <td className="py-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 font-medium",
                              meta.text,
                            )}
                          >
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                meta.dot,
                              )}
                            />
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ─────────────────────────────────────────────── */}
          {(data?.pagination.totalPages ?? 0) > 1 && (
            <div className="mt-6 flex items-center justify-between gap-3 flex-wrap border-t border-gray-100 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <div className="hidden sm:flex items-center gap-1">
                {pageNumbers.map((pn, i) =>
                  pn === "…" ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-2 text-sm text-gray-400"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={pn}
                      onClick={() => setPage(pn as number)}
                      className={cn(
                        "min-w-[34px] h-8 px-2 rounded-md text-sm font-medium transition-colors",
                        pn === page
                          ? "bg-primary/10 text-primary"
                          : "text-gray-600 hover:bg-gray-100",
                      )}
                    >
                      {pn}
                    </button>
                  ),
                )}
              </div>

              {/* Mobile page indicator */}
              <span className="sm:hidden text-sm text-gray-500">
                Page {page} of {data?.pagination.totalPages}
              </span>

              <button
                disabled={page >= (data?.pagination.totalPages ?? 1)}
                onClick={() =>
                  setPage((p) =>
                    Math.min(data?.pagination.totalPages ?? 1, p + 1),
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {!isLoading && (data?.items.length ?? 0) > 0 && (
            <p className="mt-3 text-xs text-gray-400">
              {data?.pagination.total} offer
              {(data?.pagination.total ?? 0) !== 1 ? "s" : ""} total
              {statusFilter || debouncedSearch ? " (filtered)" : ""}
              {isLoading && (
                <Loader2 className="inline ml-1.5 h-3 w-3 animate-spin" />
              )}
            </p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
