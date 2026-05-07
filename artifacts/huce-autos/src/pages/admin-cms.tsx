import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { 
  Image as ImageIcon, 
  Bell, 
  Eye, 
  Search, 
  ArrowLeft, 
  ArrowRight, 
  ArrowUpRight, 
  Pencil,
  Trash2,
  Bold, 
  Italic, 
  Underline, 
  Link as LinkIcon, 
  List, 
  ListOrdered, 
  UploadCloud, 
  ChevronLeft,
  Star,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uploadFile } from "@/lib/upload";
import { DeleteListingDialog } from "@/components/dialogs/delete-listing-dialog";
import { TextPromptDialog } from "@/components/dialogs/text-prompt-dialog";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

const API_BASE = "/api";

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function AdminCmsPage() {
  const [activeTab, setActiveTab] = useState("News");
  const [search, setSearch] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);

  const tabs = ["Overview", "Banner & Ads", "App Reviews", "Push Message", "News"];

  const { data: overview, isLoading: overviewLoading } = useQuery<{
    banners: number;
    pushMessages: number;
    appReviews: number;
  }>({
    queryKey: ["admin-cms-overview"],
    enabled: activeTab === "Overview",
    queryFn: async () => {
      const [banners, pushMessages, appReviews] = await Promise.all([
        fetchJSON<{ items: Array<unknown> }>("/admin/banners"),
        fetchJSON<{ items: Array<unknown> }>("/admin/push-messages"),
        fetchJSON<{ total: number }>("/admin/app-reviews?status=all&page=1&limit=1"),
      ]);
      return {
        banners: banners.items.length,
        pushMessages: pushMessages.items.length,
        appReviews: Number(appReviews.total ?? 0),
      };
    },
  });

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        <AdminLocalTabs
          tabs={tabs.map((tab) => ({ key: tab, label: tab }))}
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setSearch("");
          }}
        />

        {/* Content */}
        {activeTab === "Overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
            <CmsStatCard
              icon={ImageIcon}
              label="Banners"
              value={overviewLoading ? "..." : String(overview?.banners ?? 0)}
            />
            <CmsStatCard
              icon={Bell}
              label="Push Messages"
              value={overviewLoading ? "..." : String(overview?.pushMessages ?? 0)}
            />
            <CmsStatCard
              icon={Eye}
              label="App Reviews"
              value={overviewLoading ? "..." : String(overview?.appReviews ?? 0)}
            />
          </div>
        )}

        {/* Placeholders for other tabs */}
        {activeTab !== "Overview" && activeTab !== "News" && activeTab !== "Push Message" && activeTab !== "Banner & Ads" && activeTab !== "App Reviews" && (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-100 border-dashed">
            <p className="text-gray-500 font-medium">
              {activeTab} management coming soon
            </p>
          </div>
        )}

        {activeTab === "Banner & Ads" && (
          <AdminBannerAdsTab
            search={search}
            setSearch={setSearch}
            isModalOpen={isBannerModalOpen}
            setIsModalOpen={setIsBannerModalOpen}
          />
        )}

        {activeTab === "App Reviews" && <AdminAppReviewsTab search={search} setSearch={setSearch} />}

        {activeTab === "Push Message" && (
          <AdminPushMessageTab
            search={search}
            setSearch={setSearch}
            isModalOpen={isPushModalOpen}
            setIsModalOpen={setIsPushModalOpen}
          />
        )}

        {/* News Tab Content */}
        {activeTab === "News" && (
          <AdminNewsTab
            search={search}
            setSearch={setSearch}
            isAddModalOpen={isAddModalOpen}
            setIsAddModalOpen={setIsAddModalOpen}
          />
        )}
      </div>
    </AdminLayout>
  );
}

function CmsStatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-between shadow-sm min-h-[130px]">
      <div className="flex flex-col items-start justify-between h-full gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-6 w-6 stroke-[2]" />
        </div>
        <span className="text-[13px] font-medium text-gray-600">{label}</span>
      </div>
      <div className="text-4xl md:text-[44px] font-black text-gray-900 leading-none self-center">
        {value}
      </div>
    </div>
  );
}

interface NewsArticle {
  id: number;
  title: string;
  excerpt: string | null;
  tags: string[];
  content: string;
  imageUrl: string | null;
  slug: string;
  status: string;
  authorName: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface PushMessageItem {
  id: number;
  title: string;
  body: string;
  targetRole: "all" | "buyer" | "seller" | "inspector";
  sentAt: string | null;
  createdAt: string;
}

interface BannerItem {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  impressionCount: number;
}

interface AppReviewItem {
  id: number;
  userId: number;
  role: "buyer" | "seller" | "inspector" | "admin";
  rating: number;
  title: string;
  comment: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

function roleLabel(role: PushMessageItem["targetRole"]) {
  if (role === "all") return "All Users";
  if (role === "buyer") return "Buyers";
  if (role === "seller") return "Sellers";
  return "Inspectors";
}

const BANNER_PLACEMENTS = [
  { value: "landing_hero", label: "Landing Hero" },
  { value: "landing_mid", label: "Landing Mid" },
  { value: "car_detail_actions", label: "Car Detail After Actions" },
  { value: "news_detail_top", label: "News Detail Top" },
  { value: "news_detail_mid", label: "News Detail Mid Content" },
] as const;

const PLACEMENT_SIZE_GUIDE: Record<
  (typeof BANNER_PLACEMENTS)[number]["value"],
  { desktop: string; tablet: string; mobile: string }
> = {
  landing_hero: { desktop: "970x250", tablet: "728x90", mobile: "320x100" },
  landing_mid: { desktop: "970x90", tablet: "728x90", mobile: "320x100" },
  car_detail_actions: { desktop: "970x90", tablet: "728x90", mobile: "320x100" },
  news_detail_top: { desktop: "728x90", tablet: "728x90", mobile: "320x100" },
  news_detail_mid: { desktop: "300x250", tablet: "300x250", mobile: "300x250" },
};

function parseBannerPosition(position: string) {
  if (position.endsWith("_desktop")) return { placement: position.replace(/_desktop$/, ""), device: "desktop" as const };
  if (position.endsWith("_tablet")) return { placement: position.replace(/_tablet$/, ""), device: "tablet" as const };
  if (position.endsWith("_mobile")) return { placement: position.replace(/_mobile$/, ""), device: "mobile" as const };
  return { placement: position, device: "all" as const };
}

function buildBannerPosition(placement: string, device: "all" | "desktop" | "tablet" | "mobile") {
  if (device === "all") return placement;
  return `${placement}_${device}`;
}

function sizeGuideFor(
  placement: (typeof BANNER_PLACEMENTS)[number]["value"],
  device: "all" | "desktop" | "tablet" | "mobile",
) {
  const guide = PLACEMENT_SIZE_GUIDE[placement];
  if (!guide) return "N/A";
  if (device === "desktop") return guide.desktop;
  if (device === "tablet") return guide.tablet;
  if (device === "mobile") return guide.mobile;
  return `D ${guide.desktop} • T ${guide.tablet} • M ${guide.mobile}`;
}

function AdminBannerAdsTab({
  search,
  setSearch,
  isModalOpen,
  setIsModalOpen,
}: {
  search: string;
  setSearch: (v: string) => void;
  isModalOpen: boolean;
  setIsModalOpen: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BannerItem | null>(null);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<string>(BANNER_PLACEMENTS[0].value);
  const [device, setDevice] = useState<"all" | "desktop" | "tablet" | "mobile">("all");
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingBanner, setDeletingBanner] = useState<BannerItem | null>(null);

  const { data, isLoading } = useQuery<{ items: BannerItem[] }>({
    queryKey: ["admin-banners"],
    queryFn: () => fetchJSON("/admin/banners"),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const selectedPlacement = placement as (typeof BANNER_PLACEMENTS)[number]["value"];
      if (!PLACEMENT_SIZE_GUIDE[selectedPlacement]) {
        throw new Error("Select a valid placement");
      }
      const payload = {
        title,
        imageUrl,
        linkUrl: linkUrl.trim() || null,
        position: buildBannerPosition(selectedPlacement, device),
        isActive,
      };
      if (editing) {
        return fetchJSON(`/admin/banners/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      return fetchJSON("/admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Banner updated" : "Banner created" });
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      setIsModalOpen(false);
      setEditing(null);
      setTitle("");
      setImageUrl("");
      setLinkUrl("");
      setPlacement(BANNER_PLACEMENTS[0].value);
      setDevice("all");
      setIsActive(true);
    },
    onError: (err: any) =>
      toast({
        title: "Failed to save banner",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchJSON(`/admin/banners/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Banner deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to delete banner",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const onUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Select an image file", variant: "destructive" });
      return;
    }
    try {
      setUploading(true);
      const { servingUrl } = await uploadFile(file);
      setImageUrl(servingUrl);
      toast({ title: "Banner image uploaded" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const filtered = (data?.items ?? []).filter((b) => {
    const hay = `${b.title} ${b.position} ${b.linkUrl ?? ""}`.toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-5 border-b border-gray-100">
        <h2 className="text-lg font-black text-gray-900 shrink-0">Banners</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search here..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 h-10 px-4 bg-[#046C4E] hover:bg-[#045c42] text-white rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shrink-0 shadow-sm"
          >
            Add Banner
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[13px] text-[#A5B4D6] font-semibold">
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Preview</th>
              <th className="px-6 py-4">Title</th>
              <th className="px-6 py-4">Placement</th>
              <th className="px-6 py-4">Device</th>
              <th className="px-6 py-4">Size Guide</th>
              <th className="px-6 py-4">Impressions</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Created</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="px-6 py-10 text-sm text-gray-500">Loading banners...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-10 text-sm text-gray-500">No banners found.</td>
              </tr>
            ) : (
              filtered.map((b) => {
                const parsed = parseBannerPosition(b.position);
                const parsedPlacement =
                  (BANNER_PLACEMENTS.find((p) => p.value === parsed.placement)?.value as
                    | (typeof BANNER_PLACEMENTS)[number]["value"]
                    | undefined) ?? BANNER_PLACEMENTS[0].value;
                return (
                  <tr key={b.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{b.id}</td>
                    <td className="px-6 py-4">
                      <img src={b.imageUrl} alt={b.title} className="h-12 w-24 rounded object-cover border border-gray-200" />
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{b.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {BANNER_PLACEMENTS.find((p) => p.value === parsed.placement)?.label ?? parsed.placement}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 capitalize">{parsed.device}</td>
                    <td className="px-6 py-4 text-xs text-gray-700 font-medium">{sizeGuideFor(parsedPlacement, parsed.device)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{b.impressionCount ?? 0}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${b.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {b.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{format(new Date(b.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                          onClick={() => {
                            const next = parseBannerPosition(b.position);
                            setEditing(b);
                            setTitle(b.title);
                            setImageUrl(b.imageUrl);
                            setLinkUrl(b.linkUrl ?? "");
                            setPlacement(next.placement);
                            setDevice(next.device);
                            setIsActive(b.isActive);
                            setIsModalOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => setDeletingBanner(b)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setEditing(null);
            setTitle("");
            setImageUrl("");
            setLinkUrl("");
            setPlacement(BANNER_PLACEMENTS[0].value);
            setDevice("all");
            setIsActive(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] w-[95vw] sm:w-full p-0 overflow-hidden border-0 shadow-2xl rounded-2xl">
          <div className="p-6 sm:p-8">
            <h2 className="text-2xl font-black text-gray-900 mb-6">{editing ? "Edit Banner" : "Add Banner"}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter title"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-gray-700 mb-2">Placement</label>
                  <select
                    value={placement}
                    onChange={(e) => setPlacement(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none bg-white focus:ring-2 focus:ring-primary/20"
                  >
                    {BANNER_PLACEMENTS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-gray-700 mb-2">Device</label>
                  <select
                    value={device}
                    onChange={(e) => setDevice(e.target.value as "all" | "desktop" | "tablet" | "mobile")}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none bg-white focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="all">All</option>
                    <option value="desktop">Desktop</option>
                    <option value="tablet">Tablet</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-900">
                <div className="font-semibold mb-1">Size Guide</div>
                <div>
                  Recommended:{" "}
                  {sizeGuideFor(placement as (typeof BANNER_PLACEMENTS)[number]["value"], device)}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">Image URL</label>
                <div className="flex items-center gap-2">
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <label className="inline-flex items-center h-11 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
                    {uploading ? "Uploading..." : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        void onUpload(file);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">Click URL (optional)</label>
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active
              </label>

              <button
                type="submit"
                disabled={saveMutation.isPending || uploading || !title.trim() || !imageUrl.trim()}
                className="w-full h-11 rounded-xl bg-[#046C4E] hover:bg-[#045c42] text-white text-sm font-semibold disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Banner"}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteListingDialog
        open={deletingBanner !== null}
        onClose={() => setDeletingBanner(null)}
        onConfirm={() => {
          if (!deletingBanner) return;
          deleteMutation.mutate(deletingBanner.id);
          setDeletingBanner(null);
        }}
        submitting={deleteMutation.isPending}
        title="Are you sure you want to delete this banner?"
        description="Deleting this banner will remove it from all placements and devices."
        subtitle={deletingBanner ? `"${deletingBanner.title}"` : undefined}
        confirmLabel="Delete Banner"
      />
    </div>
  );
}

function AdminAppReviewsTab({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<AppReviewItem | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const { data, isLoading } = useQuery<{ items: AppReviewItem[] }>({
    queryKey: ["admin-app-reviews", statusFilter, search],
    queryFn: () =>
      fetchJSON(
        `/admin/app-reviews?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`,
      ),
  });

  const moderationMutation = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: number;
      status: "approved" | "rejected";
      note: string;
    }) =>
      fetchJSON(`/admin/app-reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: note.trim() || null }),
      }),
    onSuccess: () => {
      toast({ title: "App review updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-app-reviews"] });
      setIsReviewDialogOpen(false);
      setSelectedReview(null);
      setAdminNote("");
    },
    onError: (err: any) =>
      toast({
        title: "Failed to update review",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-5 border-b border-gray-100">
        <h2 className="text-lg font-black text-gray-900 shrink-0">App Reviews</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search here..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full sm:w-auto h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[13px] text-[#A5B4D6] font-semibold">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Rating</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Submitted</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-sm text-gray-500">Loading app reviews...</td>
              </tr>
            ) : (data?.items?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-sm text-gray-500">No app reviews found.</td>
              </tr>
            ) : (
              data!.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-6 py-4 text-sm text-gray-800">
                    <div className="font-semibold">{item.user.name}</div>
                    <div className="text-xs text-gray-500">{item.user.email}</div>
                  </td>
                  <td className="px-6 py-4 text-sm capitalize text-gray-700">{item.role}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star
                          key={idx}
                          className={`h-4 w-4 ${idx < item.rating ? "fill-current" : "text-gray-300"}`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === "approved"
                          ? "bg-green-50 text-green-700"
                          : item.status === "rejected"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{format(new Date(item.createdAt), "MMM d, yyyy")}</td>
                  <td className="px-6 py-4">
                    <button
                      type="button"
                      className="h-8 rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      onClick={() => {
                        setSelectedReview(item);
                        setAdminNote(item.adminNote ?? "");
                        setIsReviewDialogOpen(true);
                      }}
                    >
                      View Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={isReviewDialogOpen}
        onOpenChange={(open) => {
          setIsReviewDialogOpen(open);
          if (!open) {
            setSelectedReview(null);
            setAdminNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[760px] w-[95vw] sm:w-full p-0 overflow-hidden border-0 shadow-2xl rounded-2xl">
          <div className="p-6 sm:p-8">
            <h2 className="text-2xl font-black text-gray-900 mb-5">Review Detail</h2>
            {!selectedReview ? null : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-3">
                    <p className="text-xs text-gray-500 mb-1">User</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedReview.user.name}</p>
                    <p className="text-xs text-gray-500">{selectedReview.user.email}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-3">
                    <p className="text-xs text-gray-500 mb-1">Meta</p>
                    <p className="text-sm text-gray-700 capitalize">
                      {selectedReview.role} • {format(new Date(selectedReview.createdAt), "MMM d, yyyy")}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-amber-500">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star
                          key={idx}
                          className={`h-4 w-4 ${idx < selectedReview.rating ? "fill-current" : "text-gray-300"}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-900">{selectedReview.title}</p>
                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{selectedReview.comment}</p>
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-gray-700 mb-2">Admin Note</label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={3}
                    placeholder="Optional note"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={moderationMutation.isPending}
                    onClick={() =>
                      moderationMutation.mutate({
                        id: selectedReview.id,
                        status: "approved",
                        note: adminNote,
                      })
                    }
                    className="h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={moderationMutation.isPending}
                    onClick={() =>
                      moderationMutation.mutate({
                        id: selectedReview.id,
                        status: "rejected",
                        note: adminNote,
                      })
                    }
                    className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminPushMessageTab({
  search,
  setSearch,
  isModalOpen,
  setIsModalOpen,
}: {
  search: string;
  setSearch: (v: string) => void;
  isModalOpen: boolean;
  setIsModalOpen: (v: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [targetRole, setTargetRole] = useState<"all" | "buyer" | "seller" | "inspector">("all");
  const [page, setPage] = useState(1);
  const [isLinkPromptOpen, setIsLinkPromptOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const applyAroundSelection = (before: string, after = before) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = body.slice(start, end);
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      if (selected.length === 0) {
        const cursor = start + before.length;
        el.setSelectionRange(cursor, cursor);
      } else {
        const selStart = start + before.length;
        const selEnd = selStart + selected.length;
        el.setSelectionRange(selStart, selEnd);
      }
    });
  };

  const applyPrefixPerLine = (prefixFactory: (idx: number) => string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = body.slice(start, end);
    const lines = (selected || "").split("\n");
    const prefixed = lines.map((line, idx) => `${prefixFactory(idx)}${line}`).join("\n");
    const next = `${body.slice(0, start)}${prefixed}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + prefixed.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const { data, isLoading } = useQuery<{ items: PushMessageItem[] }>({
    queryKey: ["admin-push-messages"],
    queryFn: () => fetchJSON("/admin/push-messages"),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      fetchJSON("/admin/push-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, targetRole }),
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setTargetRole("all");
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-push-messages"] });
      toast({ title: "Announcement sent successfully" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send message",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const filtered = (data?.items ?? []).filter((m) => {
    if (!search.trim()) return true;
    const hay = `${m.title} ${m.body} ${m.targetRole}`.toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, data?.items?.length]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-5 border-b border-gray-100">
        <h2 className="text-lg font-black text-gray-900 shrink-0">Push Messages</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search here..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 h-10 px-4 bg-[#046C4E] hover:bg-[#045c42] text-white rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shrink-0 shadow-sm"
          >
            Send Push Message
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[13px] text-[#A5B4D6] font-semibold">
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Title</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-6 py-4">Sent by</th>
              <th className="px-6 py-4">Date Sent</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-sm text-gray-500">
                  Loading push messages...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-sm text-gray-500">
                  No push messages found.
                </td>
              </tr>
            ) : (
              paged.map((m) => (
                <tr key={m.id} className="border-b last:border-b-0 border-gray-100">
                  <td className="px-6 py-5 text-sm font-bold text-gray-900">{m.id}</td>
                  <td className="px-6 py-5 text-sm font-semibold text-gray-900">{roleLabel(m.targetRole)}</td>
                  <td className="px-6 py-5 text-sm font-bold text-gray-900">{m.title}</td>
                  <td className="px-6 py-5 text-sm font-bold text-gray-900 max-w-[260px] truncate">{m.body}</td>
                  <td className="px-6 py-5 text-sm font-bold text-gray-900">Super-Admin</td>
                  <td className="px-6 py-5 text-sm font-bold text-gray-900">
                    {format(new Date(m.sentAt ?? m.createdAt), "MMM d, yyyy,h:mma")}
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
                      <span className="h-2.5 w-2.5 rounded-full bg-lime-400" />
                      Sent
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-6 py-5 border-t border-gray-100">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="h-10 px-5 rounded-xl border border-[#046C4E] text-sm font-semibold text-gray-800 disabled:opacity-40"
        >
          Previous
        </button>
        <div className="text-sm font-medium text-gray-500">
          {currentPage} / {totalPages}
        </div>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="h-10 px-5 rounded-xl border border-[#046C4E] text-sm font-semibold text-gray-800 disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[760px] w-[95vw] sm:w-full p-0 overflow-hidden border-0 shadow-2xl rounded-3xl">
          <div className="p-7 sm:p-9">
            <button
              onClick={() => setIsModalOpen(false)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 mb-5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <h2 className="text-[34px] font-black text-gray-900 mb-6">Push Message</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter Title"
                  className="w-full h-12 px-4 rounded-xl border border-[#E8EEFF] text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">User</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as "all" | "buyer" | "seller" | "inspector")}
                  className="w-full h-12 px-4 rounded-xl border border-[#E8EEFF] text-sm outline-none bg-white focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Users</option>
                  <option value="buyer">Buyers</option>
                  <option value="seller">Sellers</option>
                  <option value="inspector">Inspectors</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">Description</label>
                <div className="rounded-xl border border-[#E8EEFF] overflow-hidden">
                  <textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Enter Description"
                    rows={7}
                    className="w-full p-4 text-sm outline-none resize-none"
                  />
                  <div className="flex items-center gap-3 px-3 py-2 border-t border-[#F1F5FF]">
                    <button type="button" onClick={() => applyAroundSelection("**")} className="text-gray-500 hover:text-gray-700"><Bold className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => applyAroundSelection("*")} className="text-gray-500 hover:text-gray-700"><Italic className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => applyAroundSelection("<u>", "</u>")} className="text-gray-500 hover:text-gray-700"><Underline className="h-3.5 w-3.5" /></button>
                    <button
                      type="button"
                      onClick={() => setIsLinkPromptOpen(true)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => applyPrefixPerLine(() => "- ")} className="text-gray-500 hover:text-gray-700"><List className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={sendMutation.isPending || !title.trim() || !body.trim()}
                className="w-full h-12 rounded-xl bg-[#046C4E] hover:bg-[#045c42] text-white text-sm font-semibold disabled:opacity-50"
              >
                {sendMutation.isPending ? "Proceeding..." : "Proceed"}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <TextPromptDialog
        open={isLinkPromptOpen}
        onClose={() => setIsLinkPromptOpen(false)}
        title="Insert Link"
        description="Enter the URL to wrap around your selected text."
        placeholder="https://example.com"
        confirmLabel="Insert"
        onConfirm={(value) => {
          const href = value.trim();
          if (!href) {
            setIsLinkPromptOpen(false);
            return;
          }
          applyAroundSelection("[", `](${href})`);
          setIsLinkPromptOpen(false);
        }}
      />
    </div>
  );
}

interface NewsResponse {
  articles: NewsArticle[];
  total: number;
  page: number;
  totalPages: number;
}

function AdminNewsTab({
  search,
  setSearch,
  isAddModalOpen,
  setIsAddModalOpen,
}: {
  search: string;
  setSearch: (v: string) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (val: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<NewsArticle | null>(null);
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading } = useQuery<NewsResponse>({
    queryKey: ["admin-news", page, search],
    queryFn: () =>
      fetchJSON(`/admin/news?page=${page}&limit=8&search=${encodeURIComponent(search)}`),
  });

  const [prefetchingId, setPrefetchingId] = useState<number | null>(null);
  const {
    data: prefetchedArticle,
    isLoading: isPrefetching,
    isError: isPrefetchError,
    error: prefetchError,
  } = useQuery<NewsArticle>({
    queryKey: ["admin-news-detail", prefetchingId],
    queryFn: () => fetchJSON(`/admin/news/${prefetchingId}`),
    enabled: prefetchingId !== null,
  });

  useEffect(() => {
    if (prefetchedArticle && prefetchingId) {
      setTitle(prefetchedArticle.title ?? "");
      setTagsInput((prefetchedArticle.tags ?? []).join(", "));
      setContent(prefetchedArticle.content ?? "");
      setCoverImageUrl(prefetchedArticle.imageUrl ?? null);
      setEditingArticle(prefetchedArticle);
      setPrefetchingId(null);
      setIsAddModalOpen(true);
    }
  }, [prefetchedArticle, prefetchingId]);

  useEffect(() => {
    if (!isPrefetchError) return;
    const message = prefetchError instanceof Error ? prefetchError.message : "Failed to fetch article";
    toast({
      title: "Error",
      description: message,
      variant: "destructive",
    });
    setPrefetchingId(null);
  }, [isPrefetchError, prefetchError, toast]);

  const createNewsMutation = useMutation({
    mutationFn: (formData: {
      title: string;
      content: string;
      excerpt: string;
      imageUrl: string | null;
      tags: string[];
    }) =>
      fetchJSON("/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-news"] });
      setTitle("");
      setTagsInput("");
      setContent("");
      setCoverImageUrl(null);
      setIsAddModalOpen(false);
      toast({ title: "News article created successfully" });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateNewsMutation = useMutation({
    mutationFn: (payload: {
      id: number;
      title: string;
      content: string;
      excerpt: string;
      imageUrl: string | null;
      tags: string[];
    }) =>
      fetchJSON(`/admin/news/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          content: payload.content,
          excerpt: payload.excerpt,
          imageUrl: payload.imageUrl,
          tags: payload.tags,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-news"] });
      setTitle("");
      setTagsInput("");
      setContent("");
      setCoverImageUrl(null);
      setEditingArticle(null);
      setIsAddModalOpen(false);
      toast({ title: "News article updated successfully" });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteNewsMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJSON(`/admin/news/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-news"] });
      toast({ title: "News article deleted" });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const openEditModal = (article: NewsArticle) => {
    setPrefetchingId(article.id);
  };

  const onCoverFileSelected = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Unsupported file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image under 10 MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsUploadingCover(true);
      const { servingUrl } = await uploadFile(file);
      setCoverImageUrl(servingUrl);
      toast({ title: "Image uploaded" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload image.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingCover(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-black text-gray-900 shrink-0">News Articles</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search here..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 h-10 px-4 bg-[#046C4E] hover:bg-[#045c42] text-white rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shrink-0 shadow-sm"
          >
            Add News
          </button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 h-48 rounded-2xl mb-4" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-5 bg-gray-200 rounded w-full mb-1" />
              <div className="h-5 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : data?.articles.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
          <p className="text-gray-500 font-medium">No news found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 mb-12">
          {data?.articles.map((article) => (
            <div key={article.id} className="group cursor-pointer">
              {/* Image Container */}
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden mb-4 bg-gray-100">
                <img
                  src={article.imageUrl || "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?q=80&w=2115&auto=format&fit=crop"}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[11px] font-bold text-gray-900 shadow-sm">
                  {article.status === "published" ? "Published" : "Draft"}
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(article);
                    }}
                    disabled={isPrefetching && prefetchingId === article.id}
                    className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-white shadow-sm disabled:opacity-50"
                  >
                    {isPrefetching && prefetchingId === article.id ? "Fetching..." : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingArticle(article);
                    }}
                    disabled={deleteNewsMutation.isPending}
                    className="bg-red-50/95 backdrop-blur-sm px-2.5 py-1 rounded-md text-[11px] font-semibold text-red-700 hover:bg-red-100 shadow-sm disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              {/* Meta */}
              <div className="text-[12px] font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                <span>{article.authorName || "Admin"}</span>
                <span>•</span>
                <span>{format(new Date(article.publishedAt || article.createdAt), "MMMM d, yyyy")}</span>
              </div>
              
              {/* Title & Link */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-[15px] text-gray-900 leading-snug line-clamp-2 pr-2">
                  {article.title}
                </h3>
                <div className="flex items-center gap-1 text-[11px] font-bold text-primary shrink-0 whitespace-nowrap mt-1 group-hover:underline">
                  View Details
                  <ArrowUpRight className="h-3 w-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-8 mt-4 pb-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-2 h-11 px-5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>
          
          <div className="flex items-center gap-1.5 hidden md:flex">
            {Array.from({ length: data.totalPages }).map((_, i) => {
              const p = i + 1;
              const isActive = p === page;
              
              if (
                p === 1 || 
                p === data.totalPages || 
                (p >= page - 1 && p <= page + 1)
              ) {
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-9 w-9 rounded-lg text-[13px] font-bold flex items-center justify-center transition-colors ${
                      isActive
                        ? "bg-[#E8F3ED] text-[#2E7D32]"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              }
              
              if (p === page - 2 || p === page + 2) {
                return <span key={p} className="text-gray-400 px-1">...</span>;
              }
              
              return null;
            })}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className="flex items-center gap-2 h-11 px-5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <DeleteListingDialog
        open={deletingArticle !== null}
        onClose={() => setDeletingArticle(null)}
        onConfirm={() => {
          if (!deletingArticle) return;
          deleteNewsMutation.mutate(deletingArticle.id);
          setDeletingArticle(null);
        }}
        submitting={deleteNewsMutation.isPending}
        title="Are you sure you want to delete this news article?"
        description="Deleting this article will permanently remove it from the platform. This action cannot be undone."
        subtitle={deletingArticle ? `"${deletingArticle.title}"` : undefined}
        confirmLabel="Delete News"
      />

      {/* Add News Modal */}
      <Dialog
        open={isAddModalOpen}
        onOpenChange={(open) => {
          setIsAddModalOpen(open);
          if (!open) {
            setEditingArticle(null);
            setTagsInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] w-[95vw] sm:w-full p-0 overflow-hidden border-0 shadow-2xl rounded-2xl" hideCloseButton>
          <div className="p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingArticle(null);
                setTagsInput("");
              }}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 mb-6 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            
            <h2 className="text-2xl font-black text-gray-900 mb-8">
              {editingArticle ? "Edit News" : "Add News"}
            </h2>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const tags = tagsInput
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean);
                const payload = {
                  title: title.trim(),
                  content: content.trim(),
                  excerpt: content.trim().substring(0, 100),
                  imageUrl: coverImageUrl,
                  tags,
                };
                if (editingArticle) {
                  updateNewsMutation.mutate({ id: editingArticle.id, ...payload });
                } else {
                  createNewsMutation.mutate(payload);
                }
              }}
              className="space-y-6"
            >
              {/* Title */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-500 mb-2">
                  Title
                </label>
                <input
                  name="title"
                  required
                  placeholder="Enter Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-gray-400 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-500 mb-2">
                  Tags
                </label>
                <input
                  name="tags"
                  placeholder="Accessories, Exterior"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-gray-400 shadow-sm"
                />
              </div>

              {/* Description / Content */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-500 mb-2">
                  Description
                </label>
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                  <ReactQuill
                    theme="snow"
                    value={content}
                    onChange={setContent}
                    placeholder="Enter News Content"
                    className="min-h-[200px]"
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                      ]
                    }}
                  />
                </div>
              </div>

              {/* Images Dropzone */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-500 mb-2">
                  Images
                </label>
                <div
                  onClick={() => coverInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer group shadow-sm"
                >
                  <div className="h-12 w-12 rounded-full bg-[#E8F3ED] text-[#2E7D32] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  {coverImageUrl ? (
                    <img
                      src={coverImageUrl}
                      alt="Uploaded cover"
                      className="w-full max-h-48 object-cover rounded-lg mb-4"
                    />
                  ) : null}
                  <p className="text-[14px] text-gray-600 mb-1">
                    {isUploadingCover
                      ? "Uploading image..."
                      : "Drag & Drop or "}
                    {!isUploadingCover && (
                      <span className="text-primary font-semibold">choose file</span>
                    )}
                    {!isUploadingCover ? " to upload" : ""}
                  </p>
                  <p className="text-[12px] text-gray-400">
                    Supported formats: Jpeg, Png, WebP
                  </p>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void onCoverFileSelected(file);
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  createNewsMutation.isPending ||
                  updateNewsMutation.isPending ||
                  isUploadingCover ||
                  !title.trim() ||
                  !content.trim()
                }
                className="w-full h-12 bg-[#046C4E] hover:bg-[#045c42] text-white rounded-xl font-bold transition-colors disabled:opacity-50 mt-4 shadow-sm"
              >
                {createNewsMutation.isPending || updateNewsMutation.isPending
                  ? "Proceeding..."
                  : editingArticle
                    ? "Save Changes"
                    : "Proceed"}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
