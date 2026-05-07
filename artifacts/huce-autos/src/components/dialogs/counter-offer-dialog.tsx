import { ChevronLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface CounterOfferDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (amount: number, message: string) => void;
  submitting?: boolean;
  /** The buyer's offer amount, used to seed the counter input. */
  initialAmount: number;
}

/**
 * Counter Offer dialog. Same visual language as Accept Offer but the price
 * input is editable and an optional message can be sent to the buyer.
 */
export function CounterOfferDialog({
  open,
  onClose,
  onConfirm,
  submitting = false,
  initialAmount,
}: CounterOfferDialogProps) {
  const [price, setPrice] = useState<string>(String(initialAmount || ""));
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (open) {
      setPrice(String(initialAmount || ""));
      setMessage("");
    }
  }, [open, initialAmount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const amt = Number(price);
  const valid = Number.isFinite(amt) && amt > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Counter offer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => (submitting ? null : onClose())}
      data-testid="counter-offer-dialog"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={submitting}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4 disabled:opacity-50"
          data-testid="button-counter-back"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
          Counter Offer
        </h2>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          Suggest a different price to the buyer. They'll be notified and can
          accept, decline, or counter back.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Counter Price (₦)
            </label>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Enter counter amount"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              data-testid="input-counter-price"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Add a note for the buyer…"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              data-testid="input-counter-message"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => onConfirm(amt, message.trim())}
            disabled={submitting || !valid}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            data-testid="button-confirm-counter"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Send Counter
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg bg-[#F5C0AE] px-4 py-3 text-sm font-semibold text-white hover:bg-[#EFB099] disabled:opacity-60 transition-colors"
            data-testid="button-cancel-counter"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
