import { Check } from "lucide-react";
import DOMPurify from "dompurify";
import {
  CarTypeIcon,
  GaugeIcon,
  FuelIcon,
  CalendarIcon,
  CogIcon,
  CompassIcon,
  ConditionIcon,
  DoorIcon,
  PaintIcon,
  VinIcon,
} from "@/components/listing-detail/spec-icons";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface ListingRow {
  id: number;
  sellerId: number;
  make: string;
  model: string;
  year: number;
  price: number;
  status: "active" | "sold" | "pending" | "suspended" | "deleted";
  carType: string | null;
  mileage: number;
  fuelType: string | null;
  transmission: string | null;
  driveType: string | null;
  condition: "new" | "used" | "certified_pre_owned";
  doors: number | null;
  color: string | null;
  vin: string | null;
  description: string | null;
  viewCount: number;
  createdAt: string;
}

export interface ImageRow {
  id: number;
  url: string;
  mediaType: "image" | "video";
  fileName: string | null;
  isPrimary: boolean;
}

export interface FeatureRow {
  id: number;
  name: string;
  featureGroup: string | null;
}

export interface SellerRow {
  id: number;
  firstName: string;
  lastName: string;
  businessName: string | null;
  email: string;
}

export interface DetailResponse {
  listing: ListingRow;
  images: ImageRow[];
  features: FeatureRow[];
  seller: SellerRow | null;
  deletionRequestPending: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatInlineMarkup(raw: string) {
  let text = raw;
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    text = blocks.map(b => `<p>${b.replace(/\n/g, '<br/>')}</p>`).join('');
  }
  text = text.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Replace non-breaking spaces from rich text editors to allow proper word-wrapping
  text = text.replace(/&nbsp;/g, " ");
  return DOMPurify.sanitize(text);
}

export function formatNaira(amount: number): string {
  return `\u20A6${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function maskVin(vin: string | null): string {
  if (!vin) return "—";
  if (vin.length <= 5) return vin;
  return vin.slice(0, 5) + "*".repeat(Math.min(4, vin.length - 5));
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export const FEATURE_GROUP_ORDER = [
  "Interior",
  "Safety",
  "Exterior",
  "Comfort & Convenience",
];

// ─── Shared UI Components ─────────────────────────────────────────────────────

export function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900 truncate">{value}</p>
    </div>
  );
}

export function SpecRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Icon className="h-4 w-4 text-gray-400" />
        {label}
      </div>
      <div className="text-sm text-gray-800 font-medium">{value || "—"}</div>
    </>
  );
}

export function OverviewTab({ data }: { data: DetailResponse }) {
  const { listing, images, features } = data;

  const grouped: Record<string, FeatureRow[]> = {};
  for (const f of features) {
    const g = f.featureGroup ?? "Other";
    (grouped[g] ??= []).push(f);
  }

  const orderedGroups = [
    ...FEATURE_GROUP_ORDER.filter((g) => grouped[g]),
    ...Object.keys(grouped).filter((g) => !FEATURE_GROUP_ORDER.includes(g)),
  ];

  const photos = images.filter((i) => i.mediaType === "image");

  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
        {/* Left: specs */}
        <section>
          <h3 className="text-base font-extrabold text-gray-900 mb-4">Car Overview</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <SpecRow icon={CarTypeIcon} label="CarType" value={listing.carType} />
            <SpecRow icon={ConditionIcon} label="Condition" value={titleCase(listing.condition)} />
            <SpecRow
              icon={GaugeIcon}
              label="Mileage"
              value={listing.mileage ? listing.mileage.toLocaleString() : "—"}
            />
            <SpecRow icon={DoorIcon} label="Door" value={listing.doors ? `${listing.doors} Doors` : "—"} />
            <SpecRow icon={FuelIcon} label="Fuel Type" value={listing.fuelType} />
            <SpecRow icon={PaintIcon} label="Color" value={listing.color} />
            <SpecRow icon={CalendarIcon} label="Year" value={String(listing.year)} />
            <SpecRow icon={VinIcon} label="VIN" value={maskVin(listing.vin)} />
            <SpecRow icon={CogIcon} label="Transmission" value={listing.transmission} />
            <SpecRow
              icon={CompassIcon}
              label="Drive Type"
              value={
                listing.driveType
                  ? listing.driveType === "RWD"
                    ? "Rear-Wheel Drive"
                    : listing.driveType === "FWD"
                    ? "Front-Wheel Drive"
                    : listing.driveType === "AWD"
                    ? "All-Wheel Drive"
                    : listing.driveType === "4WD"
                    ? "4-Wheel Drive"
                    : listing.driveType
                  : null
              }
            />
          </dl>
        </section>

        {/* Right: description + photos */}
        <section>
          <h3 className="text-base font-extrabold text-gray-900 mb-3">Description</h3>
          <div 
            className="prose prose-gray max-w-none text-sm text-gray-600 leading-relaxed mb-6 break-words whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ 
              __html: listing.description?.trim() 
                ? formatInlineMarkup(listing.description)
                : "No description provided." 
            }}
          />

          <h3 className="text-base font-extrabold text-gray-900 mb-3">Photos</h3>
          {photos.length === 0 ? (
            <p className="text-sm text-gray-400">No photos uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {photos.map((img, idx) => (
                <li key={img.id}>
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-primary underline underline-offset-2 hover:opacity-80"
                    data-testid={`photo-link-${idx}`}
                  >
                    ViewImage
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Features */}
      <section className="mt-12 pt-8 border-t border-gray-200">
        <h3 className="text-base font-extrabold text-gray-900 mb-4">Features</h3>
        {orderedGroups.length === 0 ? (
          <p className="text-sm text-gray-400">No features selected.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-6">
            {orderedGroups.map((g) => (
              <div key={g}>
                <h4 className="text-sm font-extrabold text-gray-900 mb-2.5">{g}</h4>
                <ul className="space-y-2">
                  {grouped[g].map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
                        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                      </span>
                      {f.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
