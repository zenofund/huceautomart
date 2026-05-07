import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Eye,
  ArrowLeft,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const API_BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

interface DeleteRequestRow {
  id: number;
  status: string;
  reason: string | null;
  createdAt: string;
  listingId: number | null;
  listingMake: string | null;
  listingModel: string | null;
  listingYear: number | null;
  listingPrice: number | null;
  listingStatus: string | null;
  listingViewCount: number | null;
  listingCreatedAt: string | null;
  sellerFirstName: string | null;
  sellerLastName: string | null;
  sellerBusinessName: string | null;
}

interface DeleteRequestsResponse {
  items: DeleteRequestRow[];
  total: number;
  page: number;
  pageSize: number;
}

function formatDate(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function formatNGN(n: number | null) {
  if (n == null) return "-";
  return "₦" + Number(n).toLocaleString("en-NG");
}

function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 1) return [1];
  const pages: (number | "…")[] = [];
  const delta = 1;
  const left = current - delta;
  const right = current + delta;
  let last = 0;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= left && i <= right)) {
      if (last && i - last > 1) pages.push("…");
      pages.push(i);
      last = i;
    }
  }
  return pages;
}

export default function AdminDeleteListingRequestsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 10;

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(1);
    }, 300);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const { data, isLoading } = useQuery<DeleteRequestsResponse>({
    queryKey: ["admin-delete-requests", debouncedSearch, page],
    queryFn: () =>
      fetchJSON<DeleteRequestsResponse>(
        `/admin/listings/delete-requests?search=${encodeURIComponent(debouncedSearch)}&page=${page}&pageSize=${PAGE_SIZE}&status=pending`,
      ),
    placeholderData: keepPreviousData,
  });

  const { mutate: handleAction, isPending: actionPending } = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      patchJSON(`/admin/listings/delete-requests/${id}`, { action }),
    onSuccess: (_d, vars) => {
      toast({
        title: vars.action === "approve" ? "Request accepted" : "Request cancelled",
        description: vars.action === "approve"
          ? "The listing has been deleted."
          : "The deletion request has been rejected.",
      });
      qc.invalidateQueries({ queryKey: ["admin-delete-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-listings"] });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {/* Header */}
          <div className="flex flex-wrap items-start gap-3 mb-6">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => navigate("/admin/inventory")}
                className="mt-0.5 p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                aria-label="Back to inventory"
              >
                <ArrowLeft className="h-4 w-4 text-gray-500" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Delete Listings Request ({data?.total ?? "…"})
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">
                  These are requests for delete of Car Listing Post
                </p>
              </div>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search here..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">ID</th>
                  <th className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Car Make</th>
                  <th className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Seller</th>
                  <th className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Amount</th>
                  <th className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Upload Date</th>
                  <th className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">View</th>
                  <th className="pb-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Status</th>
                  <th className="pb-3 text-gray-400 font-medium text-xs uppercase tracking-wide">Actions</th>
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
                  : data?.items.map((row) => {
                      const carLabel = [row.listingMake, row.listingModel, row.listingYear]
                        .filter(Boolean)
                        .join(" ");
                      const seller =
                        row.sellerBusinessName ||
                        `${row.sellerFirstName ?? ""} ${row.sellerLastName ?? ""}`.trim() ||
                        "-";
                      const isPending = row.status === "pending";

                      return (
                        <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                          <td className="py-4 pr-4 font-semibold text-gray-900">
                            {String(row.listingId ?? row.id).padStart(2, "0")}
                          </td>
                          <td className="py-4 pr-4 font-semibold text-gray-900 whitespace-nowrap">
                            {carLabel || "-"}
                          </td>
                          <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">{seller}</td>
                          <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                            {formatNGN(row.listingPrice)}
                          </td>
                          <td className="py-4 pr-4 text-gray-600 whitespace-nowrap">
                            {formatDate(row.listingCreatedAt)}
                          </td>
                          <td className="py-4 pr-4 text-gray-600">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5 text-gray-400" />
                              {row.listingViewCount ?? 0}
                            </span>
                          </td>
                          <td className="py-4 pr-4">
                            <span
                              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                                row.listingStatus === "active"
                                  ? "text-green-700"
                                  : row.listingStatus === "sold"
                                  ? "text-red-600"
                                  : "text-gray-500"
                              }`}
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  row.listingStatus === "active"
                                    ? "bg-green-500"
                                    : row.listingStatus === "sold"
                                    ? "bg-red-500"
                                    : "bg-gray-400"
                                }`}
                              />
                              {row.listingStatus
                                ? row.listingStatus.charAt(0).toUpperCase() + row.listingStatus.slice(1)
                                : "-"}
                            </span>
                          </td>
                          <td className="py-4">
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  disabled={!isPending || actionPending}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                                  aria-label="Actions"
                                >
                                  <MoreVertical className="h-4 w-4 text-gray-500" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  className="cursor-pointer text-primary font-medium focus:text-primary"
                                  onClick={() => handleAction({ id: row.id, action: "approve" })}
                                >
                                  Accept Request
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="cursor-pointer text-red-600 font-medium focus:text-red-600"
                                  onClick={() => handleAction({ id: row.id, action: "reject" })}
                                >
                                  Cancel Request
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}

                {!isLoading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-400 text-sm">
                      No pending deletion requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <div className="flex items-center gap-1">
              {buildPages(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="w-8 text-center text-gray-400 text-sm">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p as number)}
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
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
