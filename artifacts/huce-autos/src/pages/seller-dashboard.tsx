import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Car,
  Wallet as WalletIcon,
  ReceiptText,
  MessageSquare,
  Lock,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import {
  SellerVerificationProgress,
  buildVerificationSteps,
} from "@/components/seller-verification-progress";
import { buildSellerNav } from "@/lib/seller-nav";
import { useAuth } from "@/context/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface VerificationState {
  nin: string;
  proof: string;
  bank: string;
  profile: string;
  allCompleted: boolean;
}

interface DashboardData {
  listings: {
    total: number;
    active: number;
    sold: number;
    pending: number;
    suspended: number;
  };
  offers: {
    total: number;
    pending: number;
    accepted: number;
    declined: number;
    completed: number;
  };
  messages: { conversations: number; unread: number };
  revenue: {
    earned: number;
    pending: number;
    withdrawn: number;
    total: number;
    currency: string;
  };
}

function formatNaira(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n.toLocaleString()}`;
}

export default function SellerDashboard() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();

  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [sellerApproved, setSellerApproved] = useState(false);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsBlocked, setAnalyticsBlocked] = useState(false);
  const [blockedPlanName, setBlockedPlanName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, dashRes] = await Promise.all([
          fetch("/api/sellers/me/profile", { credentials: "include" }),
          fetch("/api/sellers/me/dashboard", { credentials: "include" }),
        ]);

        if (profileRes.ok) {
          const data = await profileRes.json();
          if (!cancelled) {
            setVerification(data.verification);
            setSellerApproved(Boolean(data.profile?.isVerified));
            setBusinessName(data.profile?.businessName ?? null);
            setProfilePhotoUrl(data.profilePhotoUrl);
          }
        } else if (!cancelled) {
          setVerification({
            nin: "pending",
            proof: "pending",
            bank: "pending",
            profile: "pending",
            allCompleted: false,
          });
          setSellerApproved(false);
        }

        if (dashRes.ok) {
          const data = (await dashRes.json()) as DashboardData;
          if (!cancelled) setDashboard(data);
        } else if (dashRes.status === 403) {
          const err = await dashRes.json().catch(() => ({}));
          if (!cancelled && err.code === "ANALYTICS_NOT_AVAILABLE") {
            setAnalyticsBlocked(true);
            setBlockedPlanName(err.planName ?? null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allVerified = !!verification?.allCompleted;

  const displayName =
    businessName ??
    (authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "Seller");

  const user: DashboardUser = {
    name: displayName,
    email: authUser?.email ?? "",
    verified: sellerApproved,
    showVerificationState: true,
    avatarUrl: profilePhotoUrl ?? authUser?.profilePhotoUrl ?? undefined,
  };

  const navItems = buildSellerNav({ sellerVerified: sellerApproved });

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  return (
    <DashboardLayout
      user={user}
      navItems={navItems}
      title="Home"
      onLogout={handleLogout}
    >
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">
          Welcome Back, {displayName}!
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Manage your listings, track offers, and connect with buyers — all from
          one place.
        </p>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : !allVerified && verification ? (
        <SellerVerificationProgress steps={buildVerificationSteps(verification)} />
      ) : analyticsBlocked ? (
        <AnalyticsUpgradeWall currentPlanName={blockedPlanName} onUpgrade={() => setLocation("/seller/settings?tab=subscription")} />
      ) : dashboard ? (
        <DashboardHome data={dashboard} />
      ) : null}
    </DashboardLayout>
  );
}

function DashboardHome({ data }: { data: DashboardData }) {
  const { listings, offers, messages, revenue } = data;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        <StatTile
          value={listings.total}
          label="Total Listings"
          icon={Car}
          badges={[
            { text: `${listings.active} Active Listings`, tone: "success" },
            { text: `${listings.sold} Sold Listings`, tone: "danger" },
          ]}
        />
        <StatTile
          value={formatNaira(revenue.earned)}
          label="Revenue"
          icon={WalletIcon}
        />
        <StatTile
          value={offers.total}
          label="Offers"
          icon={ReceiptText}
        />
        <StatTile
          value={messages.conversations}
          label="Message"
          icon={MessageSquare}
          badges={
            messages.unread > 0
              ? [{ text: `${messages.unread} Unread Message`, tone: "info" }]
              : undefined
          }
        />
      </div>

      <RevenueStatistics revenue={revenue} />
    </>
  );
}

function StatTile({
  value,
  label,
  icon: Icon,
  badges,
}: {
  value: string | number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badges?: { text: string; tone: "success" | "danger" | "info" }[];
}) {
  const toneCls: Record<string, string> = {
    success: "bg-primary/10 text-primary border-primary/20",
    danger: "bg-rose-50 text-rose-600 border-rose-200",
    info: "bg-primary/10 text-primary border-primary/20",
  };
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[40px] leading-none font-extrabold tracking-tight text-gray-900">
          {value}
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-sm text-gray-500">{label}</div>
      {badges && badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((b, i) => (
            <span
              key={i}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                toneCls[b.tone],
              )}
            >
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RevenueStatistics({ revenue }: { revenue: DashboardData["revenue"] }) {
  const slices = [
    { name: "Revenue Earned", value: revenue.earned, color: "hsl(var(--primary))" },
    { name: "Withdrawn Revenue", value: revenue.withdrawn, color: "hsl(var(--primary) / 0.55)" },
    { name: "Pending Revenue", value: revenue.pending, color: "hsl(var(--primary) / 0.20)" },
  ];
  const hasData = slices.some((s) => s.value > 0);
  const display = hasData ? slices : slices.map((s) => ({ ...s, value: 1 }));

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <h3 className="text-sm font-bold text-gray-900">Revenue Statistics</h3>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={display}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={1}
                dataKey="value"
                stroke="none"
              >
                {display.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              {hasData && (
                <RTooltip
                  formatter={(v: number) => formatNaira(Number(v))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="space-y-3 text-sm">
          {slices.map((s) => (
            <li
              key={s.name}
              className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-gray-700">{s.name}</span>
              </div>
              <span className="font-semibold text-gray-900">
                {formatNaira(s.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

function AnalyticsUpgradeWall({
  currentPlanName,
  onUpgrade,
}: {
  currentPlanName: string | null;
  onUpgrade: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Lock className="h-7 w-7 text-primary" />
      </span>
      <h3 className="text-lg font-bold text-gray-900 mb-1">Analytics not included</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        {currentPlanName
          ? `Your ${currentPlanName} plan does not include the analytics dashboard.`
          : "Your current plan does not include the analytics dashboard."}{" "}
        Upgrade your subscription to track listings performance, offers, revenue, and more.
      </p>
      <button
        onClick={onUpgrade}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
      >
        Upgrade Plan
      </button>
    </div>
  );
}
