import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  CheckCircle, Upload, DollarSign, Users, Shield, ArrowRight,
  Loader2, AlertCircle, Star, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout";
import { useAuth } from "@/context/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const STEPS = [
  { num: 1, title: "Create an Account", description: "Sign up as a seller and get verified in minutes." },
  { num: 2, title: "List Your Car", description: "Add photos, details, and your asking price. It takes under 5 minutes." },
  { num: 3, title: "Connect with Buyers", description: "Receive inquiries from serious, verified buyers across Nigeria." },
  { num: 4, title: "Close the Deal", description: "Complete the transaction securely with our escrow payment protection." },
];

const BENEFITS = [
  { icon: Users, title: "Wide Reach", description: "Access thousands of verified buyers across Nigeria." },
  { icon: Upload, title: "Easy Listing Process", description: "List your car in minutes with our user-friendly platform." },
  { icon: Shield, title: "Secure Transactions", description: "Payment is held in escrow for your peace of mind." },
  { icon: DollarSign, title: "Flexible Subscription Plans", description: "Affordable plans tailored to your needs." },
];

interface DbPlan {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  maxListings: number;
  maxPhotos: number;
  featuredListingEnabled: boolean;
  analyticsDashboardEnabled: boolean;
  features: string[];
  isFeatured: boolean;
}

interface ActiveSubscription {
  id: number;
  status: string;
  expiresAt: string;
  plan: {
    id: number;
    name: string;
    price: number;
    maxListings: number;
    maxPhotos: number;
    durationDays: number;
    isFeatured: boolean;
  };
}

function planFeatures(p: DbPlan): string[] {
  const list: string[] = [];
  list.push(`${p.maxListings} active listing${p.maxListings !== 1 ? "s" : ""}`);
  list.push(`${p.maxPhotos} photo${p.maxPhotos !== 1 ? "s" : ""} per listing`);
  if (p.featuredListingEnabled) list.push("Featured listing placement");
  list.push(`${p.durationDays}-day listing duration`);
  if (p.analyticsDashboardEnabled) list.push("Analytics dashboard");
  (p.features ?? []).forEach((f) => list.push(f));
  return list;
}

function planPrice(p: DbPlan): { label: string; period: string } {
  if (p.price === 0) return { label: "Free", period: "" };
  const label = `₦${p.price.toLocaleString("en-NG")}`;
  const period =
    p.durationDays === 30 ? "/month"
    : p.durationDays === 365 ? "/year"
    : `/${p.durationDays} days`;
  return { label, period };
}

function useSubscriptionPlans() {
  return useQuery<DbPlan[]>({
    queryKey: ["subscription-plans-public"],
    queryFn: async () => {
      const res = await fetch("/api/listings/subscription-plans");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
}

function useMySubscription(enabled: boolean) {
  return useQuery<{ subscription: ActiveSubscription | null }>({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      const res = await fetch("/api/me/subscription", { credentials: "include" });
      if (!res.ok) return { subscription: null };
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
}

export default function SellPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const isSeller = user?.role === "seller";

  const { data: dbPlans, isLoading: plansLoading } = useSubscriptionPlans();
  const { data: subData, isLoading: subLoading } = useMySubscription(isSeller);
  const activeSub = subData?.subscription ?? null;

  const [initiating, setInitiating] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const freeMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await fetch("/api/subscriptions/free", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to activate plan");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      setNotice({ type: "success", msg: "Your free plan has been activated!" });
    },
    onError: (e: Error) => setNotice({ type: "error", msg: e.message }),
  });

  // Handle Paystack callback: /sell?reference=HUCE-SUBS-xxx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("reference");
    if (!ref || !ref.startsWith("HUCE-SUBS-")) return;

    // Remove query param from URL without navigation
    window.history.replaceState({}, "", window.location.pathname);

    (async () => {
      try {
        const res = await fetch(`/api/payments/verify/${encodeURIComponent(ref)}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.status === "success") {
          qc.invalidateQueries({ queryKey: ["my-subscription"] });
          setNotice({ type: "success", msg: "Payment confirmed! Your subscription is now active." });
        } else if (data.status === "abandoned") {
          setNotice({ type: "error", msg: "Payment was cancelled. You can try again anytime." });
        } else {
          setNotice({ type: "error", msg: "Payment verification failed. Please contact support if you were charged." });
        }
      } catch {
        setNotice({ type: "error", msg: "Could not verify payment. Please contact support." });
      }
    })();
  }, [qc]);

  async function handleSubscribe(plan: DbPlan) {
    if (!isSeller) {
      navigate("/sign-up");
      return;
    }
    if (plan.price === 0) {
      freeMutation.mutate(plan.id);
      return;
    }
    setInitiating(plan.id);
    try {
      const callbackUrl = `${window.location.origin}/sell`;
      const res = await fetch("/api/payments/init", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "subscription", planId: plan.id, callbackUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initialize payment");
      window.location.href = data.authorizationUrl;
    } catch (e: unknown) {
      setNotice({ type: "error", msg: e instanceof Error ? e.message : "Something went wrong" });
      setInitiating(null);
    }
  }

  const ctaHref = isSeller ? "/seller/listings" : "/sign-up";
  const ctaLabel = isSeller ? "Go to My Listings" : "List Your Car Now";
  const plans = Array.isArray(dbPlans) && dbPlans.length > 0 ? dbPlans : null;

  return (
    <Layout>
      {/* Hero */}
      <section className="relative bg-primary text-primary-foreground py-20 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1200&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/70" />
        <div className="relative container mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge className="bg-secondary/20 text-secondary border-secondary/30 mb-4">Sell on HUCE AUTOS</Badge>
            <h1 className="text-4xl md:text-5xl font-black mb-4">Sell Your Car</h1>
            <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto mb-8">
              List your car with ease, connect with serious buyers, and close deals faster — all on HUCE Autos.
            </p>
            <Link href={ctaHref}>
              <Button size="lg" className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold px-8 shadow-lg" data-testid="button-sell-cta">
                {ctaLabel} <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Payment / subscription notice banner */}
      {notice && (
        <div className={`${notice.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"} border-b px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            {notice.type === "success"
              ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
              : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            <span className="text-sm font-medium">{notice.msg}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-sm opacity-60 hover:opacity-100 ml-4">✕</button>
        </div>
      )}

      {/* Current plan banner for sellers */}
      {isSeller && !subLoading && activeSub && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-3">
          <div className="container mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary fill-primary/30" />
              <span className="text-sm font-semibold text-foreground">
                Active plan: <span className="text-primary">{activeSub.plan.name}</span>
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground sm:ml-4">
              <CalendarDays className="h-3 w-3" />
              Expires {new Date(activeSub.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
            </div>
            <Link href="/seller/listings" className="sm:ml-auto">
              <Button size="sm" variant="outline" className="text-xs h-7">
                Go to Listings <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Benefits */}
      <section className="py-16 container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-foreground">Why Choose HUCE Autos to Sell?</h2>
          <p className="text-muted-foreground mt-2">Everything you need to sell your car confidently</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-xl p-6 text-center hover:shadow-md transition-shadow"
            >
              <div className="bg-primary/10 rounded-full p-4 w-fit mx-auto mb-4">
                <b.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-bold text-foreground mb-2">{b.title}</h3>
              <p className="text-sm text-muted-foreground">{b.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-foreground">How It Works</h2>
            <p className="text-muted-foreground mt-2">Start selling in 4 simple steps</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            <div className="hidden md:block absolute top-8 left-[calc(12.5%+2rem)] right-[calc(12.5%+2rem)] h-0.5 bg-border" />
            {STEPS.map((step) => (
              <div key={step.num} className="text-center relative">
                <div className="bg-primary text-primary-foreground rounded-full w-16 h-16 flex items-center justify-center text-xl font-black mx-auto mb-4 shadow-md z-10 relative">
                  {step.num}
                </div>
                <h3 className="font-bold text-foreground mb-1">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-foreground">Subscription Plans</h2>
          <p className="text-muted-foreground mt-2">Choose a plan that suits your needs</p>
        </div>

        {plansLoading ? (
          <div className="flex overflow-x-auto pt-6 pb-8 -mx-4 px-4 snap-x snap-mandatory gap-4 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0 md:pt-0 md:mx-auto md:px-0 md:snap-none max-w-4xl no-scrollbar">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shrink-0 w-[85vw] sm:w-[320px] md:w-auto snap-center rounded-2xl border border-border bg-card p-6 space-y-4 animate-pulse mt-4 md:mt-0">
                <div className="h-5 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-8 bg-gray-200 rounded w-1/3" />
                <div className="space-y-2 pt-2">
                  {[0,1,2,3].map((j) => <div key={j} className="h-3 bg-gray-100 rounded" />)}
                </div>
                <div className="h-10 bg-gray-200 rounded-xl" />
              </div>
            ))}
          </div>
        ) : plans ? (
          <div className={`flex overflow-x-auto pt-6 pb-8 -mx-4 px-4 snap-x snap-mandatory gap-4 md:grid md:gap-6 md:overflow-visible md:pb-0 md:pt-0 md:mx-auto md:px-0 md:snap-none max-w-4xl no-scrollbar ${plans.length === 1 ? "md:grid-cols-1 max-w-sm" : plans.length === 2 ? "md:grid-cols-2 max-w-2xl" : "md:grid-cols-3"}`}>
            {plans.map((plan) => {
              const highlighted = plan.isFeatured;
              const { label: priceLabel, period } = planPrice(plan);
              const featureList = planFeatures(plan);
              const isCurrent = activeSub?.plan?.id === plan.id;
              const isLoading = initiating === plan.id || (plan.price === 0 && freeMutation.isPending && freeMutation.variables === plan.id);

              let btnLabel: string;
              if (!user) btnLabel = plan.price === 0 ? "Get Started Free" : `Get ${plan.name}`;
              else if (!isSeller) btnLabel = "Sign up as Seller";
              else if (isCurrent) btnLabel = "Current Plan";
              else if (plan.price === 0) btnLabel = "Activate Free Plan";
              else btnLabel = `Subscribe — ${priceLabel}`;

              return (
                <motion.div
                  key={plan.id}
                  whileHover={{ y: -6 }}
                  className={`shrink-0 w-[85vw] sm:w-[320px] md:w-auto snap-center rounded-2xl border p-6 relative transition-all mt-4 md:mt-0 ${
                    highlighted
                      ? "border-primary bg-primary text-primary-foreground shadow-xl"
                      : isCurrent
                        ? "border-green-400 bg-green-50 text-foreground shadow-md"
                        : "border-border bg-card text-foreground shadow-sm"
                  }`}
                >
                  {highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <Badge className="bg-amber-400 text-amber-900 font-bold px-4 py-1 text-xs tracking-wide shadow-md border border-amber-300">
                        ★ Recommended
                      </Badge>
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <Badge className="bg-green-500 text-white font-bold px-4 py-1 text-xs tracking-wide shadow-md border border-green-400">
                        ✓ Your Plan
                      </Badge>
                    </div>
                  )}
                  <div className="mb-6">
                    <h3 className={`text-lg font-bold mb-1 ${highlighted ? "text-primary-foreground" : "text-foreground"}`}>
                      {plan.name}
                    </h3>
                    {plan.description && (
                      <p className={`text-sm mb-3 ${highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {plan.description}
                      </p>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black">{priceLabel}</span>
                      {period && (
                        <span className={`text-sm ${highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {period}
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {featureList.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle className={`h-4 w-4 flex-shrink-0 ${highlighted ? "text-secondary" : isCurrent ? "text-green-600" : "text-green-500"}`} />
                        <span className={highlighted ? "text-primary-foreground/90" : "text-muted-foreground"}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handleSubscribe(plan)}
                    disabled={isCurrent || isLoading}
                    className={`w-full font-semibold ${
                      isCurrent
                        ? "bg-green-500 text-white cursor-default"
                        : highlighted
                          ? "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                    data-testid={`button-plan-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : btnLabel}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No subscription plans are available yet. Check back soon.
          </div>
        )}
      </section>
    </Layout>
  );
}
