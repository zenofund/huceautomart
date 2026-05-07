import { useCallback, useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Download,
  Loader2,
  Wallet,
  Check,
  X,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { AppDialog } from "@/components/app-dialog";
import { TextPromptDialog } from "@/components/dialogs/text-prompt-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinanceStats {
  totalEarnings: number;
  monthlyEarnings: number;
  subscriptionEarnings: number;
  escrowEarnings: number;
}

interface ChartPoint {
  month: string;
  revenue: number;
  fees: number;
}

interface ChartPayload {
  year: number;
  total: number;
  growthPct: number;
  series: ChartPoint[];
}

interface TransactionRow {
  id: number;
  amount: number;
  platformFee: number;
  paymentStatus: "pending" | "in_escrow" | "completed" | "failed" | "refunded";
  receiptNumber: string | null;
  createdAt: string;
  listingMake: string;
  listingModel: string;
  listingYear: number;
  buyerFirstName: string;
  buyerLastName: string;
  sellerFirstName: string;
  sellerLastName: string;
}

interface TransactionsPayload {
  items: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface WithdrawalRow {
  id: number;
  amount: number;
  escrowFeePercent: number;
  escrowFeeAmount: number;
  netPayoutAmount: number;
  status: "pending" | "completed" | "failed" | "reversed";
  reference: string | null;
  createdAt: string;
  user: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  destination: {
    bankName: string | null;
    accountName: string | null;
    accountNumberMasked: string | null;
  };
  approval: {
    processing: boolean;
    rejectionReason: string | null;
  };
}

interface WithdrawalsPayload {
  items: WithdrawalRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface EscrowFeePayload {
  percent: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type MainTab = "finances" | "transactions" | "withdrawals" | "escrow_fee";
type FilterStatus = "all" | "paid" | "escrow";
type WithdrawalFilterStatus = "all" | "pending" | "completed" | "failed" | "reversed";

const PAGE_SIZE = 10;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(raw: string | Date) {
  const d = raw instanceof Date ? raw : new Date(raw);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", "")
    .toLowerCase();
  return `${date}, ${time}`;
}

function paymentStatusLabel(status: TransactionRow["paymentStatus"]): string {
  if (status === "completed") return "Paid";
  if (status === "in_escrow" || status === "pending") return "In Escrow";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  return "In Escrow";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Ensure JSON bodies are parsed by the API (Express depends on Content-Type).
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5 mt-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>
      <div className="flex items-center gap-1">
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={cn(
                "h-8 w-8 rounded-lg text-sm font-medium",
                p === page ? "bg-primary text-primary-foreground" : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#d1ece0]">
        <Wallet className="h-5 w-5 text-[#1a6b3f]" />
      </div>
      <div className="min-w-0">
        <div className="text-xl sm:text-2xl font-black text-gray-400 truncate">
          {formatNaira(Math.round(value))}
        </div>
        <div className="mt-0.5 text-xs sm:text-sm font-medium text-gray-700">{label}</div>
      </div>
    </div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────

function RevenueChart({
  data,
  year,
  onYearChange,
  loading,
}: {
  data: ChartPayload | null;
  year: number;
  onYearChange: (y: number) => void;
  loading: boolean;
}) {
  const [yearOpen, setYearOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setYearOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">Platform Earnings</span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
          {data && (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-black text-gray-800">
                {formatNaira(Math.round(data.total))}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  data.growthPct >= 0 ? "text-green-600" : "text-red-500",
                )}
              >
                {data.growthPct >= 0 ? "+" : ""}
                {data.growthPct}%
              </span>
            </div>
          )}
        </div>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setYearOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {year}
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
          {yearOpen && (
            <div className="absolute right-0 top-full mt-1 w-28 rounded-xl border border-gray-200 bg-white shadow-lg z-10 py-1">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => { onYearChange(y); setYearOpen(false); }}
                  className={cn(
                    "w-full px-4 py-2 text-sm text-left hover:bg-gray-50",
                    y === year ? "text-primary font-semibold" : "text-gray-700",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-56 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data?.series ?? []}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#15803d" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#15803d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`}
                width={40}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs">
                      <div className="font-bold text-gray-900">
                        {formatNaira(Math.round(Number(payload[0].value ?? 0)))}
                      </div>
                      <div className="text-gray-500">{label}</div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#15803d"
                strokeWidth={2.5}
                fill="url(#revenueGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#15803d" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Generate Modal ───────────────────────────────────────────────────────────

function GenerateModal({
  onClose,
  onDownload,
}: {
  onClose: () => void;
  onDownload: (type: "csv" | "pdf") => void;
}) {
  const [type, setType] = useState<"csv" | "pdf">("pdf");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h2 className="text-xl font-black text-gray-900 mb-5">Generate All</h2>

        <label className="block text-sm font-medium text-gray-500 mb-2">type</label>
        <div className="relative mb-5">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "csv" | "pdf")}
            className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>

        <button
          onClick={() => onDownload(type)}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Download
        </button>
      </div>
    </div>
  );
}

// ─── Finances Tab ─────────────────────────────────────────────────────────────

function FinancesTab() {
  const { toast } = useToast();
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [loadingChart, setLoadingChart] = useState(true);
  const [chartYear, setChartYear] = useState(CURRENT_YEAR);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const d = await apiFetch<FinanceStats>("/admin/finances/stats");
      setStats(d);
    } catch (err) {
      toast({ title: "Failed to load stats", description: String(err), variant: "destructive" });
    } finally {
      setLoadingStats(false);
    }
  }, [toast]);

  const loadChart = useCallback(async () => {
    setLoadingChart(true);
    try {
      const d = await apiFetch<ChartPayload>(`/admin/finances/chart?year=${chartYear}`);
      setChartData(d);
    } catch (err) {
      toast({ title: "Failed to load chart", description: String(err), variant: "destructive" });
    } finally {
      setLoadingChart(false);
    }
  }, [chartYear, toast]);

  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => { void loadChart(); }, [loadChart]);

  const STAT_CARDS = stats
    ? [
        { label: "Total Platform Earnings", value: stats.totalEarnings },
        { label: "Monthly Platform Earnings", value: stats.monthlyEarnings },
        { label: "Subscription Earnings", value: stats.subscriptionEarnings },
        { label: "Escrow Earnings", value: stats.escrowEarnings },
      ]
    : [];

  return (
    <div>
      <h2 className="text-lg sm:text-xl font-black text-gray-900 mb-5">Platform Earnings</h2>

      {loadingStats ? (
        <div>
          <div className="md:hidden -mx-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-3 px-1 py-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="min-w-[220px] rounded-2xl bg-gray-100 h-24 animate-pulse" />
              ))}
            </div>
          </div>
          <div className="hidden md:grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="md:hidden">
            <div className="-mx-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-3 px-1 py-1 snap-x snap-mandatory">
                {STAT_CARDS.map((card) => (
                  <div key={card.label} className="min-w-[220px] max-w-[240px] snap-start">
                    <StatCard label={card.label} value={card.value} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-4 gap-3">
            {STAT_CARDS.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} />
            ))}
          </div>
        </>
      )}

      <RevenueChart
        data={chartData}
        year={chartYear}
        onYearChange={setChartYear}
        loading={loadingChart}
      />
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const filterRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<TransactionsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status: filterStatus,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const d = await apiFetch<TransactionsPayload>(`/admin/finances/transactions?${params}`);
      setData(d);
    } catch (err) {
      toast({ title: "Failed to load transactions", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, debouncedSearch, toast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const downloadReceipt = async (row: TransactionRow) => {
    setDownloading(row.id);
    try {
      const d = await apiFetch<{ transaction: typeof row & { buyerEmail: string; sellerEmail: string; sellerPayout: number; paymentMethod: string | null } }>(
        `/admin/finances/transactions/${row.id}/receipt`,
      );
      const t = d.transaction;
      const lines = [
        "HUCE AUTOS — TRANSACTION RECEIPT",
        "================================",
        `Receipt No:       ${t.receiptNumber ?? `TXN-${t.id}`}`,
        `Date:             ${formatDateTime(t.createdAt)}`,
        "",
        `Vehicle:          ${t.listingYear} ${t.listingMake} ${t.listingModel}`,
        `Amount:           ${formatNaira(Math.round(t.amount))}`,
        `Platform Fee:     ${formatNaira(Math.round(t.platformFee))}`,
        `Seller Payout:    ${formatNaira(Math.round(t.sellerPayout))}`,
        `Payment Method:   ${t.paymentMethod ?? "Wallet"}`,
        `Status:           ${t.paymentStatus === "completed" ? "Paid" : "In Escrow"}`,
        "",
        `Buyer:            ${t.buyerFirstName} ${t.buyerLastName} (${t.buyerEmail})`,
        `Seller:           ${t.sellerFirstName} ${t.sellerLastName} (${t.sellerEmail})`,
        "",
        "Thank you for using Huce Autos.",
      ];
      downloadText(`receipt-${t.receiptNumber ?? t.id}.txt`, lines.join("\n"));
    } catch (err) {
      toast({ title: "Download failed", description: String(err), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handleGenerateAll = (type: "csv" | "pdf") => {
    setGenerateOpen(false);
    if (!data?.items.length) return;

    const headers = ["TXN ID", "Description", "Seller Name", "Amount (₦)", "Name", "Date", "Status"];
    const rows = data.items.map((t) => [
      String(t.id),
      `${t.listingYear} ${t.listingMake} ${t.listingModel}`,
      `${t.sellerFirstName} ${t.sellerLastName}`,
      String(Math.round(t.amount)),
      `${t.buyerFirstName} ${t.buyerLastName}`,
      formatDateTime(t.createdAt),
      paymentStatusLabel(t.paymentStatus),
    ]);

    if (type === "csv") {
      downloadCSV(`huce-transactions-${Date.now()}.csv`, rows, headers);
    } else {
      // PDF via print
      const html = `<html><head><title>Huce Autos Transactions</title>
<style>body{font-family:sans-serif;padding:24px}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5}</style>
</head><body>
<h1>HUCE AUTOS — Transaction Report</h1>
<p>Generated: ${new Date().toLocaleString()}</p>
<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
</table></body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.print(); }
    }
  };

  const STATUS_DOT: Record<string, { dot: string; text: string; label: string }> = {
    completed: { dot: "bg-green-500", text: "text-green-700", label: "Paid" },
    in_escrow: { dot: "bg-amber-400", text: "text-amber-700", label: "In-Escrow" },
    pending: { dot: "bg-amber-400", text: "text-amber-700", label: "In-Escrow" },
    failed: { dot: "bg-red-500", text: "text-red-600", label: "Failed" },
    refunded: { dot: "bg-gray-400", text: "text-gray-500", label: "Refunded" },
  };

  const FILTER_OPTIONS: { label: string; status: FilterStatus; dot: string }[] = [
    { label: "Paid", status: "paid", dot: "bg-green-500" },
    { label: "In-Escrow", status: "escrow", dot: "bg-amber-400" },
  ];

  return (
    <div>
      {generateOpen && (
        <GenerateModal
          onClose={() => setGenerateOpen(false)}
          onDownload={handleGenerateAll}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h2 className="text-lg sm:text-xl font-black text-gray-900 shrink-0">
          Transaction History
        </h2>
        <div className="flex-1 min-w-[160px] max-w-xs relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search here..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <button
          onClick={() => setGenerateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          Generate All
        </button>

        <div className="ml-auto relative shrink-0" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-gray-200 bg-white shadow-lg z-20 py-2">
              <button
                onClick={() => { setFilterStatus("all"); setFilterOpen(false); setPage(1); }}
                className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
              >
                All
              </button>
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.status}
                  onClick={() => { setFilterStatus(opt.status); setFilterOpen(false); setPage(1); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", opt.dot)} />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table — desktop */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-gray-500">No transactions found.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">TXN ID</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Seller Name</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Transaction Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const tone = STATUS_DOT[row.paymentStatus] ?? STATUS_DOT.pending;
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-4 font-mono text-gray-700 font-semibold">
                        {String(row.id).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-4 font-semibold text-gray-800">
                        {row.listingYear} {row.listingMake} {row.listingModel}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {row.sellerFirstName} {row.sellerLastName}
                      </td>
                      <td className="px-4 py-4 font-semibold text-gray-800">
                        {formatNaira(Math.round(row.amount))}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {row.buyerFirstName} {row.buyerLastName}
                      </td>
                      <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className={cn("inline-flex items-center gap-2", tone.text)}>
                          <span className={cn("h-2 w-2 rounded-full shrink-0", tone.dot)} />
                          <span className="font-medium">{tone.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => void downloadReceipt(row)}
                          disabled={downloading === row.id}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-60"
                        >
                          {downloading === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Download Transaction
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100">
            {data.items.map((row) => {
              const tone = STATUS_DOT[row.paymentStatus] ?? STATUS_DOT.pending;
              return (
                <div key={row.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-400 font-mono">
                        #{String(row.id).padStart(2, "0")}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-gray-800 truncate">
                        {row.listingYear} {row.listingMake} {row.listingModel}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        Seller: {row.sellerFirstName} {row.sellerLastName}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        Buyer: {row.buyerFirstName} {row.buyerLastName}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">{formatDateTime(row.createdAt)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-gray-800">{formatNaira(Math.round(row.amount))}</div>
                      <div className={cn("mt-1 inline-flex items-center gap-1.5 text-xs font-medium", tone.text)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                        {tone.label}
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={() => void downloadReceipt(row)}
                          disabled={downloading === row.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-60"
                        >
                          {downloading === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            page={page}
            total={data.total}
            pageSize={PAGE_SIZE}
            onChange={(p) => setPage(p)}
          />
        </>
      )}
    </div>
  );
}

function withdrawalStatusLabel(status: WithdrawalRow["status"]) {
  if (status === "pending") return "Pending";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Rejected";
}

function WithdrawalRequestsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<WithdrawalFilterStatus>("pending");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [data, setData] = useState<WithdrawalsPayload | null>(null);
  const [approveTarget, setApproveTarget] = useState<WithdrawalRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const payload = await apiFetch<WithdrawalsPayload>(`/admin/finances/withdrawals?${params}`);
      setData(payload);
    } catch (err) {
      toast({
        title: "Failed to load withdrawals",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const approve = async (row: WithdrawalRow) => {
    setActingId(row.id);
    try {
      await apiFetch<{ success: true }>(`/admin/finances/withdrawals/${row.id}/approve`, { method: "POST" });
      toast({ title: "Withdrawal approved", description: row.reference ?? `#${row.id}` });
      await loadData();
    } catch (err) {
      toast({
        title: "Approval failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActingId(null);
      setApproveTarget(null);
    }
  };

  const reject = async (row: WithdrawalRow, reason: string) => {
    if (!reason || !reason.trim()) return;
    setActingId(row.id);
    try {
      await apiFetch<{ success: true }>(`/admin/finances/withdrawals/${row.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast({ title: "Withdrawal rejected", description: row.reference ?? `#${row.id}` });
      await loadData();
    } catch (err) {
      toast({
        title: "Rejection failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActingId(null);
      setRejectTarget(null);
    }
  };

  const statusTone = (value: WithdrawalRow["status"]) => {
    if (value === "completed") return "text-green-700";
    if (value === "failed") return "text-red-700";
    if (value === "reversed") return "text-gray-600";
    return "text-amber-700";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h2 className="text-lg sm:text-xl font-black text-gray-900 shrink-0">Withdrawal Requests</h2>
        <div className="flex-1 min-w-[180px] max-w-sm relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user/reference..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as WithdrawalFilterStatus); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="reversed">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-gray-500">No withdrawal requests found.</p>
        </div>
      ) : (
        <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const isPending = row.status === "pending";
                  const disabled = actingId === row.id || row.approval.processing;
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-800">{row.reference ?? `WDR-${row.id}`}</div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        <div>{`${row.user.firstName ?? ""} ${row.user.lastName ?? ""}`.trim() || "Unknown User"}</div>
                        <div className="text-xs text-gray-500">{row.user.email ?? "-"}</div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        <div>{row.destination.bankName ?? "-"}</div>
                        <div className="text-xs text-gray-500">
                          {row.destination.accountName ?? "-"} {row.destination.accountNumberMasked ?? ""}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-gray-800">{formatNaira(Math.round(row.amount))}</td>
                      <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td className={`px-4 py-4 font-medium ${statusTone(row.status)}`}>{withdrawalStatusLabel(row.status)}</td>
                      <td className="px-4 py-4">
                        {isPending ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setApproveTarget(row)}
                              disabled={disabled}
                              className="inline-flex items-center gap-1 rounded-md border border-green-200 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectTarget(row)}
                              disabled={disabled}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Processed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden divide-y divide-gray-100">
            {data.items.map((row) => {
              const isPending = row.status === "pending";
              const disabled = actingId === row.id || row.approval.processing;
              return (
                <div key={row.id} className="py-4">
                  <div className="text-xs text-gray-400">{row.reference ?? `WDR-${row.id}`}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-800">
                    {`${row.user.firstName ?? ""} ${row.user.lastName ?? ""}`.trim() || "Unknown User"}
                  </div>
                  <div className="text-xs text-gray-500">{row.user.email ?? "-"}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {row.destination.bankName ?? "-"} · {row.destination.accountName ?? "-"} {row.destination.accountNumberMasked ?? ""}
                  </div>
                  <div className="mt-2 text-sm font-bold text-gray-800">{formatNaira(Math.round(row.amount))}</div>
                  <div className={`mt-1 text-xs font-medium ${statusTone(row.status)}`}>{withdrawalStatusLabel(row.status)}</div>
                  <div className="mt-2 text-xs text-gray-400">{formatDateTime(row.createdAt)}</div>
                  {isPending && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => setApproveTarget(row)}
                        disabled={disabled}
                        className="inline-flex items-center gap-1 rounded-md border border-green-200 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectTarget(row)}
                        disabled={disabled}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      <AppDialog
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve Withdrawal"
        subtitle="This will debit the seller wallet (gross) and initiate Paystack transfer (net)."
        size="sm"
        footer={(
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                if (approveTarget) void approve(approveTarget);
              }}
              disabled={!approveTarget || actingId === approveTarget?.id}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {approveTarget && actingId === approveTarget.id ? "Approving..." : "Approve"}
            </button>
            <button
              onClick={() => setApproveTarget(null)}
              disabled={!!approveTarget && actingId === approveTarget.id}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      >
        {approveTarget && (
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              Request: <span className="font-semibold text-gray-900">{approveTarget.reference ?? `WDR-${approveTarget.id}`}</span>
            </p>
            <p>
              Amount: <span className="font-semibold text-gray-900">{formatNaira(Math.round(approveTarget.amount))}</span>
            </p>
            <p>
              Escrow fee ({Math.round(approveTarget.escrowFeePercent)}%):{" "}
              <span className="font-semibold text-gray-900">{formatNaira(Math.round(approveTarget.escrowFeeAmount))}</span>
            </p>
            <p>
              Net payout: <span className="font-semibold text-gray-900">{formatNaira(Math.round(approveTarget.netPayoutAmount))}</span>
            </p>
            <p>
              Destination:{" "}
              <span className="font-semibold text-gray-900">
                {approveTarget.destination.bankName ?? "-"} · {approveTarget.destination.accountName ?? "-"} {approveTarget.destination.accountNumberMasked ?? ""}
              </span>
            </p>
          </div>
        )}
      </AppDialog>

      <TextPromptDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Withdrawal"
        description={`Provide rejection reason for ${rejectTarget?.reference ?? `WDR-${rejectTarget?.id ?? ""}`}.`}
        placeholder="Type rejection reason"
        confirmLabel="Reject Request"
        onConfirm={(reason) => {
          if (rejectTarget) void reject(rejectTarget, reason.trim());
        }}
      />
    </div>
  );
}

function EscrowFeeTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [percent, setPercent] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<EscrowFeePayload>("/admin/finances/escrow-fee");
      setPercent(String(payload.percent ?? 0));
    } catch (err) {
      toast({
        title: "Failed to load escrow fee",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const num = Number(percent);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      toast({
        title: "Invalid percentage",
        description: "Escrow fee must be between 0 and 100.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await apiFetch<{ success: true; percent: number }>("/admin/finances/escrow-fee", {
        method: "PUT",
        body: JSON.stringify({ percent: num }),
      });
      toast({
        title: "Escrow fee updated",
        description: `${num}% will apply to seller withdrawal payouts.`,
      });
      await load();
    } catch (err) {
      toast({
        title: "Failed to save escrow fee",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg sm:text-xl font-black text-gray-900 mb-5">Escrow Fee</h2>
      <div className="max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <label className="text-sm font-semibold text-gray-900">Fee Percentage (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          disabled={loading || saving}
          className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          placeholder="Enter percentage"
        />
        <p className="mt-2 text-xs text-gray-500">
          Applied to seller withdrawal gross amount at approval time. Wallet debit stays gross; Paystack transfer sends net amount.
        </p>
        <button
          onClick={() => void save()}
          disabled={loading || saving}
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Escrow Fee"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { key: MainTab; label: string }[] = [
  { key: "finances", label: "Finances" },
  { key: "transactions", label: "Transaction History" },
  { key: "withdrawals", label: "Withdrawal Requests" },
  { key: "escrow_fee", label: "Escrow Fee" },
];

export function AdminFinancesPage() {
  const [tab, setTab] = useState<MainTab>("finances");

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        <AdminLocalTabs
          tabs={TABS.map(({ key, label }) => ({ key, label }))}
          activeKey={tab}
          onChange={(key) => setTab(key as MainTab)}
        />

        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 overflow-hidden">
          {tab === "finances" && <FinancesTab />}
          {tab === "transactions" && <TransactionsTab />}
          {tab === "withdrawals" && <WithdrawalRequestsTab />}
          {tab === "escrow_fee" && <EscrowFeeTab />}
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminFinancesPage;
