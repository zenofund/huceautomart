import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Car as CarIcon,
  Store,
  ClipboardList,
  Ticket,
  Wallet,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronDown,
  CheckCircle2,
  Clock,
  XCircle,
  MoreHorizontal,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { AdminLayout } from "@/components/admin-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/format";
import { useAuth } from "@/context/auth-context";

const API_BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface AdminOverview {
  users: {
    total: number; buyers: number; sellers: number; inspectors: number;
    thisMonth: number; growthPct: number;
  };
  listings: { total: number; active: number; sold: number; pending: number };
  offers: { total: number; accepted: number };
  revenue: { total: number };
  inspections: { total: number; pending: number };
  tickets?: { total: number; resolved: number; unresolved: number };
}

interface RevenueTrend {
  year: number;
  series: { month: string; value: number }[];
  total: number;
  growthPct: number;
}

interface ListingsWeek {
  series: { day: string; value: number }[];
  total: number;
  changePct: number;
}

interface BestDealer {
  sellerId: number;
  sellerName: string;
  totalSold: number;
  totalUnsold: number;
  offers: number;
  earnings: number;
}

interface RecentTransaction {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  buyerFirstName: string | null;
  buyerLastName: string | null;
}

function StatCard({
  icon,
  label,
  value,
  badges,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badges?: { text: string; tone: "green" | "amber" | "red" }[];
  testId: string;
}) {
  const toneClasses: Record<string, string> = {
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
            {icon}
          </div>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
        <p className="text-3xl md:text-4xl font-black text-gray-900 leading-none mt-1">
          {value}
        </p>
      </div>
      {badges && badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((b, i) => (
            <span
              key={i}
              className={`text-[10px] font-medium px-2 py-0.5 rounded ${toneClasses[b.tone]}`}
            >
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GrowthPill({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span
      className={`text-xs font-semibold ml-2 ${positive ? "text-green-600" : "text-red-500"}`}
    >
      {positive ? "+" : ""}
      {pct}%
    </span>
  );
}

function RevenueChart({ data }: { data: RevenueTrend }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs">
                  <div className="font-bold text-gray-900">
                    {formatNaira(Number(payload[0].value ?? 0))}
                  </div>
                  <div className="text-gray-500">{label}</div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#15803d"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: "#15803d" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ListingsBarChart({ data }: { data: ListingsWeek }) {
  const max = Math.max(...data.series.map((d) => d.value), 1);
  const peakIndex = data.series.findIndex((d) => d.value === max);
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(34,197,94,0.05)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs">
                  <div className="font-bold text-gray-900">{payload[0].value}</div>
                  <div className="text-gray-500">{label}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.series.map((_, i) => (
              <Cell key={i} fill={i === peakIndex ? "#15803d" : "#dcfce7"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function txIcon(status: string) {
  if (status === "completed" || status === "accepted")
    return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (status === "failed" || status === "refunded" || status === "declined")
    return <XCircle className="h-5 w-5 text-red-500" />;
  return <Clock className="h-5 w-5 text-amber-500" />;
}

function formatDateTime(s: string) {
  const d = new Date(s);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [year] = useState(new Date().getFullYear());

  const stats = useQuery({
    queryKey: ["admin-stats-overview"],
    queryFn: () => fetchJSON<AdminOverview>("/admin/stats/overview"),
  });
  const revenueTrend = useQuery({
    queryKey: ["admin-revenue-trend", year],
    queryFn: () => fetchJSON<RevenueTrend>(`/admin/stats/revenue-trend?year=${year}`),
  });
  const listingsWeek = useQuery({
    queryKey: ["admin-listings-week"],
    queryFn: () => fetchJSON<ListingsWeek>("/admin/stats/listings-week"),
  });
  const bestDealers = useQuery({
    queryKey: ["admin-best-dealers"],
    queryFn: () => fetchJSON<BestDealer[]>("/admin/stats/best-dealers"),
  });
  const transactions = useQuery({
    queryKey: ["admin-recent-transactions"],
    queryFn: () => fetchJSON<RecentTransaction[]>("/admin/recent/transactions"),
  });

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        {/* Greeting */}
        <div className="mb-6">
          <h1
            className="text-2xl md:text-3xl font-black text-gray-900"
            data-testid="text-admin-greeting"
          >
            Hello, {user?.firstName ?? "Admin"} 👋
          </h1>
          <p className="text-sm text-gray-600 mt-1 font-medium">
            Monitor platform activity, manage users, and optimize performance in one place
          </p>
        </div>

        {/* Stat cards row 1 */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {stats.isLoading || !stats.data ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))
          ) : (
            <>
              <StatCard
                icon={<CarIcon className="h-5 w-5" />}
                label="Users (Buyers)"
                value={stats.data.users.buyers.toString()}
                testId="card-users-buyers"
              />
              <StatCard
                icon={<Store className="h-5 w-5" />}
                label="Users (Sellers)"
                value={stats.data.users.sellers.toString()}
                testId="card-users-sellers"
              />
              <StatCard
                icon={<ClipboardList className="h-5 w-5" />}
                label="Users (Inspector)"
                value={stats.data.users.inspectors.toString()}
                testId="card-users-inspectors"
              />
              <StatCard
                icon={<Store className="h-5 w-5" />}
                label="Total Listings"
                value={stats.data.listings.total.toString()}
                badges={[
                  { text: `${stats.data.listings.active} Active Listings`, tone: "green" },
                  { text: `${stats.data.listings.pending} Pending Listings`, tone: "amber" },
                  { text: `${stats.data.listings.sold} Sold Listings`, tone: "red" },
                ]}
                testId="card-total-listings"
              />
            </>
          )}
        </section>

        {/* Stat cards row 2 */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.isLoading || !stats.data ? (
            <>
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </>
          ) : (
            <>
              <StatCard
                icon={<Ticket className="h-5 w-5" />}
                label="Tickets"
                value={(stats.data.tickets?.total ?? 0).toString()}
                badges={[
                  { text: `${stats.data.tickets?.resolved ?? 0} Resolved`, tone: "green" },
                  { text: `${stats.data.tickets?.unresolved ?? 0} Unresolved`, tone: "amber" },
                ]}
                testId="card-tickets"
              />
              <StatCard
                icon={<Wallet className="h-5 w-5" />}
                label="Platform Earnings"
                value={formatNaira(stats.data.revenue.total)}
                testId="card-revenue"
              />
            </>
          )}
        </section>

        {/* Diagnostics heading */}
        <h2 className="text-base font-bold text-gray-900 mb-3">Diagnostics</h2>

        {/* Charts row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {/* Overall Revenue */}
          <div
            className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
            data-testid="panel-revenue-chart"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-bold text-gray-900">Platform Earnings</h3>
                <div className="flex items-baseline mt-1">
                  <span className="text-xl font-black text-gray-900">
                    {revenueTrend.data ? formatNaira(revenueTrend.data.total) : "—"}
                  </span>
                  {revenueTrend.data && <GrowthPill pct={revenueTrend.data.growthPct} />}
                </div>
              </div>
              <button className="flex items-center gap-1 text-xs text-gray-600 px-3 py-1.5 border border-gray-200 rounded-md">
                {year} <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            {revenueTrend.isLoading || !revenueTrend.data ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <RevenueChart data={revenueTrend.data} />
            )}
          </div>

          {/* Car Listings Cart */}
          <div
            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
            data-testid="panel-listings-chart"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-bold text-gray-900">Car Listings Cart</h3>
                <div className="flex items-baseline mt-1">
                  <span className="text-xl font-black text-gray-900">
                    {listingsWeek.data ? listingsWeek.data.total.toLocaleString() : "—"}
                  </span>
                  {listingsWeek.data && <GrowthPill pct={listingsWeek.data.changePct} />}
                </div>
              </div>
              <button className="flex items-center gap-1 text-xs text-gray-600 px-3 py-1.5 border border-gray-200 rounded-md">
                This Week <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            {listingsWeek.isLoading || !listingsWeek.data ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ListingsBarChart data={listingsWeek.data} />
            )}
          </div>
        </section>

        {/* Tables row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Best Dealers */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Best Dealer(Seller)</h3>
              <button className="flex items-center gap-1 text-xs text-gray-600 px-3 py-1.5 border border-gray-200 rounded-md">
                <Calendar className="h-3 w-3" />
                Last 30 days
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr className="text-xs text-gray-500">
                    <th className="px-5 py-3 font-medium">Seller Name</th>
                    <th className="px-3 py-3 font-medium">Total Car Sold</th>
                    <th className="px-3 py-3 font-medium">Total Car Unsold</th>
                    <th className="px-3 py-3 font-medium">Offers</th>
                    <th className="px-5 py-3 font-medium text-right">Total Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bestDealers.isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-5 py-4" colSpan={5}>
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : bestDealers.data && bestDealers.data.length > 0 ? (
                    bestDealers.data.map((d) => (
                      <tr key={d.sellerId} data-testid={`row-dealer-${d.sellerId}`}>
                        <td className="px-5 py-3 flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {(d.sellerName ?? "?").slice(0, 1).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900 truncate">
                            {d.sellerName}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{d.totalSold}</td>
                        <td className="px-3 py-3 text-gray-700">{d.totalUnsold}</td>
                        <td className="px-3 py-3 text-gray-700">{d.offers}</td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900">
                          {formatNaira(d.earnings)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-5 py-12 text-center text-sm text-gray-500" colSpan={5}>
                        No dealer activity yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transaction history */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Transaction history</h3>
              <button aria-label="More options">
                <MoreHorizontal className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {transactions.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4">
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))
              ) : transactions.data && transactions.data.length > 0 ? (
                transactions.data.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-5 py-3"
                    data-testid={`row-tx-${t.id}`}
                  >
                    <div className="shrink-0">{txIcon(t.status)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        Payment from{" "}
                        <span className="text-primary">
                          #{String(t.id).padStart(4, "0")}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">{formatDateTime(t.createdAt)}</p>
                    </div>
                    <span
                      className={`text-sm font-bold shrink-0 ${
                        t.status === "declined" || t.status === "failed" || t.status === "refunded"
                          ? "text-gray-400 line-through"
                          : "text-gray-900"
                      }`}
                    >
                      {formatNaira(t.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-gray-500">No transactions yet</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
