import { ChevronLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";

export interface DeleteListingDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
  /** Short subtitle e.g. "Listing #00013 — Toyota Corolla (2020)". */
  subtitle?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

/**
 * Confirmation dialog for requesting listing deletion.
 *
 * Matches the spec: "Back" link top-left, title, description, two side-by-side
 * full-width buttons (green "Request Deletion" + peach "Cancel").
 */
export function DeleteListingDialog({
  open,
  onClose,
  onConfirm,
  submitting = false,
  subtitle,
  title = "Are you sure you want to delete this listing?",
  description = "Deleting this listing will remove it from the platform and it will no longer be visible to buyers. This action may be reviewed by the admin for compliance.",
  confirmLabel = "Request Deletion",
}: DeleteListingDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm deletion request"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => (submitting ? null : onClose())}
      data-testid="delete-listing-dialog"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Back */}
        <button
          onClick={onClose}
          disabled={submitting}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4 disabled:opacity-50"
          data-testid="button-delete-back"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          {description}
          {subtitle && (
            <>
              <br />
              <span className="text-gray-700 font-medium">{subtitle}</span>
            </>
          )}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            data-testid="button-confirm-delete"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg bg-[#F5C0AE] px-4 py-3 text-sm font-semibold text-white hover:bg-[#EFB099] disabled:opacity-60 transition-colors"
            data-testid="button-cancel-delete"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
