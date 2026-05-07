import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ClipboardCheck, Wallet as WalletIcon, MessageSquare } from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { inspectorNav } from "@/lib/inspector-nav";
import { useAuth } from "@/context/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardData {
  inspections: {
    total: number;
    pending: number;
    assigned: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  revenue: { earned: number; pending: number; total: number; currency: string };
  messages: { conversations: number; unread: number };
}

function formatNaira(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n.toLocaleString()}`;
}

export default function InspectorDashboard() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inspectors/me/dashboard", {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as DashboardData;
          if (!cancelled) setDashboard(data);
        } else if (res.status === 401) {
          if (!cancelled) setError("You need to sign in to view this page.");
        } else if (res.status === 403) {
          if (!cancelled)
            setError(
              "Your account isn't set up as an inspector. Sign in with an inspector account to access this dashboard.",
            );
        } else {
          if (!cancelled)
            setError("We couldn't load your dashboard. Please try again.");
        }
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = authUser
    ? `${authUser.firstName} ${authUser.lastName}`.trim()
    : "Inspection Officer";

  const user: DashboardUser = {
    name: displayName,
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? false,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  return (
    <DashboardLayout
      user={user}
      navItems={inspectorNav}
      title="Home"
      onLogout={handleLogout}
    >
      {/* Welcome hero */}
      <div className="mb-8">
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900">
          Welcome Back, {displayName}!
        </h2>
        <p className="mt-1.5 text-sm text-gray-500">Manage your Inspection</p>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : dashboard ? (
        <DashboardHome data={dashboard} />
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {error}
        </div>
      ) : null}
    </DashboardLayout>
  );
}

function DashboardHome({ data }: { data: DashboardData }) {
  const { inspections, revenue, messages } = data;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      <StatTile
        value={inspections.total}
        label="Total Inspection"
        icon={ClipboardCheck}
        badges={[
          {
            text: `${inspections.active + inspections.assigned} Active Inspection`,
            tone: "success",
          },
          {
            text: `${inspections.completed} Completed Listings`,
            tone: "info",
          },
        ]}
      />
      <StatTile
        value={formatNaira(revenue.earned)}
        label="Revenue"
        icon={WalletIcon}
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

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}
