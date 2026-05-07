import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Condition = "excellent" | "good" | "fair" | "poor";

const CONDITION_OPTIONS: ReadonlyArray<{ value: Condition; label: string }> = [
  { value: "excellent", label: "Excellent - 100%" },
  { value: "good", label: "Good - 75%" },
  { value: "fair", label: "Fair - 50%" },
  { value: "poor", label: "Poor - 25%" },
];

const SECTIONS = [
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
    hint: "Headlights, indicators, battery, wiring",
  },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

type FormState = Record<SectionKey, Condition>;

interface AddResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: number;
  initial?: Partial<FormState> & {
    recommendations?: string;
    images?: string[];
  };
  onSaved: () => void;
}

const DEFAULT_FORM: FormState = {
  exterior: "good",
  interior: "good",
  engineTransmission: "good",
  suspensionBrakes: "good",
  tiresWheels: "good",
  lightsElectricals: "good",
};

export function AddResultDialog({
  open,
  onOpenChange,
  inspectionId,
  initial,
  onSaved,
}: AddResultDialogProps) {
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    ...(initial as Partial<FormState> | undefined),
  }));
  const [recommendations, setRecommendations] = useState(
    initial?.recommendations ?? "",
  );
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSection = (key: SectionKey, value: Condition) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const r = await uploadFile(file);
        uploaded.push(r.servingUrl);
      }
      setImages((prev) => [...prev, ...uploaded].slice(0, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inspectors/me/inspections/${inspectionId}/report`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, recommendations, images }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(j?.error ?? "Failed to save result");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save result");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0"
        data-testid="dialog-add-result"
      >
        <DialogTitle className="sr-only">Add Inspection Result</DialogTitle>
        <DialogDescription className="sr-only">
          Record the condition of each vehicle section and upload photos.
        </DialogDescription>

        <div className="p-6 sm:p-8">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary mb-4"
            data-testid="btn-result-back"
          >
            <span aria-hidden>‹</span> Back
          </button>

          <h2 className="text-xl font-extrabold text-center text-gray-900 mb-6">
            Add Result
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            {SECTIONS.map((s) => (
              <div key={s.key} className="min-w-0">
                <p className="text-sm text-gray-900 mb-1">
                  <span className="font-bold">{s.title}:</span>{" "}
                  <span className="text-gray-500">{s.hint}</span>
                </p>
                <label className="text-xs text-gray-500">Status</label>
                <select
                  value={form[s.key]}
                  onChange={(e) =>
                    updateSection(s.key, e.target.value as Condition)
                  }
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid={`select-${s.key}`}
                >
                  {CONDITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <label
              htmlFor="recommendations"
              className="text-sm font-bold text-gray-900"
            >
              Recommendations
            </label>
            <textarea
              id="recommendations"
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder="Enter Description"
              rows={5}
              className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="textarea-recommendations"
            />
          </div>

          <div className="mt-6">
            <p className="text-sm font-bold text-gray-900 mb-2">Photos</p>
            <label
              className={cn(
                "flex flex-col items-center justify-center rounded-md border border-dashed border-gray-200 bg-white py-8 cursor-pointer hover:bg-gray-50 transition-colors",
                uploading && "opacity-60 cursor-wait",
              )}
            >
              <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary text-white mb-2">
                <Upload className="h-4 w-4" />
              </span>
              <span className="text-sm text-gray-700">
                {uploading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                    Uploading…
                  </span>
                ) : (
                  <>
                    Drag &amp; Drop or{" "}
                    <span className="text-primary underline">choose file</span>{" "}
                    to upload
                  </>
                )}
              </span>
              <span className="text-xs text-gray-400 mt-1">
                Supported formats: Jpeg, pdf, Png
              </span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                disabled={uploading}
                data-testid="input-photos"
              />
            </label>

            {images.length > 0 && (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {images.map((src, i) => (
                  <div key={i} className="relative">
                    <img
                      src={src}
                      alt={`Photo ${i + 1}`}
                      className="h-20 w-full object-cover rounded-md border border-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-white border border-gray-200 text-gray-600 hover:text-red-600"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || uploading}
            className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
            data-testid="btn-result-proceed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…
              </>
            ) : (
              "Proceed"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
