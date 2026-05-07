import { ChevronLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";

export interface DeclineOfferDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
}

/**
 * Decline Offer confirmation. Matches reference: Back link, title,
 * description, then a green Proceed + peach Cancel button side-by-side.
 */
export function DeclineOfferDialog({
  open,
  onClose,
  onConfirm,
  submitting = false,
}: DeclineOfferDialogProps) {
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
      aria-label="Decline offer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => (submitting ? null : onClose())}
      data-testid="decline-offer-dialog"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={submitting}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4 disabled:opacity-50"
          data-testid="button-decline-back"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
          Decline Offer
        </h2>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          Declining this offer indicates it doesn't meet your expectations. The
          buyer will be notified of your decision.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            data-testid="button-confirm-decline"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Proceed
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg bg-[#F5C0AE] px-4 py-3 text-sm font-semibold text-white hover:bg-[#EFB099] disabled:opacity-60 transition-colors"
            data-testid="button-cancel-decline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
