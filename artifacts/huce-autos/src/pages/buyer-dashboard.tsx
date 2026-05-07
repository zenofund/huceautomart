import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Home,
  ClipboardList,
  Heart,
  Car,
  MessageSquare,
  Wallet,
  HeadphonesIcon,
  UserRound,
  ShoppingBag,
  BadgePercent,
  Search,
} from "lucide-react";
import {
  DashboardLayout,
  StatCard,
  type DashboardNavItem,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { useAuth } from "@/context/auth-context";

interface BuyerStats {
  purchases: number;
  offers: { total: number; accepted: number; declined: number };
  savedCars: number;
  inspections: number;
  conversations: number;
  unreadMessages: number;
}

const buyerNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  {
    href: "/dashboard/activity",
    label: "Inspection / Offers / Purchases",
    icon: ClipboardList,
  },
  { href: "/dashboard/saved", label: "Saved Car", icon: Heart },
  { href: "/dashboard/history", label: "Viewed Car History", icon: Car },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/support", label: "Customer Support", icon: HeadphonesIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

export default function BuyerDashboard() {
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<BuyerStats | null>(null);

  useEffect(() => {
    fetch("/api/buyer/stats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: BuyerStats) => setStats(data))
      .catch(() => {});
  }, []);

  const user: DashboardUser = {
    name: authUser
      ? `${authUser.firstName} ${authUser.lastName}`.trim()
      : "",
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? false,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const firstName = user.name.split(" ")[0] || "there";

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const offerBadges = stats
    ? [
        ...(stats.offers.accepted > 0
          ? [{ text: `${stats.offers.accepted} Offer${stats.offers.accepted !== 1 ? "s" : ""} Accepted`, tone: "success" as const }]
          : []),
        ...(stats.offers.declined > 0
          ? [{ text: `${stats.offers.declined} Offer${stats.offers.declined !== 1 ? "s" : ""} Declined`, tone: "danger" as const }]
          : []),
      ]
    : [];

  const messageBadges =
    stats && stats.unreadMessages > 0
      ? [{ text: `${stats.unreadMessages} Unread Message${stats.unreadMessages !== 1 ? "s" : ""}`, tone: "info" as const }]
      : [];

  return (
    <DashboardLayout
      user={user}
      navItems={buyerNav}
      title="Home"
      onLogout={handleLogout}
    >
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
          Welcome Back, {firstName}!
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Ready to find your next car? Explore saved listings, check offers, or
          start a new search.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          value={stats?.purchases ?? "—"}
          label="Purchases"
          icon={ShoppingBag}
          iconTone="primary"
        />
        <StatCard
          value={stats?.offers.total ?? "—"}
          label="Offers"
          icon={BadgePercent}
          iconTone="primary"
          badges={offerBadges}
        />
        <StatCard
          value={stats?.savedCars ?? "—"}
          label="Car Saved"
          icon={Heart}
          iconTone="primary"
        />
        <StatCard
          value={stats?.inspections ?? "—"}
          label="Inspection"
          icon={Search}
          iconTone="primary"
        />
        <StatCard
          value={stats?.conversations ?? "—"}
          label="Messages"
          icon={MessageSquare}
          iconTone="primary"
          badges={messageBadges}
        />
      </div>
    </DashboardLayout>
  );
}
