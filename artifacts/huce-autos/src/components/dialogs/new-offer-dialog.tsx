import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface NewOfferDialogProps {
  open: boolean;
  onClose: () => void;
  suggestedPrices?: number[];
  /** Listing the buyer is making an offer on. When omitted, the dialog
      falls back to the legacy alert behaviour (used by some mock pages). */
  listingId?: number;
  /** Called after the offer is created successfully (after the dialog closes). */
  onCreated?: (offerId: number) => void;
}

const DEFAULT_PRICES = [44000000, 54000000, 43000000, 47000000, 45000000];

function fmt(n: number) {
  return `\u20A6 ${n.toLocaleString()}`;
}

export function NewOfferDialog({
  open,
  onClose,
  suggestedPrices = DEFAULT_PRICES,
  listingId,
  onCreated,
}: NewOfferDialogProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pickChip = (val: number) => {
    setSelected(val);
    setPrice(String(val));
  };

  const handleSubmit = async () => {
    if (!price) return;
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) return;

    // Legacy fallback: if no listingId is provided (e.g. mock buyer-offer-detail
    // page), keep the previous alert behaviour so we don't break those views.
    if (!listingId) {
      toast({
        title: "Offer submitted",
        description: `Offer of \u20A6${amount.toLocaleString()} submitted.`,
      });
      setPrice("");
      setSelected(null);
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, amount }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error ?? "Failed to submit offer");
      }
      const json = (await res.json()) as { offer: { id: number } };
      toast({
        title: "Offer submitted",
        description: "The seller has been notified.",
      });
      setPrice("");
      setSelected(null);
      onClose();
      onCreated?.(json.offer.id);
    } catch (err) {
      toast({
        title: "Couldn't submit offer",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-md w-full rounded-2xl overflow-hidden" hideCloseButton>
        <div className="p-6 sm:p-8">
          {/* Back */}
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-primary transition-colors mb-5"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>

          <DialogTitle className="text-lg font-bold text-gray-900 mb-1">
            Make New Offer
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 mb-5 leading-relaxed">
            Negotiate the price of your dream car directly with the seller – simple, secure, and hassle-free.
          </DialogDescription>

          {/* Price chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            {suggestedPrices.map((p) => (
              <button
                key={p}
                onClick={() => pickChip(p)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  selected === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-primary/30 bg-transparent text-primary hover:bg-primary/5",
                )}
              >
                {fmt(p)}
              </button>
            ))}
          </div>

          {/* Price input */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => { setPrice(e.target.value); setSelected(null); }}
              placeholder="Enter Price"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!price || submitting}
            className={cn(
              "w-full rounded-full py-3.5 text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-2",
              price && !submitting
                ? "bg-primary hover:bg-primary/90"
                : "bg-primary/40 cursor-not-allowed",
            )}
            data-testid="button-submit-offer"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Offer
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
