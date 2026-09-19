import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Bold,
  Check,
  Download,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Strikethrough,
  Trash2,
  Underline,
  Upload,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/upload";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

// ─── Types ───────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface FeatureItem {
  id: number;
  name: string;
}

interface FeaturesResponse {
  groups: Record<string, FeatureItem[]>;
}

interface MediaItem {
  url: string;
  mediaType: "image" | "video";
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

interface FormState {
  make: string;
  model: string;
  year: string;
  price: string;
  location: string;
  carType: string;
  mileage: string;
  fuelType: string;
  transmission: string;
  driveType: string;
  condition: string;
  doors: string;
  color: string;
  vin: string;
  description: string;
  isFeatured: boolean;
  featureIds: Set<number>;
  media: MediaItem[];
}

function normalizeMediaUrl(url: string): string {
  const v = String(url ?? "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith("/api/")) return v;
  if (v.startsWith("/objects/") || v.startsWith("/local/")) return `/api/storage${v}`;
  if (v.startsWith("/storage/")) return `/api${v}`;
  return v;
}

function mediaPriority(url: string): number {
  const v = String(url ?? "").toLowerCase();
  if (v.includes("/api/storage/local/")) return 0;
  if (v.includes("/api/storage/objects/")) return 1;
  if (v.includes("storage.googleapis.com")) return 2;
  if (v.includes("images.unsplash.com")) return 9;
  return 5;
}

const EMPTY_FORM: FormState = {
  make: "",
  model: "",
  year: "",
  price: "",
  location: "",
  carType: "",
  mileage: "",
  fuelType: "",
  transmission: "",
  driveType: "",
  condition: "",
  doors: "",
  color: "",
  vin: "",
  description: "",
  isFeatured: false,
  featureIds: new Set(),
  media: [],
};

// ─── Static option lists ─────────────────────────────────────────────────────
const CAR_MAKES = [
  "Toyota",
  "Honda",
  "Lexus",
  "Mercedes-Benz",
  "BMW",
  "Hyundai",
  "Kia",
  "Ford",
  "Nissan",
  "Volkswagen",
  "Mazda",
  "Acura",
  "Land Rover",
  "Audi",
  "Porsche",
  "Other",
];

const CAR_TYPES = [
  "Sedan",
  "SUV",
  "Hatchback",
  "Coupe",
  "Convertible",
  "Pickup",
  "Wagon",
  "Van",
  "Bus",
];

const FUEL_TYPES = ["Petrol", "Diesel", "Hybrid", "Electric", "CNG"];
const TRANSMISSIONS = ["Automatic", "Manual", "CVT", "Semi-Automatic"];
const DRIVE_TYPES = ["FWD", "RWD", "AWD", "4WD"];
const CONDITIONS: { label: string; value: "new" | "used" | "certified_pre_owned" }[] = [
  { label: "New", value: "new" },
  { label: "Used", value: "used" },
  { label: "Certified Pre-Owned", value: "certified_pre_owned" },
];
const DOORS = ["2", "3", "4", "5"];
const NIGERIAN_LOCATIONS = [
  "Lagos",
  "Abuja",
  "Port Harcourt",
  "Ibadan",
  "Kano",
  "Benin City",
  "Enugu",
  "Kaduna",
  "Jos",
  "Calabar",
  "Other",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => String(CURRENT_YEAR - i));

// ─── Component ───────────────────────────────────────────────────────────────
export interface ListingForEdit {
  id: number;
  make: string;
  model: string;
  year: number;
  price: number;
  location: string;
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
  isFeatured?: boolean;
  featureIds?: number[];
  images?: Array<{
    url: string;
    mediaType: "image" | "video";
    fileName: string | null;
  }>;
}

interface AddListingDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  mode?: "create" | "edit";
  listing?: ListingForEdit | null;
  /** Override the submit URL. When set, this URL is used instead of the
   *  auto-computed `/api/listings` or `/api/listings/:id` URL. */
  submitUrl?: string;
  /** Maximum photos allowed by the seller's active plan (default: 20). */
  maxPhotos?: number;
  /** Whether the active subscription allows featured listings. */
  featuredListingEnabled?: boolean;
}

export function AddListingDialog({
  open,
  onClose,
  onCreated,
  mode = "create",
  listing = null,
  submitUrl,
  maxPhotos = 20,
  featuredListingEnabled = true,
}: AddListingDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [featureGroups, setFeatureGroups] = useState<
    Record<string, FeatureItem[]>
  >({});
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  // Fetch DB categories for the Car Type selector when dialog opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/listings/categories");
        if (!res.ok) return;
        const rows = (await res.json()) as Array<{ name: string }>;
        if (rows.length > 0) setCategoryNames(rows.map((r) => r.name));
      } catch {
        // silently fall back to static list
      }
    })();
  }, [open]);

  // Reset whenever dialog opens — seed from `listing` when in edit mode.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    if (mode === "edit" && listing) {
      const existingMedia: MediaItem[] = (listing.images ?? [])
        .map((img) => ({
          url: normalizeMediaUrl(img.url),
          mediaType: img.mediaType,
          fileName: img.fileName ?? img.url.split("/").pop() ?? "image",
          fileSize: 0,
          uploadedAt: "",
        }))
        .sort((a, b) => mediaPriority(a.url) - mediaPriority(b.url));
      setForm({
        make: listing.make,
        model: listing.model,
        year: String(listing.year),
        price: String(listing.price),
        location: listing.location,
        carType: listing.carType ?? "",
        mileage: listing.mileage ? String(listing.mileage) : "",
        fuelType: listing.fuelType ?? "",
        transmission: listing.transmission ?? "",
        driveType: listing.driveType ?? "",
        condition: listing.condition ?? "used",
        doors: listing.doors ? String(listing.doors) : "",
        color: listing.color ?? "",
        vin: listing.vin ?? "",
        description: listing.description ?? "",
        isFeatured: listing.isFeatured ?? false,
        featureIds: new Set(listing.featureIds ?? []),
        media: existingMedia,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, listing]);

  // Load features when stepping into step 2
  useEffect(() => {
    if (!open || step !== 2 || Object.keys(featureGroups).length > 0) return;
    (async () => {
      try {
        const res = await fetch("/api/listings/features", {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as FeaturesResponse;
        setFeatureGroups(json.groups);
      } catch {
        toast({
          title: "Couldn't load features",
          description: "You can still continue without selecting any.",
          variant: "destructive",
        });
      }
    })();
  }, [open, step, featureGroups, toast]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleFeature(id: number) {
    setForm((f) => {
      const next = new Set(f.featureIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, featureIds: next };
    });
  }

  function validateStep1(): string | null {
    if (!form.make) return "Pick a Car Make.";
    if (!form.model.trim()) return "Enter the Model.";
    if (!form.year) return "Pick the Year.";
    if (!form.price || Number(form.price) <= 0)
      return "Enter a valid Price.";
    if (!form.location) return "Pick a Location.";
    return null;
  }

  function handleNext() {
    if (step === 1) {
      const err = validateStep1();
      if (err) {
        toast({ title: "Missing details", description: err, variant: "destructive" });
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
    }
  }

  function handleBack() {
    if (step === 1) {
      onClose();
      return;
    }
    setStep((s) => (s === 3 ? 2 : 1));
  }

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const allFiles = Array.from(files);
    e.target.value = "";

    // Enforce plan photo cap before uploading
    const slots = maxPhotos - form.media.length;
    if (slots <= 0) {
      toast({
        title: "Photo limit reached",
        description: `Your plan allows up to ${maxPhotos} photo${maxPhotos !== 1 ? "s" : ""} per listing.`,
        variant: "destructive",
      });
      return;
    }
    const list = allFiles.slice(0, slots);
    if (list.length < allFiles.length) {
      toast({
        title: "Some files skipped",
        description: `Your plan allows up to ${maxPhotos} photo${maxPhotos !== 1 ? "s" : ""} per listing. Only ${list.length} file${list.length !== 1 ? "s" : ""} will be uploaded.`,
        variant: "destructive",
      });
    }

    setUploadingCount((c) => c + list.length);

    // Upload each file via presigned URL flow. We do this in parallel and
    // append successful uploads only.
    const results = await Promise.allSettled(
        list.map(async (file) => {
          const isVideo = file.type.startsWith("video/");
          const { servingUrl } = await uploadFile(file, { watermark: !isVideo });
          const item: MediaItem = {
          url: normalizeMediaUrl(servingUrl),
          mediaType: isVideo ? "video" : "image",
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        };
        return item;
      }),
    );

    setUploadingCount((c) => Math.max(0, c - list.length));

    const ok: MediaItem[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") ok.push(r.value);
      else errors.push(r.reason instanceof Error ? r.reason.message : "Unknown error");
    }
    if (ok.length > 0) {
      setForm((f) => ({ ...f, media: [...ok, ...f.media].slice(0, maxPhotos) }));
    }
    if (errors.length > 0) {
      toast({
        title: errors.length === list.length ? "Upload failed" : "Some uploads failed",
        description: errors[0] ?? `${errors.length} file${errors.length === 1 ? "" : "s"} couldn't be uploaded.`,
        variant: "destructive",
      });
    }
  }

  function removeMedia(idx: number) {
    setForm((f) => ({ ...f, media: f.media.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const isEdit = mode === "edit" && listing;
      // In edit mode, only send `images` when the user explicitly added new
      // media — otherwise the backend would replace-all and wipe existing
      // photos. Create mode always sends the (possibly empty) array.
      const includeImages = !isEdit || form.media.length > 0;
      const payload: Record<string, unknown> = {
        make: form.make,
        model: form.model.trim(),
        year: Number(form.year),
        price: Number(form.price),
        location: form.location,
        carType: form.carType || null,
        mileage: form.mileage ? Number(form.mileage) : 0,
        fuelType: form.fuelType || null,
        transmission: form.transmission || null,
        driveType: form.driveType || null,
        condition: form.condition || "used",
        doors: form.doors ? Number(form.doors) : null,
        color: form.color || null,
        vin: form.vin || null,
        description: form.description || null,
        featureIds: Array.from(form.featureIds),
      };
      if (featuredListingEnabled) {
        payload.isFeatured = form.isFeatured;
      }
      if (includeImages) {
        payload.images = form.media.map((m) => ({
          url: m.url,
          mediaType: m.mediaType,
          fileName: m.fileName,
          fileSize: m.fileSize,
        }));
      }

      const url = submitUrl
        ? submitUrl
        : isEdit
          ? `/api/listings/${listing!.id}`
          : "/api/listings";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          json?.error ?? (isEdit ? "Couldn't update listing." : "Couldn't create listing."),
        );
      }
      toast({
        title: isEdit ? "Listing updated" : "Listing created",
        description: isEdit
          ? "Your changes have been saved."
          : "Your new listing is now visible to buyers.",
      });
      onCreated();
      onClose();
    } catch (err) {
      toast({
        title: mode === "edit" ? "Couldn't update listing" : "Couldn't create listing",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const stepLabel = useMemo(
    () => (step === 1 ? "Car Overview" : step === 2 ? "Features" : "Description"),
    [step],
  );
  const submitDisabled = submitting || uploadingCount > 0;

  return (
    <AppDialog
      open={open}
      onClose={() => (submitting ? null : onClose())}
      title={
        mode === "edit"
          ? "Edit Listing"
          : step === 1
            ? "Add New Listing"
            : "Add Listing"
      }
      subtitle={stepLabel}
      onBack={handleBack}
      size="xl"
      footer={
        <button
          onClick={step === 3 ? handleSubmit : handleNext}
          disabled={submitDisabled}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          data-testid={step === 3 ? "button-submit-listing" : "button-next-step"}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === 3 ? (mode === "edit" ? "Save Changes" : "Submit") : "Next"}
        </button>
      }
    >
      {/* Step indicator stays compact on the left half; form fields use the
          full dialog width with their existing 3-column layout. */}
      <div className="max-w-md">
        <StepIndicator step={step} />
      </div>
      <div className="mt-6">
        {step === 1 && (
          <Step1Overview
            form={form}
            set={set}
            categoryNames={categoryNames}
            featuredListingEnabled={featuredListingEnabled}
          />
        )}
        {step === 2 && (
          <Step2Features
            groups={featureGroups}
            selected={form.featureIds}
            onToggle={toggleFeature}
          />
        )}
        {step === 3 && (
          <Step3Description
            form={form}
            set={set}
            onFiles={handleFiles}
            onRemoveMedia={removeMedia}
            uploadingCount={uploadingCount}
            maxPhotos={maxPhotos}
          />
        )}
      </div>
    </AppDialog>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const dots: { n: Step; done: boolean; current: boolean }[] = [
    { n: 1, done: step > 1, current: step === 1 },
    { n: 2, done: step > 2, current: step === 2 },
    { n: 3, done: false, current: step === 3 },
  ];
  return (
    <div className="flex items-center gap-2">
      {dots.map((d, i) => (
        <div key={d.n} className="flex items-center gap-2 flex-1 last:flex-none">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-colors",
              d.done || d.current
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-400",
            )}
          >
            {d.n}
          </div>
          {i < dots.length - 1 && (
            <div
              className={cn(
                "h-[3px] flex-1 rounded-full transition-colors",
                step > d.n ? "bg-primary" : "bg-gray-200",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Reusable form atoms ─────────────────────────────────────────────────────
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-800 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { label: string; value: string }[];
  testId?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className={cn(
          "w-full appearance-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors",
          value === "" ? "text-gray-400" : "text-gray-800",
        )}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-gray-800">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5.5 7.5L10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: "text" | "number";
  testId?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      data-testid={testId}
      className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
    />
  );
}

// ─── Step 1: Car Overview (3-col grid) ───────────────────────────────────────
function Step1Overview({
  form,
  set,
  categoryNames,
  featuredListingEnabled,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  categoryNames: string[];
  featuredListingEnabled: boolean;
}) {
  const carTypeOptions = (categoryNames.length > 0 ? categoryNames : CAR_TYPES).map(
    (c) => ({ label: c, value: c }),
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
      <Field label="Car Make">
        <Select
          value={form.make}
          onChange={(v) => set("make", v)}
          placeholder="Select Car Make"
          options={CAR_MAKES.map((m) => ({ label: m, value: m }))}
          testId="select-make"
        />
      </Field>
      <Field label="Model">
        <TextInput
          value={form.model}
          onChange={(v) => set("model", v)}
          placeholder="Enter Car Model"
          testId="input-model"
        />
      </Field>
      <Field label="Year">
        <Select
          value={form.year}
          onChange={(v) => set("year", v)}
          placeholder="Select Car Year"
          options={YEARS.map((y) => ({ label: y, value: y }))}
          testId="select-year"
        />
      </Field>

      <Field label="Price">
        <TextInput
          value={form.price}
          onChange={(v) => set("price", v.replace(/[^\d]/g, ""))}
          placeholder="Enter Car Price"
          type="number"
          testId="input-price"
        />
      </Field>
      <Field label="Location">
        <Select
          value={form.location}
          onChange={(v) => set("location", v)}
          placeholder="Select Location"
          options={NIGERIAN_LOCATIONS.map((l) => ({ label: l, value: l }))}
          testId="select-location"
        />
      </Field>
      <Field label="Car Type">
        <Select
          value={form.carType}
          onChange={(v) => set("carType", v)}
          placeholder="Select Type"
          options={carTypeOptions}
          testId="select-car-type"
        />
      </Field>

      <Field label="Mileage">
        <TextInput
          value={form.mileage}
          onChange={(v) => set("mileage", v.replace(/[^\d]/g, ""))}
          placeholder="Enter Mileage (km)"
          type="number"
          testId="input-mileage"
        />
      </Field>
      <Field label="Fuel Type">
        <Select
          value={form.fuelType}
          onChange={(v) => set("fuelType", v)}
          placeholder="Select Fuel Type"
          options={FUEL_TYPES.map((f) => ({ label: f, value: f }))}
          testId="select-fuel"
        />
      </Field>
      <Field label="Transmission">
        <Select
          value={form.transmission}
          onChange={(v) => set("transmission", v)}
          placeholder="Select Transmission"
          options={TRANSMISSIONS.map((t) => ({ label: t, value: t }))}
          testId="select-transmission"
        />
      </Field>

      <Field label="Drive Type">
        <Select
          value={form.driveType}
          onChange={(v) => set("driveType", v)}
          placeholder="Select Drive Type"
          options={DRIVE_TYPES.map((d) => ({ label: d, value: d }))}
          testId="select-drive"
        />
      </Field>
      <Field label="Condition">
        <Select
          value={form.condition}
          onChange={(v) => set("condition", v)}
          placeholder="Select Car Condition"
          options={CONDITIONS}
          testId="select-condition"
        />
      </Field>
      <Field label="Door">
        <Select
          value={form.doors}
          onChange={(v) => set("doors", v)}
          placeholder="Select Doors"
          options={DOORS.map((d) => ({ label: d, value: d }))}
          testId="select-doors"
        />
      </Field>

      <Field label="Color">
        <TextInput
          value={form.color}
          onChange={(v) => set("color", v)}
          placeholder="Enter Color"
          testId="input-color"
        />
      </Field>
      <Field label="VIN">
        <TextInput
          value={form.vin}
          onChange={(v) => set("vin", v)}
          placeholder="Enter VIN Number"
          testId="input-vin"
        />
      </Field>
      <Field label="Negotiable Price">
        <Select
          value={form.price ? "yes" : ""}
          onChange={() => {}}
          placeholder="Auto-set after Price"
          options={[
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
          ]}
          testId="select-negotiable"
        />
      </Field>

      <div className="sm:col-span-2 lg:col-span-3">
        <label
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3",
            featuredListingEnabled
              ? "border-primary/20 bg-primary/5 cursor-pointer"
              : "border-gray-200 bg-gray-50 cursor-not-allowed",
          )}
          data-testid="toggle-is-featured"
        >
          <input
            type="checkbox"
            checked={form.isFeatured}
            disabled={!featuredListingEnabled}
            onChange={(e) => set("isFeatured", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Feature this listing</p>
            <p className="text-xs text-gray-500">
              {featuredListingEnabled
                ? "Boost visibility by marking this listing as featured."
                : "Your current subscription does not include featured listing placement."}
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}

// ─── Step 2: Features ────────────────────────────────────────────────────────
function Step2Features({
  groups,
  selected,
  onToggle,
}: {
  groups: Record<string, FeatureItem[]>;
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  const order = ["Interior", "Safety", "Exterior", "Comfort & Convenience"];
  const ordered = order
    .filter((g) => groups[g])
    .map((g) => [g, groups[g]] as const);
  for (const k of Object.keys(groups)) {
    if (!order.includes(k)) ordered.push([k, groups[k]]);
  }

  if (ordered.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Loading features…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ordered.map(([groupName, items], idx) => (
        <section key={groupName}>
          <h3 className="text-sm font-extrabold text-gray-900 mb-2">
            {groupName}
          </h3>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            {items.map((it) => {
              const checked = selected.has(it.id);
              return (
                <label
                  key={it.id}
                  className="inline-flex items-center gap-2 cursor-pointer"
                  data-testid={`feature-${it.id}`}
                >
                  <span
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
                      checked
                        ? "bg-primary border-primary text-white"
                        : "border-gray-300 bg-white",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => onToggle(it.id)}
                  />
                  <span className="text-sm text-gray-700">{it.name}</span>
                </label>
              );
            })}
          </div>
          {idx === 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Note —  You have to select 3 or 4 options
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

// ─── Step 3: Description + Media ─────────────────────────────────────────────
function Step3Description({
  form,
  set,
  onFiles,
  onRemoveMedia,
  uploadingCount,
  maxPhotos,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onFiles: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveMedia: (idx: number) => void;
  uploadingCount: number;
  maxPhotos: number;
}) {
  const atPhotoLimit = form.media.length >= maxPhotos;

  return (
    <div className="space-y-5">
      <Field label="Description">
        <div className="rounded-xl border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-colors">
          <ReactQuill
            theme="snow"
            value={form.description}
            onChange={(value) => set("description", value)}
            placeholder="Enter Description"
            className="min-h-[150px] border-none"
            modules={{
              toolbar: [
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['clean']
              ]
            }}
          />
        </div>
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-semibold text-gray-800">
            Photos, Videos
          </label>
          <span className={cn(
            "text-xs font-medium",
            atPhotoLimit ? "text-red-500" : "text-gray-400",
          )}>
            {form.media.length} / {maxPhotos} photo{maxPhotos !== 1 ? "s" : ""}
          </span>
        </div>
        <label
          htmlFor="media-upload"
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 transition-colors",
            uploadingCount > 0 || atPhotoLimit
              ? "cursor-default opacity-60"
              : "cursor-pointer hover:border-primary/40",
          )}
          data-testid="dropzone-media"
        >
          <span className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full text-white",
            atPhotoLimit ? "bg-gray-400" : "bg-primary",
          )}>
            {uploadingCount > 0
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Upload className="h-4 w-4" />}
          </span>
          {uploadingCount > 0 ? (
            <p className="text-sm text-gray-700 font-medium">
              Uploading {uploadingCount} file{uploadingCount !== 1 ? "s" : ""}…
            </p>
          ) : atPhotoLimit ? (
            <p className="text-sm text-gray-500 font-medium text-center">
              Photo limit reached ({maxPhotos}/{maxPhotos}).<br />
              <span className="text-xs font-normal">Remove a photo to add another, or upgrade your plan.</span>
            </p>
          ) : (
            <p className="text-sm text-gray-700">
              Drag &amp; Drop or{" "}
              <span className="text-primary font-semibold">choose file</span> to
              upload
            </p>
          )}
          <p className="text-xs text-gray-400">
            Supported formats: Mp4, Jpeg, Png
          </p>
          <input
            id="media-upload"
            type="file"
            accept="image/png,image/jpeg,video/mp4"
            multiple
            onChange={onFiles}
            disabled={uploadingCount > 0 || atPhotoLimit}
            className="sr-only"
          />
        </label>

        {form.media.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              {form.media.length} / {maxPhotos} file{maxPhotos !== 1 ? "s" : ""} selected
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {form.media.map((m, idx) => (
                <div
                  key={`${m.url}-${idx}`}
                  className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-[4/3]"
                  data-testid={`media-item-${idx}`}
                >
                  {m.mediaType === "video" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
                      </svg>
                      <span className="text-xs font-medium truncate max-w-[80px] px-1">{m.fileName}</span>
                    </div>
                  ) : (
                    <img
                      src={normalizeMediaUrl(m.url)}
                      alt={m.fileName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80";
                      }}
                    />
                  )}

                  {/* Hover overlay with actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRemoveMedia(idx)}
                      className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full transition-colors"
                      aria-label="Remove file"
                      data-testid={`button-remove-media-${idx}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={normalizeMediaUrl(m.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-full transition-colors"
                      aria-label="View file"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  {/* Type badge */}
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/50 text-white uppercase tracking-wide">
                    {m.mediaType === "video" ? "vid" : "img"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-gray-100 hover:text-gray-700 transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${date}   ${h}:${m.toString().padStart(2, "0")}${ampm}`;
}
