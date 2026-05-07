import { useEffect, useState } from "react";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Bank {
  name: string;
  code: string;
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
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return data as T;
}

export function ProfileBankTab() {
  const { toast } = useToast();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

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
        const [banksRes, accountsRes] = await Promise.all([
          jsonFetch<{ data: Bank[] }>("/api/paystack/banks"),
          jsonFetch<{ data: BankAccount[] }>("/api/me/bank-accounts"),
        ]);
        if (cancelled) return;
        setBanks(banksRes.data ?? []);
        setAccounts(accountsRes.data ?? []);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load bank details",
            description: e instanceof Error ? e.message : "Try again.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

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
        if (!cancelled) {
          toast({
            title: "Could not verify account",
            description: e instanceof Error ? e.message : "Check the details.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bankCode, accountNumber, toast]);

  const handleSave = async () => {
    if (!resolvedName || !bankCode) return;
    const selectedBank = banks.find((b) => b.code === bankCode);
    if (!selectedBank) return;
    setSaving(true);
    try {
      const res = await jsonFetch<{ bankAccount: BankAccount }>(
        "/api/me/bank-accounts",
        {
          method: "POST",
          body: JSON.stringify({
            bankCode,
            bankName: selectedBank.name,
            accountNumber,
            makeDefault,
          }),
        },
      );
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
        title: "Could not save bank account",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const prev = accounts;
    setAccounts((current) => current.filter((a) => a.id !== id));
    try {
      await jsonFetch(`/api/me/bank-accounts/${id}`, { method: "DELETE" });
      toast({ title: "Bank account removed" });
    } catch (e) {
      setAccounts(prev);
      toast({
        title: "Could not remove bank account",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <h3 className="text-sm font-bold text-gray-900">Verified Bank Accounts</h3>
        <p className="mt-1 text-xs text-gray-500">
          Withdrawals and payouts use verified accounts only.
        </p>
        <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-8 flex items-center justify-center text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No bank account added yet.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {accounts.map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {a.accountName}
                      </span>
                      {a.isDefault && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {a.bankName} · {a.accountNumber}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-gray-400 hover:text-red-500 p-2 -mr-2"
                    aria-label="Delete bank account"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-900">Add Bank Account</h3>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Bank</label>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">Select a bank...</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Account Number</label>
            <input
              value={accountNumber}
              onChange={(e) =>
                setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              inputMode="numeric"
              placeholder="10-digit NUBAN"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Account Name</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 min-h-[40px] text-sm flex items-center gap-2">
              {resolving ? (
                <span className="inline-flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying account...
                </span>
              ) : resolvedName ? (
                <span className="inline-flex items-center gap-2 text-emerald-700 font-semibold">
                  <ShieldCheck className="h-4 w-4" />
                  {resolvedName}
                </span>
              ) : (
                <span className="text-gray-500">
                  Select bank and enter a 10-digit account number.
                </span>
              )}
            </div>
          </div>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
            className="rounded"
          />
          Make this the default account
        </label>

        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={!resolvedName || saving}
            className="rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              "Save account"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
