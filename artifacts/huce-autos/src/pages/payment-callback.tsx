import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { Layout } from "@/components/layout";

interface VerifyResponse {
  reference: string;
  status: "success" | "failed" | "abandoned" | string;
  purpose: "wallet_topup" | "inspection" | "listing_purchase";
  amount: number;
}

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

function formatNaira(n: number) {
  return `\u20A6 ${Math.round(n).toLocaleString()}`;
}

export default function PaymentCallbackPage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; data: VerifyResponse }
    | { kind: "err"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    // Paystack appends ?reference=... and ?trxref=... when redirecting back.
    const params = new URLSearchParams(window.location.search);
    const reference =
      params.get("reference") ??
      params.get("trxref") ??
      sessionStorage.getItem("huce.lastPaymentRef");
    if (!reference) {
      setState({ kind: "err", message: "No payment reference in URL" });
      return;
    }

    (async () => {
      try {
        const data = await jsonFetch<VerifyResponse>(
          `/api/payments/verify/${encodeURIComponent(reference)}`,
        );
        sessionStorage.removeItem("huce.lastPaymentRef");
        setState({ kind: "ok", data });
      } catch (e) {
        setState({
          kind: "err",
          message: e instanceof Error ? e.message : "Verification failed",
        });
      }
    })();
  }, []);

  const purposeLabel = (p: string) =>
    p === "wallet_topup"
      ? "Wallet top-up"
      : p === "inspection"
      ? "Inspection booking"
      : p === "listing_purchase"
      ? "Car purchase"
      : p;

  const nextHref = (p: string) =>
    p === "wallet_topup"
      ? "/dashboard/wallet"
      : p === "inspection"
      ? "/dashboard/activity"
      : "/dashboard/activity";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          {state.kind === "loading" && (
            <>
              <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
              <h1 className="text-lg font-bold text-foreground">
                Verifying your payment…
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Hang tight, this only takes a moment.
              </p>
            </>
          )}

          {state.kind === "ok" && state.data.status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
              <h1 className="text-lg font-bold text-foreground">
                Payment received
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                {purposeLabel(state.data.purpose)} of{" "}
                <span className="font-semibold text-foreground">
                  {formatNaira(state.data.amount)}
                </span>{" "}
                was confirmed.
              </p>
              <Link
                href={nextHref(state.data.purpose)}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary text-white text-sm font-semibold px-4 py-2.5 hover:bg-primary/90"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}

          {state.kind === "ok" && state.data.status !== "success" && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-lg font-bold text-foreground">
                Payment {state.data.status}
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Your payment didn't go through. You can try again or use a
                different method.
              </p>
              <button
                onClick={() => setLocation("/dashboard/wallet")}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary text-white text-sm font-semibold px-4 py-2.5 hover:bg-primary/90"
              >
                Back to wallet
              </button>
            </>
          )}

          {state.kind === "err" && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-lg font-bold text-foreground">
                Couldn't verify payment
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                {state.message}
              </p>
              <Link
                href="/dashboard/wallet"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary text-white text-sm font-semibold px-4 py-2.5 hover:bg-primary/90"
              >
                Back to wallet
              </Link>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
