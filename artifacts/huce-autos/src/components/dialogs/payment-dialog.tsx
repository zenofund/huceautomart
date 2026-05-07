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

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  amount: number;
  carMake: string;
  walletBalance: number;
  /** Identifies what is being paid for. The server resolves the actual
      amount from the linked record so the client value is advisory only. */
  purpose: "inspection" | "listing_purchase";
  inspectionId?: number;
  listingId?: number;
  /** Called when wallet pay succeeds (Paystack pay redirects away). */
  onPaid?: () => void;
}

type PaymentMethod = "wallet" | "online";

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

export function PaymentDialog({
  open,
  onClose,
  amount,
  carMake,
  walletBalance,
  purpose,
  inspectionId,
  listingId,
  onPaid,
}: PaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>("wallet");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleProceed = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (method === "online") {
        // Initialize a Paystack transaction and redirect to its hosted
        // checkout. The callback page calls /api/payments/verify which
        // applies the credit / inspection-status flip atomically.
        const res = await jsonFetch<{
          reference: string;
          authorizationUrl: string;
        }>("/api/payments/init", {
          method: "POST",
          body: JSON.stringify({
            purpose,
            inspectionId,
            listingId,
            callbackUrl: `${window.location.origin}/payments/callback`,
          }),
        });
        sessionStorage.setItem("huce.lastPaymentRef", res.reference);
        window.location.href = res.authorizationUrl;
        return;
      }

      // Wallet pay path: server-side debit + apply to inspection/listing.
      await jsonFetch("/api/wallet/pay", {
        method: "POST",
        body: JSON.stringify({ purpose, inspectionId, listingId }),
      });
      toast({ title: "Payment successful" });
      onClose();
      onPaid?.();
    } catch (e) {
      toast({
        title: "Payment failed",
        description: e instanceof Error ? e.message : "Try again.",
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
            Make Payment
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500 mb-5">
            Note: This payment is going to be kept in an escrow until car is received
          </DialogDescription>

          {/* Amount */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Amount</label>
            <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {`\u20A6 ${amount.toLocaleString()}.00`}
            </div>
          </div>

          {/* Car Make */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Car Make</label>
            <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {carMake}
            </div>
          </div>

          {/* Payment Method */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-gray-500 mb-2">Payment Method</label>
            <div className="grid grid-cols-2 rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setMethod("wallet")}
                className={cn(
                  "py-3 px-3 text-sm font-medium transition-colors text-center",
                  method === "wallet"
                    ? "bg-primary/10 text-primary"
                    : "bg-white text-gray-500 hover:bg-gray-50",
                )}
              >
                {`Wallet(\u20A6 ${walletBalance.toLocaleString()}.00)`}
              </button>
              <button
                onClick={() => setMethod("online")}
                className={cn(
                  "py-3 px-3 text-sm font-medium transition-colors text-center border-l border-gray-200",
                  method === "online"
                    ? "bg-primary/10 text-primary"
                    : "bg-white text-gray-500 hover:bg-gray-50",
                )}
              >
                Online Payment
              </button>
            </div>
          </div>

          {/* Proceed */}
          <button
            onClick={handleProceed}
            disabled={submitting || (method === "wallet" && walletBalance < amount)}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {method === "wallet" && walletBalance < amount
              ? "Insufficient wallet balance"
              : "Proceed"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
