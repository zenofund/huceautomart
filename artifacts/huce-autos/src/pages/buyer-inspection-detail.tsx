import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Home,
  ClipboardList,
  Heart,
  Car,
  MessageSquare,
  Wallet,
  HeadphonesIcon,
  UserRound,
  ChevronLeft,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardNavItem,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { PaymentDialog } from "@/components/dialogs/payment-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const buyerNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  {
    href: "/dashboard/activity",
    label: "Inspection / Offers / Purchases",
    icon: ClipboardList,
  },
  { href: "/dashboard/saved", label: "Saved Car", icon: Heart },
  { href: "/dashboard/history", label: "Viewed Car History", icon: Car },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/support", label: "Customer Support", icon: HeadphonesIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

// ─── Server response shape ───────────────────────────────────────────────────
interface ApiSection {
  status: string | null;
  percent: number | null;
}
interface ApiInspectionDetail {
  id: number;
  status: string;
  paidAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  location: string | null;
  fee: number;
  type: string | null;
  notes: string | null;
  buyerNotes: string | null;
  createdAt: string;
  carDetails: string;
  inspectorName: string | null;
  inspectorRating: number | null;
  inspectorReview: {
    rating: number;
    comment: string | null;
  } | null;
  sellerName: string;
  resultPercent: number | null;
  report: {
    id: number;
    summary: string | null;
    recommendedActions: string | null;
    overallPercent: number | null;
    sections: {
      exterior: ApiSection;
      interior: ApiSection;
      engineTransmission: ApiSection;
      suspensionBrakes: ApiSection;
      tiresWheels: ApiSection;
      lightsElectricals: ApiSection;
    };
    images: string[];
    details: Record<string, unknown> | null;
  } | null;
}

// ─── Fetch helper ────────────────────────────────────────────────────────────
async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

// ─── Format helpers ──────────────────────────────────────────────────────────
function formatScheduled(scheduledAt: string | null): string {
  if (!scheduledAt) return "—";
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
function titleCase(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface InspectionCategory {
  title: string;
  subtitle: string;
  status: string;
  rating: number;
}

type SectionKey = keyof NonNullable<ApiInspectionDetail["report"]>["sections"];

const SECTION_META: Array<{
  key: SectionKey;
  title: string;
  subtitle: string;
}> = [
  {
    key: "exterior",
    title: "Exterior",
    subtitle: "Paint condition, dents, scratches, rust.",
  },
  {
    key: "interior",
    title: "Interior",
    subtitle: "Upholstery, dashboard, electronics (e.g., AC, audio system).",
  },
  {
    key: "engineTransmission",
    title: "Engine & Transmission",
    subtitle: "Engine performance, oil leaks, transmission shifts.",
  },
  {
    key: "suspensionBrakes",
    title: "Suspension & Brakes",
    subtitle: "Shock absorbers, brake pads, brake performance.",
  },
  {
    key: "tiresWheels",
    title: "Tires & Wheels",
    subtitle: "Tread depth, alignment, condition of rims.",
  },
  {
    key: "lightsElectricals",
    title: "Lights & Electricals",
    subtitle: "Headlights, indicators, battery, wiring.",
  },
];

function ratingColor(r: number) {
  if (r >= 70) return "bg-primary/10 text-primary";
  if (r >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-600";
}

function MetaField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-400 mb-1 whitespace-nowrap">{label}</div>
      <div className="text-sm sm:text-base font-bold text-gray-900 leading-snug">{value}</div>
    </div>
  );
}

function CategoryCard({ cat }: { cat: InspectionCategory }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-5 flex flex-col gap-3">
      <div>
        <span className="text-sm font-bold text-gray-900">{cat.title}:{" "}</span>
        <span className="text-xs text-gray-400">{cat.subtitle}</span>
      </div>
      <p className="text-sm font-semibold text-gray-800">
        Status: {cat.status}
      </p>
      <span
        className={cn(
          "inline-block self-start rounded-full px-3 py-1 text-xs font-semibold",
          ratingColor(cat.rating),
        )}
      >
        Rating: {cat.rating}%
      </span>
    </div>
  );
}

export default function BuyerInspectionDetail() {
  const { user: authUser, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [report, setReport] = useState<ApiInspectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [inspectorRatingInput, setInspectorRatingInput] = useState<number | null>(null);
  const [inspectorComment, setInspectorComment] = useState("");
  const [submittingInspectorRating, setSubmittingInspectorRating] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [data, w] = await Promise.all([
          jsonFetch<ApiInspectionDetail>(`/api/buyer/inspections/${id}`),
          jsonFetch<{ wallet: { balance: number } }>("/api/wallet").catch(
            () => ({ wallet: { balance: 0 } }),
          ),
        ]);
        if (!cancelled) {
          setReport(data);
          setWalletBalance(w.wallet?.balance ?? 0);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const user: DashboardUser = {
    name: authUser
      ? `${authUser.firstName} ${authUser.lastName}`.trim()
      : "Buyer",
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? true,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  // Pre-derive the categories list so the JSX stays small. Each section uses
  // its rating percent; sections with no data are still shown so the layout
  // is stable across reports — they just display "—" with a 0% rating.
  const categories: InspectionCategory[] = report?.report
    ? SECTION_META.map(({ key, title, subtitle }) => {
        const sec = report.report!.sections[key];
        return {
          title,
          subtitle,
          status: sec.status ? titleCase(sec.status) : "—",
          rating: sec.percent ?? 0,
        };
      })
    : [];

  const recommendations: string[] = report?.report?.recommendedActions
    ? report.report.recommendedActions
        .split(/\r?\n|;|•|·/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const canRateInspector =
    !!report?.report &&
    !!report?.inspectorName &&
    !report?.inspectorReview;

  async function submitInspectorRating() {
    if (!report || !inspectorRatingInput) return;
    setSubmittingInspectorRating(true);
    try {
      const data = await jsonFetch<{
        review: { rating: number; comment: string | null };
      }>(`/api/buyer/inspections/${report.id}/rate-inspector`, {
        method: "POST",
        body: JSON.stringify({
          rating: inspectorRatingInput,
          comment: inspectorComment.trim() || null,
        }),
      });

      setReport((prev) =>
        prev
          ? {
              ...prev,
              inspectorReview: data.review,
            }
          : prev,
      );
      setRateOpen(false);
      setInspectorRatingInput(null);
      setInspectorComment("");
      toast({
        title: "Inspector rated",
        description: "Thanks for your feedback.",
      });
    } catch (e) {
      toast({
        title: "Could not submit rating",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmittingInspectorRating(false);
    }
  }

  return (
    <DashboardLayout
      user={user}
      navItems={buyerNav}
      title="Activity"
      onLogout={handleLogout}
    >
      <div className="mb-3">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">
          Inspection , Offers , Purchases
        </h1>
      </div>

      <button
        onClick={() => setLocation("/dashboard/activity")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary transition-colors mb-5"
        data-testid="button-back"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base sm:text-lg font-bold text-gray-900">
          Vehicle Inspection Report
        </h2>
        {canRateInspector && (
          <button
            type="button"
            onClick={() => setRateOpen(true)}
            className="rounded-full border border-primary/40 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
            data-testid="button-rate-inspector"
          >
            Rate Inspector
          </button>
        )}
      </div>

      {!report && !error && (
        <div className="py-16 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {error && (
        <div className="py-16 text-center text-sm text-red-500">{error}</div>
      )}

      {report && (
        <>
          {/* Meta row 1 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5 mb-5">
            <MetaField label="Car Details" value={report.carDetails} />
            <MetaField label="Seller's Name:" value={report.sellerName} />
            <MetaField
              label="Inspection Date | Time"
              value={formatScheduled(report.scheduledAt)}
            />
            <MetaField label="Inspection Location" value={report.location ?? "—"} />
            <MetaField
              label="Inspector's Name"
              value={report.inspectorName ?? "Awaiting assignment"}
            />
            <MetaField
              label="Inspector Rating"
              value={
                report.inspectorRating !== null
                  ? `${Number(report.inspectorRating).toFixed(1)} / 5`
                  : "—"
              }
            />
          </div>

          {/* Meta row 2 */}
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4 mb-6">
            <MetaField
              label="Inspection Fee"
              value={`\u20A6 ${Math.round(report.fee).toLocaleString()}`}
            />
            <div className="min-w-0">
              <div className="text-xs text-gray-400 mb-1">Overall Status</div>
              {report.resultPercent !== null ? (
                <span
                  className={cn(
                    "inline-block rounded-full px-4 py-1.5 text-sm font-bold",
                    ratingColor(report.resultPercent),
                  )}
                >
                  Rating: {report.resultPercent}%
                </span>
              ) : (
                <span
                  className={cn(
                    "inline-block rounded-full px-4 py-1.5 text-sm font-bold",
                    report.status === "pending" && !report.paidAt
                      ? "bg-amber-100 text-amber-700"
                      : report.status === "pending" && report.paidAt
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500",
                  )}
                >
                  {report.status === "pending" && report.paidAt
                    ? "Awaiting Inspector"
                    : titleCase(report.status)}
                </span>
              )}
            </div>
            {!report.paidAt && report.status !== "cancelled" && (
              <button
                onClick={() => setPayOpen(true)}
                className="ml-auto rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                data-testid="button-pay-inspection"
              >
                Pay Inspection Fee
              </button>
            )}
            {report.paidAt && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1.5 text-sm font-semibold">
                Paid
              </span>
            )}
          </div>

          <Separator className="mb-8" />

          {report.report && report.report.summary && (
            <div className="mb-8">
              <h3 className="text-lg font-extrabold text-gray-900 mb-2">
                Summary
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {report.report.summary}
              </p>
            </div>
          )}

          {report.report ? (
            <>
              {/* Category cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-8">
                {categories.map((cat) => (
                  <CategoryCard key={cat.title} cat={cat} />
                ))}
              </div>

              {/* Recommendations + Photos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                <div>
                  <h3 className="text-lg font-extrabold text-gray-900 mb-4">
                    Recommendations
                  </h3>
                  {recommendations.length > 0 ? (
                    <ul className="space-y-2">
                      {recommendations.map((rec, i) => (
                        <li
                          key={`${rec}-${i}`}
                          className="flex items-start gap-2 text-sm text-gray-700"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400">No recommendations.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-extrabold text-gray-900 mb-4">
                    Photos
                  </h3>
                  {report.report.images.length > 0 ? (
                    <ul className="space-y-2">
                      {report.report.images.map((url, i) => (
                        <li key={`${url}-${i}`}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                            data-testid={`button-photo-${i + 1}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View Inspection Photo {i + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400">No photos uploaded.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              The inspector has not submitted the report yet.
            </div>
          )}
        </>
      )}

      {report && (
        <PaymentDialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          amount={Number(report.fee) || 0}
          carMake={report.carDetails}
          walletBalance={walletBalance}
          purpose="inspection"
          inspectionId={report.id}
          onPaid={() =>
            setReport((r) =>
              r ? { ...r, paidAt: new Date().toISOString() } : r,
            )
          }
        />
      )}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Rate Inspector</DialogTitle>
          <DialogDescription>
            Share your feedback about this completed inspection.
          </DialogDescription>
          <div className="space-y-4 pt-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">Rating</p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setInspectorRatingInput(n)}
                    className={cn(
                      "rounded-xl border py-2 text-sm font-bold transition-colors",
                      inspectorRatingInput === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 bg-white text-gray-700 hover:border-primary/50",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">Comment (optional)</p>
              <textarea
                value={inspectorComment}
                onChange={(e) => setInspectorComment(e.target.value)}
                rows={3}
                placeholder="How was the inspection quality and professionalism?"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRateOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitInspectorRating}
                disabled={!inspectorRatingInput || submittingInspectorRating}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {submittingInspectorRating ? "Submitting..." : "Submit Rating"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
