import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const API_BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

type Role = "buyer" | "seller" | "inspector";
type StatusFilter = "" | "active" | "inactive" | "suspended";

interface AdminUserRow {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  profilePhotoUrl: string | null;
  createdAt: string;
  metric1: number;
  metric2: number;
  businessName: string | null;
  officeName: string | null;
}

interface UsersResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

const TABS: { value: Role; label: string }[] = [
  { value: "buyer", label: "Buyers" },
  { value: "seller", label: "Sellers" },
  { value: "inspector", label: "Inspector" },
];

const ROLE_LABELS: Record<Role, { title: string; metric1: string; metric2: string }> = {
  buyer: {
    title: "Buyers",
    metric1: "Offers Submitted",
    metric2: "Total Purchases",
  },
  seller: {
    title: "Sellers",
    metric1: "Total Listings",
    metric2: "Cars Sold",
  },
  inspector: {
    title: "Inspectors",
    metric1: "Total Assigned Inspection",
    metric2: "Completed",
  },
};

function formatDate(s: string) {
  const d = new Date(s);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date}, ${time.toLowerCase().replace(" ", "")}`;
}

function StatusDot({ status }: { status: string }) {
  const isActive = status === "active";
  const color = isActive ? "bg-green-500" : "bg-red-500";
  const label = isActive ? "Active" : "Non-active";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800 whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function pageNumbers(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const first = 1;
  const last = totalPages;
  const around = [current - 1, current, current + 1].filter(
    (p) => p > first && p < last,
  );
  const seq: (number | "…")[] = [first];
  if ((around[0] ?? last) > first + 1) seq.push("…");
  for (const p of around) seq.push(p);
  if ((around[around.length - 1] ?? first) < last - 1) seq.push("…");
  seq.push(last);
  return seq;
}

export default function AdminUsersPage() {
  const [, setLocation] = useLocation();
  const [role, setRole] = useState<Role>("buyer");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const labels = ROLE_LABELS[role];

  const query = useQuery({
    queryKey: ["admin-users", role, search, statusFilter, page, pageSize],
    queryFn: () =>
      fetchJSON<UsersResponse>(
        `/admin/users?role=${role}&search=${encodeURIComponent(search)}&status=${statusFilter}&page=${page}&pageSize=${pageSize}`,
      ),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = query.data?.items ?? [];

  const pages = useMemo(() => pageNumbers(page, totalPages), [page, totalPages]);

  function changeTab(v: Role) {
    setRole(v);
    setPage(1);
    setSearch("");
    setStatusFilter("");
  }

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        {/* Tabs */}
        <AdminLocalTabs
          tabs={TABS.map((t) => ({ key: t.value, label: t.label }))}
          activeKey={role}
          onChange={(key) => changeTab(key as Role)}
          getButtonTestId={(key) => `tab-${key}`}
        />

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Header: title + search + filter */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-gray-100">
            <h2 className="text-lg font-black text-gray-900 shrink-0" data-testid="text-users-title">
              {labels.title} ({total})
            </h2>
            <div className="relative flex-1 min-w-0 sm:max-w-md sm:mx-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search here..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                data-testid="input-search-users"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 hover:bg-gray-50 self-start sm:self-auto"
                  data-testid="button-filter"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filter
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-2">
                {[
                  { v: "" as StatusFilter, label: "All", dot: "bg-gray-300" },
                  { v: "active" as StatusFilter, label: "Active", dot: "bg-green-500" },
                  { v: "inactive" as StatusFilter, label: "Non-active", dot: "bg-red-500" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      setStatusFilter(opt.v);
                      setPage(1);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 hover:bg-gray-50 ${
                      statusFilter === opt.v ? "bg-gray-50 font-semibold" : ""
                    }`}
                    data-testid={`filter-status-${opt.label.toLowerCase()}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Scrollable table (mobile + desktop) */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">ID</th>
                  <th className="px-3 py-3 font-medium">{labels.title.slice(0, -1)} Name</th>
                  {role === "seller" && (
                    <th className="px-3 py-3 font-medium">Business Name</th>
                  )}
                  {role === "inspector" && (
                    <th className="px-3 py-3 font-medium">Office Name</th>
                  )}
                  <th className="px-3 py-3 font-medium">Email Address</th>
                  <th className="px-3 py-3 font-medium">Phone Number</th>
                  <th className="px-3 py-3 font-medium">{labels.metric1}</th>
                  {role === "buyer" && (
                    <th className="px-3 py-3 font-medium">{labels.metric2}</th>
                  )}
                  <th className="px-3 py-3 font-medium">Registration Date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {query.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="p-4">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-sm text-gray-500">
                      No {labels.title.toLowerCase()} found
                    </td>
                  </tr>
                ) : (
                  items.map((u) => (
                    <tr
                      key={u.id}
                      data-testid={`row-user-${u.id}`}
                      onClick={() => setLocation(`/admin/users/${u.id}`)}
                      className="hover:bg-gray-50/50 cursor-pointer"
                    >
                      <td className="px-5 py-4 text-gray-500 font-medium">{u.id}</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            {u.profilePhotoUrl && (
                              <AvatarImage src={u.profilePhotoUrl} alt="" />
                            )}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {(u.firstName?.[0] ?? "?")}{(u.lastName?.[0] ?? "")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-gray-900 truncate">
                            {`${u.firstName} ${u.lastName}`.trim() || "—"}
                          </span>
                        </div>
                      </td>
                      {role === "seller" && (
                        <td className="px-3 py-4 text-gray-700 truncate max-w-[180px]">
                          {u.businessName ?? "—"}
                        </td>
                      )}
                      {role === "inspector" && (
                        <td className="px-3 py-4 text-gray-700 truncate max-w-[180px]">
                          {u.officeName ?? "—"}
                        </td>
                      )}
                      <td className="px-3 py-4 text-gray-700 truncate max-w-[200px]">{u.email}</td>
                      <td className="px-3 py-4 text-gray-700 whitespace-nowrap">{u.phone ?? "—"}</td>
                      <td className="px-3 py-4 text-gray-700">{u.metric1}</td>
                      {role === "buyer" && (
                        <td className="px-3 py-4 text-gray-700">{u.metric2}</td>
                      )}
                      <td className="px-3 py-4 text-gray-700 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                      <td className="px-5 py-4">
                        <StatusDot status={u.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50 order-2 sm:order-1"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <div className="flex items-center gap-1 order-1 sm:order-2 flex-wrap justify-center">
                {pages.map((p, i) =>
                  p === "…" ? (
                    <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      data-testid={`button-page-${p}`}
                      className={`min-w-[34px] h-8 px-2 rounded text-sm font-medium ${
                        p === page
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="button-next-page"
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50 order-3"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
