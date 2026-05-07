import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Loader2, Search, Trash2, Pencil } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  type DetailResponse,
  formatNaira,
  formatUploadDate,
  titleCase,
  SummaryItem,
  OverviewTab,
} from "@/components/listing-detail/listing-detail-shared";
import {
  AddListingDialog,
  type ListingForEdit,
} from "@/components/dialogs/add-listing-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfferRow {
  id: number;
  amount: number;
  counterAmount: number | null;
  status: string;
  buyerMessage: string | null;
  createdAt: string;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  buyerEmail: string | null;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminListingDetailPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/inventory/:id");
  const { toast } = useToast();

  const id = params?.id ? parseInt(params.id, 10) : NaN;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "offers">("overview");

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<ListingForEdit | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/listings/${id}`, { credentials: "include" });
        if (!res.ok) {
          if (res.status === 404) {
            toast({ title: "Listing not found", variant: "destructive" });
            navigate("/admin/inventory");
            return;
          }
          throw new Error("Failed to load");
        }
        const json = (await res.json()) as DetailResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) toast({ title: "Couldn't load listing", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate, toast]);

  useEffect(() => {
    if (!Number.isFinite(id) || tab !== "offers") return;
    let cancelled = false;
    (async () => {
      setOffersLoading(true);
      try {
        const res = await fetch(`/api/admin/listings/${id}/offers`, { credentials: "include" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { offers: OfferRow[] };
        if (!cancelled) setOffers(json.offers);
      } catch {
        if (!cancelled) toast({ title: "Couldn't load offers", variant: "destructive" });
      } finally {
        if (!cancelled) setOffersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, tab, toast]);

  async function handleDelete() {
    if (!Number.isFinite(id)) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/admin/listings/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Failed to delete");
      }
      toast({ title: "Listing deleted" });
      navigate("/admin/inventory");
    } catch (err) {
      toast({
        title: "Couldn't delete listing",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteSubmitting(false);
      setDeleteOpen(false);
    }
  }

  const listing = data?.listing;
  const sellerName =
    data?.seller?.businessName ??
    [data?.seller?.firstName, data?.seller?.lastName].filter(Boolean).join(" ") ??
    "—";

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
          {/* Top bar: Back + action buttons */}
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => navigate("/admin/inventory")}
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {listing && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!data) return;
                    setEditTarget({
                      id: listing.id,
                      make: listing.make,
                      model: listing.model,
                      year: listing.year,
                      price: listing.price,
                      location: (listing as any).location,
                      carType: listing.carType,
                      mileage: listing.mileage,
                      fuelType: listing.fuelType,
                      transmission: listing.transmission,
                      driveType: listing.driveType,
                      condition: listing.condition,
                      doors: listing.doors,
                      color: listing.color,
                      vin: listing.vin,
                      description: listing.description,
                      featureIds: (data.features ?? []).map((f) => f.id),
                      images: (data.images ?? []).map((img) => ({
                        url: img.url,
                        mediaType: img.mediaType,
                        fileName: img.fileName,
                      })),
                    });
                  }}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Listing
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="flex items-center gap-2 bg-[#F5C0AE] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#EFB099] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Listing
                </button>
              </div>
            )}
          </div>

          {loading || !listing ? (
            <div className="py-24 flex items-center justify-center text-gray-300">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* Title */}
              <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-6">
                {listing.make} {listing.model} , {listing.year}
              </h2>

              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-x-6 gap-y-4 pb-6 border-b border-gray-200">
                <SummaryItem
                  label="Car Details"
                  value={`${listing.make} ${listing.model} , ${listing.year}`}
                />
                <SummaryItem label="Seller's Name" value={sellerName} />
                <SummaryItem label="Amount" value={formatNaira(listing.price)} />
                <SummaryItem label="Upload Date" value={formatUploadDate(listing.createdAt)} />
                <SummaryItem label="Offers" value={String(offers.length)} />
                <SummaryItem label="Views" value={String(listing.viewCount)} />
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-1">Listing Status</p>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                      listing.status === "active" && "bg-emerald-50 text-emerald-700",
                      listing.status === "sold" && "bg-gray-100 text-gray-600",
                      listing.status === "pending" && "bg-amber-50 text-amber-700",
                      listing.status === "suspended" && "bg-red-50 text-red-700",
                      listing.status === "deleted" && "bg-red-50 text-red-700",
                    )}
                  >
                    {titleCase(listing.status)}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <AdminLocalTabs
                className="mt-6"
                tabs={[
                  { key: "overview", label: "Car Overview" },
                  { key: "offers", label: "Offers" },
                ]}
                activeKey={tab}
                onChange={(key) => setTab(key as "overview" | "offers")}
              />

              {tab === "overview" ? (
                <OverviewTab data={data!} />
              ) : (
                <AdminOffersTab offers={offers} loading={offersLoading} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !deleteSubmitting && setDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Listing</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete{" "}
            <span className="font-semibold">
              {listing?.make} {listing?.model} {listing?.year}
            </span>
            ? This action will hide the listing from the platform.
          </p>
          <DialogFooter className="gap-2">
            <button
              type="button"
              disabled={deleteSubmitting}
              onClick={() => setDeleteOpen(false)}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteSubmitting}
              onClick={handleDelete}
              className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleteSubmitting ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit listing form — same multi-step dialog used by sellers */}
      <AddListingDialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onCreated={() => {
          setEditTarget(null);
          // Reload listing data to reflect the changes
          if (Number.isFinite(id)) {
            setLoading(true);
            fetch(`/api/admin/listings/${id}`, { credentials: "include" })
              .then((r) => r.json())
              .then((json: DetailResponse) => setData(json))
              .catch(() => toast({ title: "Couldn't reload listing", variant: "destructive" }))
              .finally(() => setLoading(false));
          }
        }}
        mode="edit"
        listing={editTarget}
        submitUrl={Number.isFinite(id) ? `/api/admin/listings/${id}` : undefined}
      />
    </AdminLayout>
  );
}

// ─── Read-only offers tab ─────────────────────────────────────────────────────

function AdminOffersTab({ offers, loading }: { offers: OfferRow[]; loading: boolean }) {
  const [query, setQuery] = useState("");

  const filtered = offers.filter((o) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const name = [o.buyerFirstName, o.buyerLastName].filter(Boolean).join(" ").toLowerCase();
    return name.includes(q) || String(o.id).includes(q);
  });

  if (loading) {
    return (
      <div className="mt-8 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-xl font-extrabold text-gray-900">Offers ({offers.length})</h3>
        <div className="relative w-full sm:max-w-md sm:mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search here..."
            className="w-full rounded-full border border-gray-200 pl-9 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="hidden sm:block sm:w-32" aria-hidden />
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-10 gap-x-4 px-2 py-3 text-xs font-medium text-gray-400 border-b border-gray-200">
            <div className="col-span-1">TXN ID</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Offer Amount</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Date</div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              {offers.length === 0 ? "No offers yet on this listing." : "No offers match your search."}
            </div>
          ) : (
            filtered.map((o) => {
              const buyerName =
                [o.buyerFirstName, o.buyerLastName].filter(Boolean).join(" ") ||
                o.buyerEmail ||
                `Buyer #${o.id}`;
              return (
                <div
                  key={o.id}
                  className="grid grid-cols-10 gap-x-4 px-2 py-4 items-center text-sm border-b border-gray-100"
                >
                  <div className="col-span-1 text-gray-700 italic">
                    {String(o.id).padStart(2, "0")}
                  </div>
                  <div className="col-span-3 text-gray-700 truncate">{buyerName}</div>
                  <div className="col-span-2 text-gray-700 whitespace-nowrap">
                    ₦{o.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        o.status === "accepted" && "bg-emerald-50 text-emerald-700",
                        o.status === "pending" && "bg-amber-50 text-amber-700",
                        o.status === "declined" && "bg-red-50 text-red-700",
                        o.status === "completed" && "bg-blue-50 text-blue-700",
                        !["accepted", "pending", "declined", "completed"].includes(o.status) &&
                          "bg-gray-100 text-gray-600",
                      )}
                    >
                      {o.status}
                    </span>
                  </div>
                  <div className="col-span-2 text-gray-500 text-xs">
                    {new Date(o.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
