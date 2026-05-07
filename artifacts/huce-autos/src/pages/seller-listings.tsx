import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { AppDialog } from "@/components/app-dialog";
import { DeleteListingDialog } from "@/components/dialogs/delete-listing-dialog";
import {
  AddListingDialog,
  type ListingForEdit,
} from "@/components/dialogs/add-listing-dialog";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDashboardNav } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ───────────────────────────────────────────────────────────────────
type ListingStatus = "active" | "sold" | "pending" | "suspended" | "deleted";

interface ApiListing {
  id: number;
  title: string | null;
  make: string;
  model: string;
  year: number;
  price: number;
  status: ListingStatus;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ListingsResponse {
  listings: ApiListing[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface CountsResponse {
  counts: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatNaira(amount: number): string {
  return `\u20A6${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  const min = m.toString().padStart(2, "0");
  return `${date},${h}:${min}${ampm}`;
}

function padId(id: number): string {
  return id.toString().padStart(2, "0");
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type TabKey = "active" | "sold";

const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "sold", label: "Sold" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SellerListingsPage() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { navItems } = useDashboardNav();

  const [tab, setTab] = useState<TabKey>("active");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [listings, setListings] = useState<ApiListing[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  });
  const [counts, setCounts] = useState<Record<string, number>>({
    active: 0,
    sold: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ApiListing | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editTarget, setEditTarget] = useState<ListingForEdit | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [sellerVerified, setSellerVerified] = useState<boolean>(true);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [planLimits, setPlanLimits] = useState<{
    maxPhotos: number;
    maxListings: number;
    planName: string;
    featuredListingEnabled: boolean;
  } | null>(null);

  // Fetch seller plan limits so we can enforce them in the listing dialog and UI
  useEffect(() => {
    if (!user || user.role !== "seller") return;
    fetch("/api/me/subscription", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const plan = data?.subscription?.plan;
        if (plan) {
          setPlanLimits({
            maxPhotos: plan.maxPhotos ?? 20,
            maxListings: plan.maxListings ?? 1,
            planName: plan.name ?? "Free",
            featuredListingEnabled: plan.featuredListingEnabled ?? false,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "seller") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sellers/me/profile", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: { isVerified?: boolean | null } | null };
        if (cancelled) return;
        setSellerVerified(Boolean(data.profile?.isVerified));
      } catch {
        // Keep default true to avoid blocking normal sellers if this helper call fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (user === null) {
      navigate("/sign-in");
    } else if (user && user.role !== "seller") {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  // Debounce the search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on tab change
  useEffect(() => {
    setPage(1);
  }, [tab]);

  // Fetch listings + counts
  useEffect(() => {
    if (!user || user.role !== "seller") return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({
          status: tab,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const [listRes, countsRes] = await Promise.all([
          fetch(`/api/listings/me?${params.toString()}`, {
            credentials: "include",
          }),
          fetch(`/api/listings/me/counts`, { credentials: "include" }),
        ]);
        if (!listRes.ok) {
          const errJson = (await listRes.json().catch(() => null)) as
            | { error?: string; code?: string }
            | null;
          if (listRes.status === 403 && errJson?.code === "SELLER_NOT_VERIFIED") {
            if (cancelled) return;
            setVerificationMessage(
              "Your seller account is currently unverified. Admin approval is required before you can view or create listings.",
            );
            setListings([]);
            setPagination((prev) => ({ ...prev, total: 0, totalPages: 1, page: 1 }));
            setLoading(false);
            return;
          }
          throw new Error(errJson?.error ?? "Failed to load listings");
        }
        const listJson = (await listRes.json()) as ListingsResponse;
        const countsJson = countsRes.ok
          ? ((await countsRes.json()) as CountsResponse)
          : { counts: {} };
        if (cancelled) return;
        setVerificationMessage(null);
        setListings(listJson.listings);
        setPagination(listJson.pagination);
        setCounts(countsJson.counts);
      } catch (err) {
        if (cancelled) return;
        toast({
          title: "Couldn't load listings",
          description: err instanceof Error ? err.message : "Try again.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, tab, page, debouncedSearch, toast, refreshKey]);

  if (!user || user.role !== "seller") return null;

  const dashboardUser: DashboardUser = {
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      "Seller",
    email: user.email ?? "",
    avatarUrl: user.profilePhotoUrl ?? undefined,
  };

  async function handleSetStatus(
    listing: ApiListing,
    next: "active" | "sold",
  ) {
    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast({
        title: next === "sold" ? "Marked as sold" : "Re-listed as active",
        description: `Listing #${padId(listing.id)} updated.`,
      });
      // Optimistic local update — listing leaves the current tab.
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
      setCounts((prev) => ({
        ...prev,
        [listing.status]: Math.max(0, (prev[listing.status] ?? 1) - 1),
        [next]: (prev[next] ?? 0) + 1,
      }));
      setPagination((p) => ({
        ...p,
        total: Math.max(0, p.total - 1),
      }));
    } catch (err) {
      toast({
        title: "Couldn't update listing",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/listings/${deleteTarget.id}/deletion-request`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error ?? "Request failed");
      }
      toast({
        title: "Deletion request sent",
        description: `Listing #${padId(
          deleteTarget.id,
        )} is awaiting admin approval.`,
      });
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title: "Couldn't submit deletion request",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleOpenEdit(l: ApiListing) {
    setEditLoading(true);
    try {
      const res = await fetch(`/api/listings/${l.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Couldn't load listing");
      const json = (await res.json()) as {
        listing: ListingForEdit;
        features?: { id: number }[];
        images?: Array<{ url: string; mediaType: "image" | "video"; fileName: string | null }>;
      };
      setEditTarget({
        ...json.listing,
        featureIds: (json.features ?? []).map((f) => f.id),
        images: json.images ?? [],
      });
    } catch (err) {
      toast({
        title: "Couldn't open editor",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setEditLoading(false);
    }
  }

  const tabCount = counts[tab] ?? 0;
  const startIdx = (pagination.page - 1) * pagination.pageSize;
  const addListingLockedByVerification = !sellerVerified || !!verificationMessage;
  const addListingLockedByPlan = !!(
    planLimits &&
    (counts.active ?? 0) >= planLimits.maxListings
  );
  const addListingDisabled = addListingLockedByVerification || addListingLockedByPlan;
  const pageNumbers = useMemo(
    () => buildPageNumbers(pagination.page, pagination.totalPages),
    [pagination.page, pagination.totalPages],
  );

  return (
    <DashboardLayout
      user={dashboardUser}
      navItems={navItems}
      title="My Listings"
      onLogout={async () => {
        await logout();
        navigate("/");
      }}
    >
      {/* Header — title style matches buyer dashboard pages */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-gray-900">
            My Listings
          </h1>
          {planLimits && (
            <p className={cn(
              "text-xs mt-0.5",
              (counts.active ?? 0) >= planLimits.maxListings ? "text-red-500 font-medium" : "text-gray-400",
            )}>
              {counts.active ?? 0} / {planLimits.maxListings} listing{planLimits.maxListings !== 1 ? "s" : ""} used ({planLimits.planName} plan)
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (addListingLockedByVerification) {
              toast({
                title: "Seller verification required",
                description:
                  "Your account is unverified. Wait for admin approval to add new listings.",
                variant: "destructive",
              });
              return;
            }
            if (addListingLockedByPlan) {
              toast({
                title: "Listing limit reached",
                description: `Your ${planLimits.planName} plan allows ${planLimits.maxListings} active listing${planLimits.maxListings !== 1 ? "s" : ""}. Upgrade your plan to add more.`,
                variant: "destructive",
              });
              return;
            }
            setAddOpen(true);
          }}
          disabled={addListingDisabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors",
            addListingDisabled
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-primary hover:bg-primary/90",
          )}
          data-testid="button-add-listing"
        >
          <Plus className="h-4 w-4" />
          Add New Listing
        </button>
      </div>

      {verificationMessage && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <p className="flex items-start gap-2 text-sm font-medium">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{verificationMessage}</span>
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative pb-3 text-sm font-semibold transition-colors text-left",
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

      {/* Title row + search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-extrabold text-gray-900">
          {tab === "active" ? "Active" : "Sold"}({tabCount})
        </h2>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search here..."
            className="w-full rounded-full border border-gray-200 bg-white pl-9 pr-4 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            data-testid="input-search-listings"
          />
        </div>
      </div>

      {/* Spreadsheet table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
              <th className="py-3 pr-4 font-medium w-[80px]">Listing ID</th>
              <th className="py-3 pr-4 font-medium">Car Make</th>
              <th className="py-3 pr-4 font-medium">Car Model</th>
              <th className="py-3 pr-4 font-medium">Amount</th>
              <th className="py-3 pr-4 font-medium">Upload Date</th>
              <th className="py-3 pr-4 font-medium">Views</th>
              <th className="py-3 pr-4 font-medium">Listing Status</th>
              <th className="py-3 pr-2 font-medium text-right w-[60px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <Loader2 className="inline h-5 w-5 animate-spin text-gray-400" />
                </td>
              </tr>
            ) : listings.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-500">
                  {debouncedSearch
                    ? `No ${tab} listings match "${debouncedSearch}".`
                    : `No ${tab} listings yet.`}
                </td>
              </tr>
            ) : (
              listings.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                  data-testid={`row-listing-${l.id}`}
                >
                  <td className="py-4 pr-4 text-gray-700">{padId(l.id)}</td>
                  <td className="py-4 pr-4 text-gray-700">{l.make}</td>
                  <td className="py-4 pr-4 text-gray-700">
                    {l.model || l.year}
                  </td>
                  <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                    {formatNaira(l.price)}
                  </td>
                  <td className="py-4 pr-4 text-gray-700 whitespace-nowrap">
                    {formatUploadDate(l.createdAt)}
                  </td>
                  <td className="py-4 pr-4 text-gray-700">
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-gray-400" />
                      {l.viewCount}
                    </span>
                  </td>
                  <td className="py-4 pr-4 text-gray-700">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          l.status === "active" && "bg-emerald-500",
                          l.status === "sold" && "bg-gray-400",
                          l.status === "pending" && "bg-amber-500",
                          l.status === "suspended" && "bg-red-500",
                        )}
                      />
                      <span className="capitalize">{l.status}</span>
                    </span>
                  </td>
                  <td className="py-4 pr-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                          aria-label="Open actions menu"
                          data-testid={`button-actions-${l.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-40 rounded-xl"
                      >
                        <DropdownMenuItem
                          onClick={() => handleOpenEdit(l)}
                          className="gap-2 text-sm cursor-pointer"
                          data-testid={`menu-edit-${l.id}`}
                          disabled={editLoading}
                        >
                          <Pencil className="h-4 w-4 text-gray-500" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => navigate(`/seller/listings/${l.id}`)}
                          className="gap-2 text-sm cursor-pointer"
                          data-testid={`menu-view-${l.id}`}
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                          View
                        </DropdownMenuItem>
                        {l.status === "active" ? (
                          <DropdownMenuItem
                            onClick={() => handleSetStatus(l, "sold")}
                            className="gap-2 text-sm cursor-pointer"
                            data-testid={`menu-mark-sold-${l.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4 text-gray-500" />
                            Mark as Sold
                          </DropdownMenuItem>
                        ) : l.status === "sold" ? (
                          <DropdownMenuItem
                            onClick={() => handleSetStatus(l, "active")}
                            className="gap-2 text-sm cursor-pointer"
                            data-testid={`menu-relist-${l.id}`}
                          >
                            <RotateCcw className="h-4 w-4 text-gray-500" />
                            Re-list as Active
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(l)}
                          className="gap-2 text-sm cursor-pointer text-red-600 focus:text-red-700"
                          data-testid={`menu-delete-${l.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="border-t border-gray-200 mt-2 pt-4 flex items-center justify-between gap-2">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-prev-page"
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
                    "min-w-[32px] h-8 px-2 rounded-md text-sm font-medium transition-colors",
                    pn === pagination.page
                      ? "bg-primary/10 text-primary"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                  data-testid={`button-page-${pn}`}
                >
                  {pn}
                </button>
              ),
            )}
          </div>

          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() =>
              setPage((p) => Math.min(pagination.totalPages, p + 1))
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Footer count */}
      {!loading && listings.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Showing {startIdx + 1}–{startIdx + listings.length} of{" "}
          {pagination.total}
        </p>
      )}

      {/* Delete confirmation (matches reference) */}
      <DeleteListingDialog
        open={!!deleteTarget}
        onClose={() => (deleting ? null : setDeleteTarget(null))}
        onConfirm={handleConfirmDelete}
        submitting={deleting}
        subtitle={
          deleteTarget
            ? `Listing #${padId(deleteTarget.id)} — ${deleteTarget.make} ${
                deleteTarget.model
              } (${deleteTarget.year})`
            : undefined
        }
      />

      <AddListingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setTab("active");
          setPage(1);
          setRefreshKey((k) => k + 1);
        }}
        maxPhotos={planLimits?.maxPhotos}
        featuredListingEnabled={planLimits?.featuredListingEnabled ?? false}
      />

      <AddListingDialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onCreated={() => setRefreshKey((k) => k + 1)}
        mode="edit"
        listing={editTarget}
        maxPhotos={planLimits?.maxPhotos}
        featuredListingEnabled={planLimits?.featuredListingEnabled ?? false}
      />
    </DashboardLayout>
  );
}

// Build the page-number array with leading/trailing ellipses (matches the
// design: 1 2 3 … 8 9 10).
function buildPageNumbers(
  current: number,
  total: number,
): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [];
  const window = new Set<number>([
    1,
    2,
    3,
    current - 1,
    current,
    current + 1,
    total - 1,
    total,
  ]);
  let prev = 0;
  Array.from(window)
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)
    .forEach((n) => {
      if (n - prev > 1) pages.push("…");
      pages.push(n);
      prev = n;
    });
  return pages;
}
