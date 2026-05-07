import { useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Send as SendIcon,
  Filter,
  Download,
  Loader2,
  Wallet as WalletIcon,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { AppDialog } from "@/components/app-dialog";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDashboardNav } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import { CreditCard, Landmark, AlertCircle, ShieldCheck } from "lucide-react";

// ─── Types matching the API ──────────────────────────────────────────────────

type ApiTxType =
  | "deposit"
  | "withdrawal"
  | "payment"
  | "receipt"
  | "commission"
  | "refund"
  | "inspection_fee"
  | "inspection_earning";

type ApiTxStatus = "pending" | "completed" | "failed" | "reversed";

interface ApiWallet {
  id: number;
  userId: number;
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiTransaction {
  id: number;
  walletId: number;
  type: ApiTxType;
  amount: number;
  status: ApiTxStatus;
  reference: string | null;
  description: string | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  metadata: Record<string, unknown> | null;
  buyerName: string | null;
  createdAt: string;
  updatedAt: string;
}

// UI filter — maps to type+status combinations on the backend.
type UiFilter = "paid" | "in_escrow" | "refunded";

const UI_FILTERS: { value: UiFilter; label: string; dot: string }[] = [
  { value: "in_escrow", label: "In Escrow", dot: "bg-amber-400" },
  { value: "paid", label: "Paid", dot: "bg-green-500" },
  { value: "refunded", label: "Refunded", dot: "bg-red-500" },
];

// Display label + tone for a transaction, derived from its type+status.
function deriveDisplay(t: ApiTransaction): {
  label: string;
  dot: string;
  text: string;
  uiFilter: UiFilter | "deposit" | "pending" | "failed";
} {
  if (t.type === "deposit") {
    // Manual bank deposits sit in "pending" until ops verifies the
    // transfer; calling that "In Escrow" misleads buyers into thinking
    // it's tied to a specific deal.
    if (t.status === "pending") {
      return { label: "Pending Verification", dot: "bg-amber-400", text: "text-amber-700", uiFilter: "in_escrow" };
    }
    return { label: "Deposit", dot: "bg-emerald-700", text: "text-emerald-800", uiFilter: "deposit" };
  }
  if (t.type === "refund") {
    return { label: "Refunded", dot: "bg-red-500", text: "text-red-700", uiFilter: "refunded" };
  }
  if (t.type === "withdrawal" && t.status === "pending") {
    return { label: "Pending", dot: "bg-amber-400", text: "text-amber-700", uiFilter: "pending" };
  }
  if (t.type === "withdrawal" && t.status === "completed") {
    return { label: "Paid Out", dot: "bg-green-500", text: "text-green-700", uiFilter: "paid" };
  }
  if (t.status === "pending") {
    return { label: "In Escrow", dot: "bg-amber-400", text: "text-amber-700", uiFilter: "in_escrow" };
  }
  if (t.status === "failed" || t.status === "reversed") {
    return { label: "Failed", dot: "bg-gray-400", text: "text-gray-600", uiFilter: "failed" };
  }
  return { label: "Paid", dot: "bg-green-500", text: "text-green-700", uiFilter: "paid" };
}

// Translate chosen UI filters → query params for the API.
function filtersToQuery(filters: UiFilter[]): string {
  if (filters.length === 0) return "";
  const statuses = new Set<ApiTxStatus>();
  const types = new Set<ApiTxType>();
  for (const f of filters) {
    if (f === "paid") statuses.add("completed");
    if (f === "in_escrow") statuses.add("pending");
    if (f === "refunded") types.add("refund");
  }
  const parts: string[] = [];
  if (statuses.size) parts.push(`status=${[...statuses].join(",")}`);
  if (types.size) parts.push(`type=${[...types].join(",")}`);
  return parts.join("&");
}

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return data as T;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNaira(value: number) {
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function formatTxId(id: number) {
  return String(id).padStart(2, "0");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BalanceCard({
  balance,
  onWithdraw,
  onDeposit,
  showDeposit = true,
  earningsChips,
}: {
  balance: number;
  onWithdraw: () => void;
  onDeposit?: () => void;
  showDeposit?: boolean;
  earningsChips?: { totalEarns: number };
}) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-3 sm:gap-4">
      <div
        className="relative flex-1 rounded-2xl bg-primary text-primary-foreground p-5 sm:p-7 min-h-[120px] sm:min-h-[150px] overflow-hidden"
        data-testid="card-wallet-balance"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.25) 1px, transparent 1px)",
            backgroundSize: "14.28% 33.33%",
          }}
        />
        <div className="relative">
          <div className="text-xs sm:text-sm text-primary-foreground/80">Your Balance</div>
          <div className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">
            {formatNaira(balance)}
          </div>
          {earningsChips && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-primary-foreground"
                data-testid="chip-total-earns"
              >
                Total Earns: {formatNaira(earningsChips.totalEarns)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex sm:flex-col gap-3">
        <button
          onClick={onWithdraw}
          className="flex-1 sm:flex-none flex flex-col items-center justify-center gap-1 rounded-2xl border border-primary/30 bg-white px-5 py-3 min-w-[96px] hover:bg-primary/5 transition-colors"
          data-testid="button-withdraw"
        >
          <SendIcon className="h-5 w-5 text-primary -rotate-12" />
          <span className="text-xs font-semibold text-primary">Withdraw</span>
        </button>
        {showDeposit && onDeposit && (
          <button
            onClick={onDeposit}
            className="flex-1 sm:flex-none flex flex-col items-center justify-center gap-1 rounded-2xl border border-primary/30 bg-white px-5 py-3 min-w-[96px] hover:bg-primary/5 transition-colors"
            data-testid="button-deposit"
          >
            <WalletIcon className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold text-primary">Deposit</span>
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyWalletArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 160" fill="none" className={className} aria-hidden>
      <ellipse cx="110" cy="135" rx="70" ry="8" fill="#E5EDE5" />
      <path
        d="M60 55 L160 55 L175 80 L45 80 Z"
        fill="#CFDBCE"
        stroke="#94A894"
        strokeWidth="1.5"
      />
      <rect
        x="50"
        y="70"
        width="120"
        height="65"
        rx="8"
        fill="#FFFFFF"
        stroke="#94A894"
        strokeWidth="1.5"
      />
      <circle cx="150" cy="105" r="5" fill="#94A894" />
      <circle cx="70" cy="75" r="14" fill="#F3F5F3" stroke="#94A894" strokeWidth="1.5" />
      <text x="70" y="80" textAnchor="middle" fontSize="14" fontWeight="700" fill="#94A894">
        ₦
      </text>
      <path d="M35 50 h6 M38 47 v6" stroke="#C8D3C8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M185 45 h6 M188 42 v6" stroke="#C8D3C8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M50 130 h6 M53 127 v6" stroke="#C8D3C8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EmptyTransactions() {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center">
      <EmptyWalletArt className="h-32 sm:h-40 w-auto" />
      <h3 className="mt-6 text-base font-bold text-gray-900">No Transaction</h3>
      <p className="mt-1 text-sm text-gray-500">You have not performed any transaction</p>
    </div>
  );
}

function TransactionsTable({
  rows,
  userName,
}: {
  rows: ApiTransaction[];
  userName: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-3 font-semibold">TXN ID</th>
            <th className="px-3 py-3 font-semibold">Description</th>
            <th className="px-3 py-3 font-semibold">Reference</th>
            <th className="px-3 py-3 font-semibold">Amount</th>
            <th className="px-3 py-3 font-semibold">Name</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const d = deriveDisplay(t);
            return (
              <tr
                key={t.id}
                className="border-t border-gray-100 hover:bg-gray-50"
                data-testid={`row-tx-${t.id}`}
              >
                <td className="px-3 py-4 font-mono text-gray-700">{formatTxId(t.id)}</td>
                <td className="px-3 py-4 text-gray-700">
                  {t.description ?? "—"}
                </td>
                <td className="px-3 py-4 text-gray-500 font-mono text-xs">
                  {t.reference ?? "------"}
                </td>
                <td className="px-3 py-4 font-medium text-gray-900">
                  {formatNaira(t.amount)}
                </td>
                <td className="px-3 py-4 text-gray-600">{t.buyerName ?? userName}</td>
                <td className="px-3 py-4">
                  <div className={cn("inline-flex items-center gap-2", d.text)}>
                    <span className={cn("h-2 w-2 rounded-full", d.dot)} />
                    <span className="text-sm font-medium">{d.label}</span>
                  </div>
                </td>
                <td className="px-3 py-4 text-right">
                  <button
                    onClick={() => downloadSingle(t, userName)}
                    className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                    data-testid={`link-download-${t.id}`}
                  >
                    Download Transaction
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsCards({
  rows,
  userName,
}: {
  rows: ApiTransaction[];
  userName: string;
}) {
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((t) => {
        const d = deriveDisplay(t);
        return (
          <li key={t.id} className="py-3" data-testid={`card-tx-${t.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-mono">{formatTxId(t.id)}</span>
                  <span>·</span>
                  <span>{t.description ?? t.type}</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900 truncate">
                  {formatNaira(t.amount)}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 truncate">
                  {t.reference ?? "No reference"}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 truncate">
                  Buyer: {t.buyerName ?? userName}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className={cn("inline-flex items-center gap-1.5", d.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", d.dot)} />
                  <span className="text-xs font-medium">{d.label}</span>
                </div>
                <button
                  onClick={() => downloadSingle(t, userName)}
                  className="text-xs font-medium text-primary underline underline-offset-4"
                >
                  Download
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function txToCsv(rows: ApiTransaction[], userName: string) {
  const header = [
    "ID",
    "Description",
    "Reference",
    "Amount (NGN)",
    "Type",
    "Status",
    "Buyer",
    "Date",
  ];
  const body = rows.map((t) => [
    formatTxId(t.id),
    t.description ?? "",
    t.reference ?? "",
    String(t.amount),
    t.type,
    t.status,
    t.buyerName ?? userName,
    new Date(t.createdAt).toISOString(),
  ]);
  return [header, ...body]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function triggerDownload(filename: string, content: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadSingle(t: ApiTransaction, userName: string) {
  triggerDownload(`transaction-${formatTxId(t.id)}.csv`, txToCsv([t], userName));
}

// ─── Deposit flow: method picker → amount entry ──────────────────────────────

type DepositMethod = "paystack" | "bank";

function DepositDialog({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (amount: number, method: DepositMethod) => Promise<void>;
  submitting: boolean;
}) {
  const [method, setMethod] = useState<DepositMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMethod(null);
      setAmount("");
      setError(null);
    }
  }, [open]);

  const numeric = Number(amount.replace(/,/g, ""));

  const submit = async () => {
    setError(null);
    if (!method) return;
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (numeric < 100) {
      setError("Minimum deposit is ₦100.");
      return;
    }
    try {
      await onSubmit(numeric, method);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  // Step 1 — method picker
  if (!method) {
    return (
      <AppDialog
        open={open}
        onClose={onClose}
        title="Deposit"
        subtitle="Select your preferred deposit method to fund your wallet."
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <button
            onClick={() => setMethod("paystack")}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-6 hover:border-primary hover:bg-primary/5 transition-colors"
            data-testid="button-method-paystack"
          >
            <CreditCard className="h-6 w-6 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Paystack</span>
          </button>
          <button
            onClick={() => setMethod("bank")}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-6 hover:border-primary hover:bg-primary/5 transition-colors"
            data-testid="button-method-bank"
          >
            <Landmark className="h-6 w-6 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Bank Deposit</span>
          </button>
        </div>
      </AppDialog>
    );
  }

  // Step 2 — amount entry
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      onBack={() => {
        setMethod(null);
        setError(null);
      }}
      title="Deposit"
      subtitle={
        method === "paystack"
          ? "You'll be redirected to Paystack to complete the payment."
          : "Enter the amount to credit via bank deposit."
      }
      size="md"
      footer={
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
          data-testid="button-deposit-submit"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue
        </button>
      }
    >
      <label className="text-sm font-semibold text-gray-900">Amount (₦)</label>
      <input
        autoFocus
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Enter Amount"
        className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        data-testid="input-deposit-amount"
      />
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
    </AppDialog>
  );
}

// ─── Withdrawal dialog ───────────────────────────────────────────────────────

interface SavedBank {
  id: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
}

interface WithdrawalFeePreview {
  percent: number;
  feeAmount: number;
  netAmount: number;
}

function formatPercent(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(2).replace(/\.?0+$/, "");
}

function WithdrawDialog({
  open,
  onClose,
  onSubmit,
  max,
  submitting,
  savedBanks,
  bankAccountsPath,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (args: {
    amount: number;
    bankAccountId: number;
    bankName: string;
    accountNumber: string;
  }) => Promise<void>;
  max: number;
  submitting: boolean;
  savedBanks: SavedBank[];
  bankAccountsPath: string;
}) {
  const [, setLocation] = useLocation();
  const [amount, setAmount] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feePreview, setFeePreview] = useState<WithdrawalFeePreview>({
    percent: 0,
    feeAmount: 0,
    netAmount: 0,
  });

  // Default to the user's default bank, or the first one we have.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setError(null);
    const def =
      savedBanks.find((b) => b.isDefault) ?? savedBanks[0] ?? null;
    setSelectedId(def?.id ?? null);
  }, [open, savedBanks]);

  const selected =
    savedBanks.find((b) => b.id === selectedId) ?? null;
  const numeric = Number(amount.replace(/,/g, ""));

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const gross = Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
      try {
        const data = await jsonFetch<WithdrawalFeePreview>(
          `/api/wallet/withdrawal-fee?amount=${encodeURIComponent(String(gross))}`,
        );
        if (!cancelled) {
          setFeePreview({
            percent: Number(data.percent ?? 0),
            feeAmount: Number(data.feeAmount ?? 0),
            netAmount: Number(data.netAmount ?? gross),
          });
        }
      } catch {
        if (!cancelled) {
          // Keep the last known configured percent instead of flashing back to 0%.
          setFeePreview((prev) => {
            const feeAmount = Math.round(gross * ((Number(prev.percent) || 0) / 100));
            const netAmount = Math.max(0, gross - feeAmount);
            return { percent: prev.percent, feeAmount, netAmount };
          });
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [numeric]);

  const submit = async () => {
    setError(null);
    if (!selected) {
      setError("Add a verified bank account before withdrawing.");
      return;
    }
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (numeric < 100) {
      setError("Minimum withdrawal is ₦100.");
      return;
    }
    if (numeric > max) {
      setError("Amount exceeds your wallet balance.");
      return;
    }
    try {
      await onSubmit({
        amount: numeric,
        bankAccountId: selected.id,
        bankName: selected.bankName,
        accountNumber: selected.accountNumber,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Withdrawal Request"
      subtitle="Funds are sent to your verified bank account."
      size="lg"
      footer={
        <button
          onClick={submit}
          disabled={submitting || !selected}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
          data-testid="button-withdraw-submit"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit Request
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="text-sm font-semibold text-gray-900">
            Amount (<span className="font-extrabold">₦</span>)
          </label>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
            placeholder="Enter Amount"
            className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="input-withdraw-amount"
          />
          <div className="mt-1 text-xs text-gray-500">
            Available: {formatNaira(max)}
          </div>
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs text-gray-700">
              <span>Escrow fee ({formatPercent(feePreview.percent)}%)</span>
              <span className="font-semibold text-gray-900">{formatNaira(feePreview.feeAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-700">
              <span>You will receive</span>
              <span className="font-semibold text-gray-900">{formatNaira(feePreview.netAmount)}</span>
            </div>
          </div>
        </div>

        {savedBanks.length === 0 ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                You don't have a verified bank account yet. Add one before
                requesting a withdrawal.
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                setLocation(bankAccountsPath);
              }}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 underline underline-offset-2"
            >
              Add a bank account →
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-900">
                Send to
              </label>
              <button
                onClick={() => {
                  onClose();
                  setLocation(bankAccountsPath);
                }}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Manage banks
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {savedBanks.map((b) => {
                const active = b.id === selectedId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 truncate">
                          {b.accountName}
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            <ShieldCheck className="h-3 w-3" />
                            Verified
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {b.bankName} · {b.accountNumber}
                        </div>
                      </div>
                      {b.isDefault && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </AppDialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BuyerWallet({
  variant = "buyer",
}: {
  variant?: "buyer" | "inspector";
} = {}) {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { navItems, basePath } = useDashboardNav();
  const bankAccountsPath = `${basePath}/bank-accounts`;

  const user: DashboardUser = {
    name: authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "Victor",
    email: authUser?.email ?? "victor@huceautos.com",
    verified: authUser?.emailVerified ?? true,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<UiFilter[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [dialog, setDialog] = useState<"deposit" | "withdraw" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedBanks, setSavedBanks] = useState<
    Array<{
      id: number;
      bankName: string;
      accountNumber: string;
      accountName: string;
      isDefault: boolean;
    }>
  >([]);

  const filterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadAll = useCallback(
    async (nextQuery: string, nextFilters: UiFilter[]) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        const filterStr = filtersToQuery(nextFilters);
        if (filterStr) {
          for (const pair of filterStr.split("&")) {
            const [k, v] = pair.split("=");
            if (k && v) params.set(k, v);
          }
        }
        const trimmed = nextQuery.trim();
        if (trimmed) params.set("q", trimmed);
        const suffix = params.toString() ? `?${params.toString()}` : "";

        const data = await jsonFetch<{
          wallet: ApiWallet;
          transactions: ApiTransaction[];
        }>(`/api/wallet/transactions${suffix}`);
        setWallet(data.wallet);
        setTransactions(data.transactions);
      } catch (err) {
        toast({
          title: "Could not load wallet",
          description: err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Initial load
  useEffect(() => {
    if (!authUser) return;
    void loadAll("", []);
  }, [authUser, loadAll]);

  // Saved (Paystack-verified) bank accounts. Refetched whenever the
  // withdraw dialog opens so the user sees changes they made in the Bank
  // Accounts page without a full reload.
  const loadSavedBanks = useCallback(async () => {
    try {
      const data = await jsonFetch<{
        data: Array<{
          id: number;
          bankName: string;
          accountNumber: string;
          accountName: string;
          isDefault: boolean;
        }>;
      }>("/api/me/bank-accounts");
      setSavedBanks(data.data ?? []);
    } catch {
      setSavedBanks([]);
    }
  }, []);

  useEffect(() => {
    if (!authUser) return;
    void loadSavedBanks();
  }, [authUser, loadSavedBanks]);

  useEffect(() => {
    if (dialog === "withdraw") void loadSavedBanks();
  }, [dialog, loadSavedBanks]);

  // Debounced search + filter reload
  useEffect(() => {
    if (!authUser) return;
    const handle = setTimeout(() => {
      void loadAll(query, activeFilters);
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeFilters, authUser]);

  const toggleFilter = (v: UiFilter) =>
    setActiveFilters((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );

  const handleDeposit = async (amount: number, method: "paystack" | "bank") => {
    setSubmitting(true);
    try {
      if (method === "paystack") {
        // Initialize a Paystack transaction on the server, then redirect
        // the buyer to Paystack's hosted checkout. The wallet is credited
        // when Paystack calls our callback URL (and/or our webhook) and
        // /api/payments/verify confirms the charge.
        const data = await jsonFetch<{
          reference: string;
          authorizationUrl: string;
          amount: number;
        }>("/api/payments/init", {
          method: "POST",
          body: JSON.stringify({
            purpose: "wallet_topup",
            amount,
            callbackUrl: `${window.location.origin}/payments/callback`,
          }),
        });
        // Stash the reference so the callback page can show a friendly
        // "we credited your wallet" toast even if the user closes the tab.
        sessionStorage.setItem("huce.lastPaymentRef", data.reference);
        window.location.href = data.authorizationUrl;
        return;
      }

      // "bank" = manual bank transfer. The server records this as a PENDING
      // transaction only — the wallet balance is not credited until ops
      // reconciles the deposit against the bank statement. Crediting on
      // request would let any user mint balance for free.
      const data = await jsonFetch<{
        wallet: ApiWallet;
        transaction: ApiTransaction;
        pending?: boolean;
      }>("/api/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({
          amount,
          description: "Wallet Deposit · Bank (pending review)",
        }),
      });
      setWallet(data.wallet);
      setTransactions((prev) => [data.transaction, ...prev]);
      setDialog(null);
      toast({
        title: "Deposit request received",
        description: `${formatNaira(amount)} will be credited once we confirm your bank transfer.`,
      });
    } catch (err) {
      toast({
        title: "Deposit failed",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (args: {
    amount: number;
    bankAccountId: number;
    bankName: string;
    accountNumber: string;
  }) => {
    setSubmitting(true);
    try {
      const data = await jsonFetch<{
        wallet: ApiWallet;
        transaction: ApiTransaction;
      }>("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({
          amount: args.amount,
          bankAccountId: args.bankAccountId,
          description: `Withdrawal · ${args.bankName} · ****${args.accountNumber.slice(-4)}`,
        }),
      });
      setWallet(data.wallet);
      setTransactions((prev) => [data.transaction, ...prev]);
      setDialog(null);
      toast({
        title: "Withdrawal submitted",
        description: formatNaira(args.amount),
      });
    } catch (err) {
      toast({
        title: "Withdrawal failed",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const generateAll = () => {
    if (transactions.length === 0) {
      toast({ title: "Nothing to export", description: "You have no transactions yet." });
      return;
    }
    triggerDownload(
      `transactions-${Date.now()}.csv`,
      txToCsv(transactions, user.name),
    );
  };

  const hasAnyTx = useMemo(() => transactions.length > 0, [transactions.length]);

  const isInspector = variant === "inspector";

  // For the inspector view, summarise lifetime inspection earnings.
  // Only completed `inspection_earning` rows are credited today, so the
  // total is the sum of those amounts.
  const earningsChips = useMemo(() => {
    if (!isInspector) return undefined;
    let total = 0;
    for (const t of transactions) {
      if (t.type !== "inspection_earning") continue;
      if (t.status === "completed") total += Number(t.amount) || 0;
    }
    return { totalEarns: total };
  }, [isInspector, transactions]);

  const pageTitle = isInspector ? "Wallet/Transactions" : "Wallet";

  return (
    <DashboardLayout user={user} navItems={navItems} title={pageTitle} onLogout={handleLogout}>
      <div className="mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-bold text-gray-900">
          {pageTitle}
        </h2>
      </div>

      <BalanceCard
        balance={wallet?.balance ?? 0}
        onWithdraw={() => setDialog("withdraw")}
        onDeposit={isInspector ? undefined : () => setDialog("deposit")}
        showDeposit={!isInspector}
        earningsChips={earningsChips}
      />

      <div className="mt-6 sm:mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base sm:text-lg font-bold text-gray-900">
            Transaction History
          </h3>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1 sm:flex-none sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search here..."
                className="w-full rounded-full border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="input-wallet-search"
              />
            </div>
            <button
              onClick={generateAll}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 whitespace-nowrap"
              data-testid="button-generate-all"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Generate All</span>
              <span className="sm:hidden">Export</span>
            </button>
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl border",
                  activeFilters.length > 0
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                )}
                aria-label="Filter transactions"
                data-testid="button-filter"
              >
                <Filter className="h-4 w-4" />
              </button>
              {filterOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-gray-200 bg-white shadow-lg z-10 py-2"
                  role="menu"
                >
                  {UI_FILTERS.map((f) => {
                    const checked = activeFilters.includes(f.value);
                    return (
                      <button
                        key={f.value}
                        onClick={() => toggleFilter(f.value)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                        data-testid={`filter-option-${f.value}`}
                      >
                        <span className={cn("h-2.5 w-2.5 rounded-full", f.dot)} />
                        <span className="flex-1 text-left text-gray-700">{f.label}</span>
                        {checked && (
                          <span className="text-primary text-xs font-bold">✓</span>
                        )}
                      </button>
                    );
                  })}
                  {activeFilters.length > 0 && (
                    <>
                      <div className="my-1 h-px bg-gray-100" />
                      <button
                        onClick={() => setActiveFilters([])}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-50"
                      >
                        Clear filters
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 sm:mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : !hasAnyTx ? (
            <EmptyTransactions />
          ) : (
            <>
              <div className="hidden md:block">
                <TransactionsTable rows={transactions} userName={user.name} />
              </div>
              <div className="md:hidden">
                <TransactionsCards rows={transactions} userName={user.name} />
              </div>
            </>
          )}
        </div>
      </div>

      <DepositDialog
        open={dialog === "deposit"}
        onClose={() => setDialog(null)}
        onSubmit={handleDeposit}
        submitting={submitting}
      />
      <WithdrawDialog
        open={dialog === "withdraw"}
        onClose={() => setDialog(null)}
        onSubmit={handleWithdraw}
        max={wallet?.balance ?? 0}
        submitting={submitting}
        savedBanks={savedBanks}
        bankAccountsPath={bankAccountsPath}
      />
    </DashboardLayout>
  );
}
