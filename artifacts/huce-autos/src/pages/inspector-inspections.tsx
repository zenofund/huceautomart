import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { inspectorNav } from "@/lib/inspector-nav";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

interface InspectionRow {
  id: number;
  status: "pending" | "assigned" | "active" | "completed" | "cancelled";
  scheduledAt: string | null;
  completedAt: string | null;
  location: string | null;
  fee: number;
  earnings: number;
  createdAt: string;
  buyerName: string;
  sellerName: string;
  carMake: string;
  carDetails: string;
  type: string | null;
  resultPercent: number | null;
}

interface ListResponse {
  items: InspectionRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const STATUS_TABS = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
] as const;

type TabKey = (typeof STATUS_TABS)[number]["key"];

function formatNaira(n: number) {
  return `₦${n.toLocaleString()}`;
}

function formatScheduled(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, "")
    .toLowerCase();
  return `${datePart}, ${timePart}`;
}

function TicketStatusPill({ status }: { status: InspectionRow["status"] }) {
  const isCompleted = status === "completed";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 whitespace-nowrap">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          isCompleted ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {isCompleted ? "Completed" : "Pending"}
    </span>
  );
}

function ResultCell({ percent }: { percent: number | null }) {
  if (percent == null)
    return <span className="text-gray-400 tracking-widest">----</span>;
  const tone =
    percent >= 70
      ? "text-emerald-600"
      : percent >= 40
        ? "text-amber-600"
        : "text-rose-600";
  return <span className={cn("font-medium", tone)}>{percent}%</span>;
}

function buildPaginator(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  if (current > 3) out.push("…");
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  for (let i = start; i <= end; i++) out.push(i);
  if (current < totalPages - 2) out.push("…");
  out.push(totalPages);
  return out;
}

export default function InspectorInspections() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();

  const [tab, setTab] = useState<TabKey>("active");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "10",
        });
        // "Active" tab → everything not completed/cancelled. We fetch without a
        // server status filter and split client-side, then re-paginate.
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (tab === "completed") params.set("status", "completed");
        const res = await fetch(
          `/api/inspectors/me/inspections?${params.toString()}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const json = (await res.json()) as ListResponse;
          if (!cancelled) {
            if (tab === "active") {
              const filtered = json.items.filter(
                (r) => r.status !== "completed" && r.status !== "cancelled",
              );
              setData({ ...json, items: filtered, total: filtered.length });
            } else {
              setData(json);
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, debouncedSearch, page]);

  const displayName = authUser
    ? `${authUser.firstName} ${authUser.lastName}`.trim()
    : "Inspection Officer";

  const user: DashboardUser = {
    name: displayName,
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? false,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const paginator = useMemo(
    () => buildPaginator(page, totalPages),
    [page, totalPages],
  );

  const tabLabel = tab === "active" ? "Active" : "Completed";

  return (
    <DashboardLayout
      user={user}
      navItems={inspectorNav}
      title="Inspection"
      onLogout={handleLogout}
    >
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          Inspection
        </h1>
      </div>

      {/* Tabs — no scrollbar, fixed two tabs */}
      <div className="border-b border-gray-200 mb-8">
        <div className="flex gap-8">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative pb-3 text-sm font-semibold transition-colors",
                tab === t.key
                  ? "text-primary"
                  : "text-gray-500 hover:text-gray-800",
              )}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Count + search row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h3 className="text-base sm:text-lg font-extrabold text-gray-900">
          {tabLabel}
          <span className="ml-0.5">({data?.total ?? 0})</span>
        </h3>
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search here..."
            className="w-full rounded-full border border-primary/30 bg-white pl-9 pr-4 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="input-search-inspections"
          />
        </div>
      </div>

      {/* Table — single container, mobile horizontal scroll only when needed */}
      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[80px_1.2fr_1fr_1.2fr_1fr_1.4fr_1fr] gap-4 px-3 py-3 border-b border-gray-200 text-[12px] font-medium text-gray-500">
            <div>Inspect ID</div>
            <div>Car Make</div>
            <div>Seller Name</div>
            <div>Inspection Earnings</div>
            <div>Inspection Result</div>
            <div>Scheduled Time/ Date</div>
            <div>Ticket Status</div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              No {tabLabel.toLowerCase()} inspections.
            </div>
          ) : (
            items.map((row) => (
              <button
                key={row.id}
                onClick={() => setLocation(`/inspector/inspections/${row.id}`)}
                className="grid w-full grid-cols-[80px_1.2fr_1fr_1.2fr_1fr_1.4fr_1fr] gap-4 px-3 py-4 border-b border-gray-100 text-sm text-gray-800 hover:bg-gray-50/60 transition-colors text-left items-center"
                data-testid={`row-inspection-${row.id}`}
              >
                <div className="text-gray-500">
                  {String(row.id).padStart(2, "0")}
                </div>
                <div className="truncate text-gray-700">{row.carMake}</div>
                <div className="truncate text-gray-700">{row.sellerName}</div>
                <div className="font-medium text-gray-800 whitespace-nowrap">
                  {formatNaira(row.earnings)}
                </div>
                <div>
                  <ResultCell percent={row.resultPercent} />
                </div>
                <div className="text-gray-600 whitespace-nowrap">
                  {formatScheduled(row.scheduledAt)}
                </div>
                <div>
                  <TicketStatusPill status={row.status} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Paginator — Previous left, numbers center, Next right */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 gap-3 flex-wrap">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="btn-prev-page"
          >
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-1">
            {paginator.map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="px-2 text-gray-400">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "h-8 min-w-[2rem] px-2 rounded-md text-sm font-medium transition-colors",
                    p === page
                      ? "bg-primary/10 text-primary"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                >
                  {p}
                </button>
              ),
            )}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="btn-next-page"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}
