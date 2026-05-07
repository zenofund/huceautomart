import { ChevronLeft, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  receipt: {
    invoiceNo: string;
    seller: { name: string; company: string; phone: string; email: string };
    middleman: { company: string; phone: string; email: string };
    buyer: { name: string; phone: string; email: string };
    car: { make: string; vin: string; mileage: string; condition: string; purchaseDate: string; image?: string };
    summation: { subTotal: number; discount: number; total: number };
  };
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-dotted border-gray-300 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

export function ReceiptDialog({ open, onClose, receipt }: ReceiptDialogProps) {
  const sellerHeader = receipt.seller.company
    ? `${receipt.seller.name} (${receipt.seller.company})`
    : receipt.seller.name;

  const handleDownload = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const node = document.getElementById("receipt-body");
    if (!node) return;
    w.document.write(`
      <!DOCTYPE html><html><head><title>Receipt ${receipt.invoiceNo}</title>
      <meta charset="utf-8" />
      <script src="https://cdn.tailwindcss.com"></script>
      <style>@media print { .no-print { display: none !important; } body { margin: 0; } }</style>
      </head><body class="bg-white p-8">
        ${node.innerHTML}
        <div class="no-print mt-6 text-center">
          <button onclick="window.print()" class="rounded-full bg-green-700 text-white px-6 py-2.5 font-semibold">Print / Save as PDF</button>
        </div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-xl w-full rounded-2xl overflow-hidden max-h-[90vh] flex flex-col" hideCloseButton>
        {/* Header */}
        <div className="p-6 pb-4 shrink-0">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-primary transition-colors mb-3"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <DialogTitle className="text-lg font-bold text-gray-900">
            Car Purchase Receipt
          </DialogTitle>
          <div className="text-xs text-gray-400 mt-0.5">
            Invoice No:- {receipt.invoiceNo}
          </div>
        </div>

        {/* Body (scrollable) */}
        <div className="overflow-y-auto px-6 pb-4" id="receipt-body">
          <div className="rounded-md bg-primary text-white text-center py-3 text-sm font-semibold mb-5">
            Thank you for your purchase!
          </div>

          {/* Seller + Middleman */}
          <div className="grid grid-cols-2 gap-4 mb-5 pb-4 border-b border-dotted border-gray-300">
            <div>
              <div className="text-xs font-bold text-gray-900 mb-2">Seller Details</div>
              <div className="text-sm text-gray-700">{sellerHeader}</div>
              <div className="text-xs text-gray-600 mt-0.5">{receipt.seller.phone}</div>
              <div className="text-xs text-gray-600">{receipt.seller.email}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-gray-900 mb-2">Middleman Details</div>
              <div className="text-sm text-gray-700">{receipt.middleman.company}</div>
              <div className="text-xs text-gray-600 mt-0.5">{receipt.middleman.phone}</div>
              <div className="text-xs text-gray-600">{receipt.middleman.email}</div>
            </div>
          </div>

          {/* Buyer */}
          <div className="mb-5 pb-4 border-b border-dotted border-gray-300">
            <div className="text-xs font-bold text-gray-900 mb-2">Buyer Details</div>
            <Row label="Customer Name" value={receipt.buyer.name} />
            <Row label="Customer Number" value={receipt.buyer.phone} />
            <Row label="Email Address" value={receipt.buyer.email} />
          </div>

          {/* Car */}
          <div className="mb-5 pb-4 border-b border-dotted border-gray-300">
            <div className="text-xs font-bold text-gray-900 mb-2">Car Details</div>
            <div className="flex items-start gap-3">
              <div className="h-14 w-20 shrink-0 rounded-md bg-gray-200 overflow-hidden">
                {receipt.car.image && (
                  <img src={receipt.car.image} alt={receipt.car.make} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-gray-900">{receipt.car.make}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  VIN: {receipt.car.vin} | Mileage: {receipt.car.mileage} | Condition: {receipt.car.condition}
                </div>
                <div className="text-xs text-gray-500">
                  Purchase Date: {receipt.car.purchaseDate}
                </div>
              </div>
            </div>
          </div>

          {/* Summation */}
          <div className="mb-4">
            <div className="text-xs font-bold text-gray-900 mb-2">Summation</div>
            <Row label="Sub Total" value={receipt.summation.subTotal.toFixed(2)} />
            <Row label="Discount" value={receipt.summation.discount.toFixed(2)} />
            <div className="flex items-center justify-between py-2 mt-1 border-t border-gray-200">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-sm font-bold text-gray-900">{receipt.summation.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-gray-100 shrink-0 text-center">
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Download PDF <Download className="h-4 w-4" />
          </button>
          <div className="text-[11px] text-gray-500 mt-3">
            Have any concerns? Send us an email via{" "}
            <a href="mailto:support@huceautos.com" className="text-primary underline underline-offset-2">
              support@huceautos.com
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
