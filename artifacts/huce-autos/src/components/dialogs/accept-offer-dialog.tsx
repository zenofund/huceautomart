import { ChevronLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";

export interface AcceptOfferDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
  /** The amount being accepted (already in Naira, no conversion). */
  amount: number;
}

function formatNaira(amount: number): string {
  return `\u20A6${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Accept Offer dialog. Matches reference: Back link, title, description,
 * read-only Price showing the offer amount, then "Proceed" + "Cancel" buttons
 * side-by-side full-width.
 */
export function AcceptOfferDialog({
  open,
  onClose,
  onConfirm,
  submitting = false,
  amount,
}: AcceptOfferDialogProps) {
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
      aria-label="Accept offer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => (submitting ? null : onClose())}
      data-testid="accept-offer-dialog"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={submitting}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4 disabled:opacity-50"
          data-testid="button-accept-back"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
          Accept Offer
        </h2>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          By accepting this offer, you agree that the terms meet your
          expectations, and the buyer will be notified to proceed with payment.
        </p>

        <div className="mt-5">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Price
          </label>
          <input
            type="text"
            value={formatNaira(amount)}
            readOnly
            className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-700 cursor-not-allowed"
            data-testid="input-accept-price"
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            data-testid="button-confirm-accept"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Proceed
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg bg-[#F5C0AE] px-4 py-3 text-sm font-semibold text-white hover:bg-[#EFB099] disabled:opacity-60 transition-colors"
            data-testid="button-cancel-accept"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
