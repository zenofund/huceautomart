import { ChevronLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface ConfirmPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancelPurchase?: () => void;
  onRaiseDispute?: () => void;
  carMake: string;
  busy?: boolean;
}

export function ConfirmPurchaseDialog({
  open,
  onClose,
  onConfirm,
  onCancelPurchase,
  onRaiseDispute,
  carMake,
  busy = false,
}: ConfirmPurchaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-md w-full rounded-2xl overflow-hidden" hideCloseButton>
        <div className="p-6 sm:p-8">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-primary transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>

          <DialogTitle className="text-lg font-bold text-gray-900 mb-2">
            Confirm Purchase of {carMake}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 leading-relaxed mb-6">
            You're about to confirm the purchase of this car. Once confirmed,
            the payment will be released to the seller, and the car will be
            marked as sold.
          </DialogDescription>

          <button
            onClick={() => { onConfirm(); }}
            disabled={busy}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            Confirm Purchase
          </button>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => onCancelPurchase?.()}
              disabled={busy}
              className="rounded-full bg-[#F5C0AE] py-3 text-sm font-semibold text-white hover:bg-[#EFB099] transition-colors disabled:opacity-60"
            >
              Cancel Purchase
            </button>
            <button
              onClick={() => onRaiseDispute?.()}
              disabled={busy}
              className="rounded-full border border-gray-300 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Raise a Dispute
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
