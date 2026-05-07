import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface InspectionDialogProps {
  open: boolean;
  onClose: () => void;
  listingId: number;
  carMake?: string;
  /** Called with the new inspection id after booking + payment completes. */
  onCreated?: (inspectionId: number) => void;
}

interface InspectionType {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationHours: number;
}

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

function formatNaira(n: number) {
  return `\u20A6 ${Math.round(n).toLocaleString()}`;
}

type Step = "book" | "pay";
type PayMethod = "wallet" | "online";

export function InspectionDialog({
  open,
  onClose,
  listingId,
  carMake = "Vehicle",
  onCreated,
}: InspectionDialogProps) {
  const { toast } = useToast();

  // ── Step 1: booking form ─────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("book");
  const [types, setTypes] = useState<InspectionType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Step 2: payment ──────────────────────────────────────────────────────
  const [bookedId, setBookedId] = useState<number | null>(null);
  const [bookedFee, setBookedFee] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>("wallet");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);

  // Reset every time the dialog reopens.
  useEffect(() => {
    if (!open) return;
    setStep("book");
    setSelectedTypeId(null);
    setDate("");
    setTimeFrom("");
    setTimeTo("");
    setLoadError(null);
    setBookedId(null);
    setBookedFee(0);
    setPayMethod("wallet");
    setWalletBalance(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await jsonFetch<{ data: InspectionType[] }>(
          "/api/inspection-types",
        );
        if (cancelled) return;
        setTypes(res.data);
        if (res.data.length > 0) setSelectedTypeId(res.data[0].id);
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const canSubmit = useMemo(
    () => selectedTypeId !== null && date.length > 0 && timeFrom.length > 0 && !submitting,
    [selectedTypeId, date, timeFrom, submitting],
  );

  // Step 1 → create the inspection record, then advance to payment step.
  const handleBook = async () => {
    if (!canSubmit || selectedTypeId === null) return;
    setSubmitting(true);
    try {
      const scheduledAt = new Date(`${date}T${timeFrom}`).toISOString();
      const timeWindow = timeTo ? `${timeFrom} - ${timeTo}` : timeFrom;

      const res = await jsonFetch<{ inspection: { id: number; fee: number } }>(
        "/api/buyer/inspections",
        {
          method: "POST",
          body: JSON.stringify({ listingId, inspectionTypeId: selectedTypeId, scheduledAt, timeWindow }),
        },
      );

      // Advance to payment step and lazily fetch wallet balance.
      setBookedId(res.inspection.id);
      setBookedFee(Number(res.inspection.fee));
      setStep("pay");

      jsonFetch<{ wallet: { balance: number } }>("/api/wallet")
        .then((w) => setWalletBalance(w.wallet?.balance ?? 0))
        .catch(() => setWalletBalance(0));
    } catch (e) {
      toast({
        title: "Could not book inspection",
        description: e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2 → actually charge the buyer.
  const handlePay = async () => {
    if (!bookedId || paying) return;
    setPaying(true);
    try {
      if (payMethod === "online") {
        const res = await jsonFetch<{ reference: string; authorizationUrl: string }>(
          "/api/payments/init",
          {
            method: "POST",
            body: JSON.stringify({
              purpose: "inspection",
              inspectionId: bookedId,
              callbackUrl: `${window.location.origin}/payments/callback`,
            }),
          },
        );
        sessionStorage.setItem("huce.lastPaymentRef", res.reference);
        window.location.href = res.authorizationUrl;
        return;
      }

      // Wallet path.
      await jsonFetch("/api/wallet/pay", {
        method: "POST",
        body: JSON.stringify({ purpose: "inspection", inspectionId: bookedId }),
      });
      toast({ title: "Inspection booked & paid", description: "An inspector will be assigned shortly." });
      onClose();
      onCreated?.(bookedId);
    } catch (e) {
      toast({
        title: "Payment failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  };

  const walletLoaded = walletBalance !== null;
  const canAffordWallet = walletLoaded && walletBalance! >= bookedFee;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
        {/* ── Step 1: Booking form ──────────────────────────────────────── */}
        {step === "book" && (
          <>
            <div className="px-5 pt-4 pb-1">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                data-testid="button-back"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            </div>

            <div className="px-5 pb-5">
              <DialogTitle className="text-base font-bold text-gray-900">
                Car Inspection
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 mt-1">
                Inspect your car without hassle — let a professional inspect your dream car.
              </DialogDescription>

              {/* Inspection type options */}
              <div className="mt-5 space-y-3">
                {loadError ? (
                  <div className="text-sm text-red-500 py-4">{loadError}</div>
                ) : types === null ? (
                  <div className="py-4 flex items-center justify-center text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : types.length === 0 ? (
                  <div className="text-sm text-gray-500 py-4">
                    No inspection options are available right now.
                  </div>
                ) : (
                  types.map((t) => {
                    const selected = selectedTypeId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTypeId(t.id)}
                        className={cn(
                          "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-gray-200 hover:bg-gray-50",
                        )}
                        data-testid={`button-type-${t.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-1 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                              selected ? "border-primary" : "border-gray-300",
                            )}
                          >
                            {selected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-bold text-gray-900">
                                {t.name}:
                              </div>
                              <span className="rounded-full bg-primary/10 text-primary text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap">
                                {formatNaira(Number(t.price))}
                              </span>
                            </div>
                            {t.description && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {t.description}
                              </p>
                            )}
                            <p className="text-[11px] text-gray-400 mt-1">
                              Price is relative to the location of the car
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Pick Date */}
              <div className="mt-5">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Pick Date
                </label>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  data-testid="input-date"
                />
              </div>

              {/* Time From / Time To */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Time (From)
                  </label>
                  <input
                    type="time"
                    value={timeFrom}
                    onChange={(e) => setTimeFrom(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    data-testid="input-time-from"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Time (To)
                  </label>
                  <input
                    type="time"
                    value={timeTo}
                    onChange={(e) => setTimeTo(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    data-testid="input-time-to"
                  />
                </div>
              </div>

              <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                By proceeding with the inspection, you acknowledge that the
                inspection report is a visual assessment of the vehicle's condition
                at the time of inspection. Huce Autos is not liable for any issues
                discovered after the transaction. Inspection fees are non-refundable.
              </p>

              <button
                onClick={handleBook}
                disabled={!canSubmit}
                className="mt-4 w-full rounded-lg bg-primary text-white text-sm font-semibold py-2.5 hover:bg-primary/90 transition-colors disabled:opacity-60"
                data-testid="button-pay"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Booking…
                  </span>
                ) : (
                  "Continue to Payment"
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Payment ───────────────────────────────────────────── */}
        {step === "pay" && (
          <div className="p-6 sm:p-8">
            <button
              onClick={() => setStep("book")}
              className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-primary transition-colors mb-5"
              data-testid="button-back-to-book"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>

            <DialogTitle className="text-lg font-bold text-gray-900 mb-1">
              Pay Inspection Fee
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500 mb-5">
              Your inspection has been booked. Complete payment to confirm and have an inspector assigned.
            </DialogDescription>

            {/* Amount */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Amount</label>
              <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {formatNaira(bookedFee)}.00
              </div>
            </div>

            {/* Car */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Vehicle</label>
              <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {carMake}
              </div>
            </div>

            {/* Payment method toggle */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-500 mb-2">Payment Method</label>
              <div className="grid grid-cols-2 rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setPayMethod("wallet")}
                  className={cn(
                    "py-3 px-3 text-sm font-medium transition-colors text-center",
                    payMethod === "wallet"
                      ? "bg-primary/10 text-primary"
                      : "bg-white text-gray-500 hover:bg-gray-50",
                  )}
                >
                  {walletLoaded
                    ? `Wallet (\u20A6 ${walletBalance!.toLocaleString()})`
                    : "Wallet"}
                </button>
                <button
                  onClick={() => setPayMethod("online")}
                  className={cn(
                    "py-3 px-3 text-sm font-medium transition-colors text-center border-l border-gray-200",
                    payMethod === "online"
                      ? "bg-primary/10 text-primary"
                      : "bg-white text-gray-500 hover:bg-gray-50",
                  )}
                >
                  Online Payment
                </button>
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={
                paying ||
                (payMethod === "wallet" && walletLoaded && !canAffordWallet)
              }
              className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
              data-testid="button-pay-now"
            >
              {paying && <Loader2 className="h-4 w-4 animate-spin" />}
              {payMethod === "wallet" && walletLoaded && !canAffordWallet
                ? "Insufficient wallet balance"
                : "Pay Now"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
