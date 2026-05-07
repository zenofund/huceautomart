import { useCallback, useEffect, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { ChevronLeft, Loader2 } from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { inspectorNav } from "@/lib/inspector-nav";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { AddResultDialog } from "@/components/dialogs/add-result-dialog";

interface SectionResult {
  status: string | null;
  percent: number | null;
}

interface InspectionDetail {
  id: number;
  status: "pending" | "assigned" | "active" | "completed" | "cancelled";
  scheduledAt: string | null;
  completedAt: string | null;
  location: string | null;
  fee: number;
  earnings: number;
  type: string | null;
  notes: string | null;
  buyerNotes: string | null;
  buyerName: string;
  sellerName: string;
  carDetails: string;
  inspectorName: string;
  resultPercent: number | null;
  report: {
    id: number;
    summary: string | null;
    recommendedActions: string | null;
    overallPercent: number | null;
    sections: {
      exterior: SectionResult;
      interior: SectionResult;
      engineTransmission: SectionResult;
      suspensionBrakes: SectionResult;
      tiresWheels: SectionResult;
      lightsElectricals: SectionResult;
    };
    images: string[];
    details: Record<string, unknown> | null;
  } | null;
}

type SectionKey = keyof NonNullable<InspectionDetail["report"]>["sections"];

const SECTION_META: Array<{
  key: SectionKey;
  title: string;
  hint: string;
}> = [
  {
    key: "exterior",
    title: "Exterior",
    hint: "Paint condition, dents, scratches, rust.",
  },
  {
    key: "interior",
    title: "Interior",
    hint: "Upholstery, dashboard, electronics (e.g., AC, audio system).",
  },
  {
    key: "engineTransmission",
    title: "Engine & Transmission",
    hint: "Engine performance, oil leaks, transmission shifts.",
  },
  {
    key: "suspensionBrakes",
    title: "Suspension & Brakes",
    hint: "Shock absorbers, brake pads, brake performance.",
  },
  {
    key: "tiresWheels",
    title: "Tires & Wheels",
    hint: "Tread depth, alignment, condition of rims.",
  },
  {
    key: "lightsElectricals",
    title: "Lights & Electricals",
    hint: "Headlights, indicators, battery, wiring.",
  },
];

function formatNaira(n: number) {
  return `₦${n.toLocaleString()}`;
}

function formatDateTime(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} | ${timePart}`;
}

function RatingChip({ percent }: { percent: number | null }) {
  const value = percent ?? 0;
  return (
    <span className="inline-flex items-center rounded-md bg-emerald-50 text-primary text-xs font-medium px-2 py-0.5">
      Rating: {value}%
    </span>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-gray-900 truncate">{value}</div>
    </div>
  );
}

export default function InspectorInspectionDetail() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute<{ id: string }>("/inspector/inspections/:id");
  const id = params?.id;

  const [data, setData] = useState<InspectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspectors/me/inspections/${id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError("You need to sign in as an inspector to view this page.");
        } else if (res.status === 404) {
          setError("Inspection not found.");
        } else {
          setError("Failed to load inspection.");
        }
        return;
      }
      const json = (await res.json()) as InspectionDetail;
      setData(json);
    } catch {
      setError("Failed to load inspection.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <DashboardLayout
      user={user}
      navItems={inspectorNav}
      title="Inspection"
      onLogout={handleLogout}
    >
      {/* Header row: title + action */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          Inspection
        </h1>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          disabled={!data}
          data-testid="btn-add-result"
          onClick={() => setResultOpen(true)}
        >
          Add Result
        </button>
      </div>

      <Link
        href="/inspector/inspections"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary mb-4"
        data-testid="link-back"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </Link>

      {loading ? (
        <div className="py-16 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {error}
        </div>
      ) : data ? (
        <>
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mb-4">
            Vehicle Inspection Report
          </h2>

          {/* Top info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5 mb-6">
            <InfoCell label="Car Details" value={data.carDetails} />
            <InfoCell label="Seller's Name" value={data.sellerName} />
            <InfoCell
              label="Inspection Date | Time"
              value={formatDateTime(data.scheduledAt)}
            />
            <InfoCell
              label="Inspection Location"
              value={data.location ?? "—"}
            />
            <InfoCell label="Inspector's Name" value={data.inspectorName} />
            <InfoCell
              label="Inspection Earnings"
              value={formatNaira(data.earnings)}
            />
            <div className="min-w-0 col-span-2 sm:col-span-1">
              <div className="text-xs text-gray-500 mb-1">Overall Status</div>
              <RatingChip
                percent={
                  data.resultPercent ?? data.report?.overallPercent ?? 0
                }
              />
            </div>
          </div>

          <div className="border-t border-gray-200 mb-6" />

          {/* Section grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {SECTION_META.map((meta) => {
              const section = data.report?.sections[meta.key];
              return (
                <div
                  key={meta.key}
                  className="rounded-2xl border border-gray-100 bg-emerald-50/30 p-4 sm:p-5 flex flex-col gap-2"
                  data-testid={`section-${meta.key}`}
                >
                  <div className="text-sm">
                    <span className="font-bold text-gray-900">
                      {meta.title}:
                    </span>{" "}
                    <span className="text-gray-500">{meta.hint}</span>
                  </div>
                  <div className="text-sm text-gray-800">
                    <span className="font-semibold">Status: </span>
                    <span
                      className={cn(
                        section?.status ? "text-gray-900" : "text-gray-500",
                      )}
                    >
                      {section?.status
                        ? section.status[0].toUpperCase() +
                          section.status.slice(1)
                        : "Nill"}
                    </span>
                  </div>
                  <div>
                    <RatingChip percent={section?.percent ?? null} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommendations + Photos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 mb-2">
                Recommendations
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">
                {data.report?.recommendedActions ||
                  data.report?.summary ||
                  "—"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 mb-2">
                Photos
              </h3>
              {data.report?.images && data.report.images.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {data.report.images.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`Inspection photo ${i + 1}`}
                      className="h-20 w-full object-cover rounded-md border border-gray-100"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">—</p>
              )}
            </div>
          </div>
        </>
      ) : null}

      {data && id ? (
        <AddResultDialog
          open={resultOpen}
          onOpenChange={setResultOpen}
          inspectionId={Number(id)}
          initial={{
            exterior:
              (data.report?.sections.exterior.status as
                | "excellent"
                | "good"
                | "fair"
                | "poor"
                | undefined) ?? undefined,
            interior:
              (data.report?.sections.interior.status as
                | "excellent"
                | "good"
                | "fair"
                | "poor"
                | undefined) ?? undefined,
            engineTransmission:
              (data.report?.sections.engineTransmission.status as
                | "excellent"
                | "good"
                | "fair"
                | "poor"
                | undefined) ?? undefined,
            suspensionBrakes:
              (data.report?.sections.suspensionBrakes.status as
                | "excellent"
                | "good"
                | "fair"
                | "poor"
                | undefined) ?? undefined,
            tiresWheels:
              (data.report?.sections.tiresWheels.status as
                | "excellent"
                | "good"
                | "fair"
                | "poor"
                | undefined) ?? undefined,
            lightsElectricals:
              (data.report?.sections.lightsElectricals.status as
                | "excellent"
                | "good"
                | "fair"
                | "poor"
                | undefined) ?? undefined,
            recommendations:
              data.report?.recommendedActions ?? data.report?.summary ?? "",
            images: data.report?.images ?? [],
          }}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}
    </DashboardLayout>
  );
}
