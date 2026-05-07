import { useEffect, useState } from "react";
import { Loader2, Trash2, ShieldCheck, Plus } from "lucide-react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";

interface Bank {
  name: string;
  code: string;
  slug: string;
}

interface BankAccount {
  id: number;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
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

export default function BuyerBankAccountsPage() {
  const { toast } = useToast();

  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, a] = await Promise.all([
          jsonFetch<{ data: Bank[] }>("/api/paystack/banks"),
          jsonFetch<{ data: BankAccount[] }>("/api/me/bank-accounts"),
        ]);
        if (cancelled) return;
        setBanks(b.data);
        setAccounts(a.data);
      } catch (e) {
        if (!cancelled)
          toast({
            title: "Could not load banks",
            description: e instanceof Error ? e.message : "Try again.",
            variant: "destructive",
          });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  // Auto-resolve when both bank + 10-digit account number are filled.
  useEffect(() => {
    setResolvedName(null);
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) return;

    let cancelled = false;
    setResolving(true);
    (async () => {
      try {
        const res = await jsonFetch<{ accountName: string }>(
          "/api/paystack/resolve-account",
          {
            method: "POST",
            body: JSON.stringify({ accountNumber, bankCode }),
          },
        );
        if (!cancelled) setResolvedName(res.accountName);
      } catch (e) {
        if (!cancelled)
          toast({
            title: "Could not verify account",
            description: e instanceof Error ? e.message : "Check the details.",
            variant: "destructive",
          });
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bankCode, accountNumber, toast]);

  const handleSave = async () => {
    if (!resolvedName || !bankCode) return;
    const bank = banks.find((b) => b.code === bankCode);
    if (!bank) return;
    setSaving(true);
    try {
      const res = await jsonFetch<{ bankAccount: BankAccount }>(
        "/api/me/bank-accounts",
        {
          method: "POST",
          body: JSON.stringify({
            bankCode,
            bankName: bank.name,
            accountNumber,
            makeDefault,
          }),
        },
      );
      // De-dup: replace if same id, otherwise prepend.
      setAccounts((prev) => {
        const others = prev.filter((a) => a.id !== res.bankAccount.id);
        return [res.bankAccount, ...others];
      });
      setBankCode("");
      setAccountNumber("");
      setResolvedName(null);
      setMakeDefault(false);
      toast({ title: "Bank account saved" });
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const prev = accounts;
    setAccounts((p) => p.filter((a) => a.id !== id));
    try {
      await jsonFetch(`/api/me/bank-accounts/${id}`, { method: "DELETE" });
      toast({ title: "Bank account removed" });
    } catch (e) {
      setAccounts(prev);
      toast({
        title: "Could not remove",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-xl font-black text-foreground mb-1">
          Bank Accounts
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Verified Nigerian bank accounts for withdrawals and payouts.
        </p>

        {/* Existing accounts */}
        <div className="bg-card border border-border rounded-xl mb-6 overflow-hidden">
          {loading ? (
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              You haven't added any bank accounts yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {a.accountName}
                      </span>
                      {a.isDefault && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.bankName} · {a.accountNumber}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-muted-foreground hover:text-red-500 p-2 -mr-2"
                    aria-label="Delete"
                    data-testid={`button-delete-${a.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              Add bank account
            </h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Bank
              </label>
              <select
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                data-testid="select-bank"
              >
                <option value="">Select a bank…</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Account number
              </label>
              <input
                inputMode="numeric"
                maxLength={10}
                value={accountNumber}
                onChange={(e) =>
                  setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit NUBAN"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                data-testid="input-account-number"
              />
            </div>

            <div className="rounded-lg bg-gray-50 border border-border px-3 py-2.5 text-sm flex items-center gap-2 min-h-[2.5rem]">
              {resolving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Verifying account…
                  </span>
                </>
              ) : resolvedName ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-foreground truncate">
                    {resolvedName}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Select a bank and enter a 10-digit account number.
                </span>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)}
                className="rounded"
                data-testid="checkbox-default"
              />
              Make this the default account
            </label>

            <button
              onClick={handleSave}
              disabled={!resolvedName || saving}
              className="w-full rounded-lg bg-primary text-white text-sm font-semibold py-2.5 hover:bg-primary/90 disabled:opacity-60"
              data-testid="button-save-account"
            >
              {saving ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </span>
              ) : (
                "Save account"
              )}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
