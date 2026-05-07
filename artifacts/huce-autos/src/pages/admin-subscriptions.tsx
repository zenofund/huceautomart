import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

interface SubscriptionPlan {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  maxListings: number;
  maxPhotos: number;
  featuredListingEnabled: boolean;
  analyticsDashboardEnabled: boolean;
  features: string[];
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  activeSubscribers: number;
}

interface PlanListResponse {
  plans: SubscriptionPlan[];
  total: number;
  page: number;
  totalPages: number;
}

interface PlanForm {
  name: string;
  description: string;
  price: string;
  durationDays: string;
  maxListings: string;
  maxPhotos: string;
  featuredListingEnabled: boolean;
  analyticsDashboardEnabled: boolean;
  otherFeatures: string;
  isFeatured: boolean;
  isActive: boolean;
}

const BLANK_FORM: PlanForm = {
  name: "",
  description: "",
  price: "",
  durationDays: "30",
  maxListings: "10",
  maxPhotos: "5",
  featuredListingEnabled: false,
  analyticsDashboardEnabled: false,
  otherFeatures: "",
  isFeatured: false,
  isActive: true,
};

function planToForm(p: SubscriptionPlan): PlanForm {
  return {
    name: p.name,
    description: p.description ?? "",
    price: String(p.price),
    durationDays: String(p.durationDays),
    maxListings: String(p.maxListings),
    maxPhotos: String(p.maxPhotos),
    featuredListingEnabled: p.featuredListingEnabled,
    analyticsDashboardEnabled: p.analyticsDashboardEnabled,
    otherFeatures: (p.features ?? []).join("\n"),
    isFeatured: p.isFeatured,
    isActive: p.isActive,
  };
}

function formToPayload(f: PlanForm) {
  return {
    name: f.name.trim(),
    description: f.description.trim() || undefined,
    price: parseFloat(f.price),
    durationDays: parseInt(f.durationDays),
    maxListings: parseInt(f.maxListings),
    maxPhotos: parseInt(f.maxPhotos),
    featuredListingEnabled: f.featuredListingEnabled,
    analyticsDashboardEnabled: f.analyticsDashboardEnabled,
    features: f.otherFeatures
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    isFeatured: f.isFeatured,
    isActive: f.isActive,
  };
}

function formatDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + ", " + dt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

function featuresSummary(plan: SubscriptionPlan): string {
  const parts: string[] = [];
  parts.push(`${plan.maxListings} active listing${plan.maxListings !== 1 ? "s" : ""}`);
  parts.push(`${plan.durationDays}-day duration`);
  if (plan.featuredListingEnabled) parts.push("Featured placement");
  if (plan.analyticsDashboardEnabled) parts.push("Analytics");
  plan.features.slice(0, 2).forEach((f) => parts.push(f));
  const str = parts.join(" • ");
  return str.length > 60 ? str.slice(0, 58) + "…" : str;
}

// ─── Add/Edit Dialog ──────────────────────────────────────────────────────────

function PlanDialog({
  open,
  editPlan,
  onClose,
}: {
  open: boolean;
  editPlan: SubscriptionPlan | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PlanForm>(editPlan ? planToForm(editPlan) : BLANK_FORM);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!editPlan;

  // Keep form values in sync with the selected plan when opening/editing.
  useEffect(() => {
    if (!open) return;
    setForm(editPlan ? planToForm(editPlan) : BLANK_FORM);
    setError(null);
  }, [open, editPlan]);

  const save = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) =>
      fetchJSON(
        isEdit ? `/admin/subscription-plans/${editPlan!.id}` : "/admin/subscription-plans",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError("Plan Name is required"); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { setError("Enter a valid price (0 for free)"); return; }
    const days = parseInt(form.durationDays);
    if (isNaN(days) || days < 1) { setError("Duration must be at least 1 day"); return; }
    const max = parseInt(form.maxListings);
    if (isNaN(max) || max < 0) { setError("Max listings must be 0 or more"); return; }
    save.mutate(formToPayload(form));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        <form onSubmit={submit} className="px-6 pb-6 space-y-5">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? "Edit Subscription Plan" : "Add Subscription Plan"}
          </h2>

          {/* Plan Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name</label>
            <input
              type="text"
              placeholder="Enter Plan Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Plan Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan Price (₦)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter Plan Price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Gated flags */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Plan Features (flags)
            </p>

            {/* Max active listings */}
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                value={form.maxListings}
                onChange={(e) => setForm({ ...form, maxListings: e.target.value })}
                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-sm text-gray-700">active listings</span>
            </div>

            {/* Max listing photos */}
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="50"
                value={form.maxPhotos}
                onChange={(e) => setForm({ ...form, maxPhotos: e.target.value })}
                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-sm text-gray-700">listing photos</span>
            </div>

            {/* Featured listing placement */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.featuredListingEnabled}
                onChange={(e) => setForm({ ...form, featuredListingEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
              />
              <span className="text-sm text-gray-700">Featured listing placement</span>
            </label>

            {/* Listing duration */}
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                value={form.durationDays}
                onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-sm text-gray-700">-day listing duration</span>
            </div>

            {/* Analytics dashboard */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.analyticsDashboardEnabled}
                onChange={(e) => setForm({ ...form, analyticsDashboardEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
              />
              <span className="text-sm text-gray-700">Analytics dashboard (User dashboard stats)</span>
            </label>
          </div>

          {/* Featured Plan */}
          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
              className="h-4 w-4 rounded border-amber-300 text-amber-500 focus:ring-amber-300"
            />
            <div>
              <p className="text-sm font-semibold text-amber-800">Featured / Recommended Plan</p>
              <p className="text-xs text-amber-600">Shows a prominent "Recommended" badge on the Sell page</p>
            </div>
          </label>

          {/* Other features */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Other Features
              <span className="text-xs text-gray-400 font-normal ml-1">(one per line)</span>
            </label>
            <textarea
              rows={4}
              placeholder="Enter Features"
              value={form.otherFeatures}
              onChange={(e) => setForm({ ...form, otherFeatures: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-gray-700">Plan is active</span>
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={save.isPending}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isEdit ? "Save Changes" : "Proceed"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AdminSubscriptionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<SubscriptionPlan | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<PlanListResponse>({
    queryKey: ["admin-subscription-plans", debouncedSearch, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page) });
      if (debouncedSearch) p.set("search", debouncedSearch);
      return fetchJSON(`/admin/subscription-plans?${p}`);
    },
  });

  const del = useMutation({
    mutationFn: (id: number) =>
      fetchJSON(`/admin/subscription-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      setDeleteId(null);
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      fetchJSON(`/admin/subscription-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] }),
  });

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
    clearTimeout((handleSearch as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
      () => setDebouncedSearch(val),
      350,
    );
  }

  function openAdd() {
    setEditPlan(null);
    setDialogOpen(true);
  }

  function openEdit(plan: SubscriptionPlan) {
    setEditPlan(plan);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditPlan(null);
  }

  const plans = data?.plans ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  function renderPagination() {
    const pages: (number | "…")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, 2, 3, "…", 8, 9, 10);
    }
    return pages;
  }

  return (
    <AdminLayout>
      <PlanDialog open={dialogOpen} editPlan={editPlan} onClose={closeDialog} />

      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        <AdminLocalTabs
          tabs={[{ key: "plans", label: "Plans" }]}
          activeKey="plans"
          onChange={() => {}}
        />

        {/* Content card */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Card header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-5 border-b border-gray-100">
            <h2 className="text-lg font-black text-gray-900 shrink-0">
              Subscription Plan{" "}
              <span className="text-gray-400 font-normal">({total})</span>
            </h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search here..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={openAdd}
                className="flex items-center justify-center gap-2 bg-primary text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Add Subscription Plan
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-4 text-gray-500 font-medium">ID</th>
                  <th className="text-left px-6 py-4 text-gray-500 font-medium">Plan Name</th>
                  <th className="text-left px-6 py-4 text-gray-500 font-medium">Price</th>
                  <th className="text-left px-6 py-4 text-gray-500 font-medium">Features Overview</th>
                  <th className="text-left px-6 py-4 text-gray-500 font-medium">Active Subscribers</th>
                  <th className="text-left px-6 py-4 text-gray-500 font-medium">Date Created</th>
                  <th className="text-left px-6 py-4 text-gray-500 font-medium">Status</th>
                  <th className="px-6 py-4 text-gray-500 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : plans.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-gray-400 text-sm">
                        No subscription plans found.
                      </td>
                    </tr>
                  )
                  : plans.map((plan) => (
                      <tr key={plan.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-gray-500">{plan.id}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{plan.name}</span>
                            {plan.isFeatured && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                                ★ Recommended
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          ₦{plan.price.toLocaleString("en-NG")}
                        </td>
                        <td className="px-6 py-4 text-gray-500 max-w-xs truncate">
                          {featuresSummary(plan)}
                        </td>
                        <td className="px-6 py-4 text-gray-700">{plan.activeSubscribers}</td>
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                          {formatDate(plan.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() =>
                              toggleActive.mutate({ id: plan.id, isActive: !plan.isActive })
                            }
                            className="flex items-center gap-2 group"
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                                plan.isActive ? "bg-green-500" : "bg-red-400"
                              }`}
                            />
                            <span
                              className={`text-sm font-medium ${
                                plan.isActive
                                  ? "text-green-700 group-hover:text-green-900"
                                  : "text-red-500 group-hover:text-red-700"
                              } transition-colors`}
                            >
                              {plan.isActive ? "Active" : "Non-active"}
                            </span>
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(plan)}
                              className="p-1.5 text-gray-400 hover:text-primary transition-colors rounded-lg hover:bg-primary/5"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {deleteId === plan.id ? (
                              <span className="flex items-center gap-1.5">
                                <button
                                  onClick={() => del.mutate(plan.id)}
                                  disabled={del.isPending}
                                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                                >
                                  {del.isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    "Confirm"
                                  )}
                                </button>
                                <button
                                  onClick={() => setDeleteId(null)}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteId(plan.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <div className="flex items-center gap-1">
                {renderPagination().map((p, i) =>
                  p === "…" ? (
                    <span key={i} className="px-2 text-gray-400 text-sm">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === p
                          ? "bg-primary text-white"
                          : "text-gray-600 hover:bg-gray-100"
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
                className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
