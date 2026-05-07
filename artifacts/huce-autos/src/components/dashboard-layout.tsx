import { ReactNode, useState, type ComponentType } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronRight,
  Home,
  Search,
  ClipboardList,
  Wallet,
  UserRound,
  ClipboardCheck,
  PanelRightOpen,
  PanelRightClose,
  PanelLeftOpen,
  LogOut,
  Star,
  type LucideIcon,
} from "lucide-react";
import { Navbar, Footer } from "@/components/layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  MobileStickyNav,
  type MobileStickyItem,
} from "@/components/mobile-sticky-nav";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  locked?: boolean;
  lockHint?: string;
}

export interface DashboardUser {
  name: string;
  email: string;
  verified?: boolean;
  showVerificationState?: boolean;
  avatarUrl?: string;
}

interface DashboardLayoutProps {
  user: DashboardUser;
  navItems: DashboardNavItem[];
  title?: string;
  children: ReactNode;
  onLogout?: () => void;
}

function pickNavItem(navItems: DashboardNavItem[], href: string) {
  return navItems.find((item) => item.href === href);
}

function buildMobileStickyItems(navItems: DashboardNavItem[]): MobileStickyItem[] {
  const rootHref = navItems[0]?.href ?? "";

  if (rootHref.startsWith("/seller")) {
    const home = pickNavItem(navItems, "/seller");
    const listings = pickNavItem(navItems, "/seller/listings");
    const offers = pickNavItem(navItems, "/seller/offers");
    const wallet = pickNavItem(navItems, "/seller/wallet");
    const settings = pickNavItem(navItems, "/seller/settings");
    return [home, listings, offers, wallet, settings].filter(
      (item): item is DashboardNavItem => !!item,
    );
  }

  if (rootHref.startsWith("/inspector")) {
    const home = pickNavItem(navItems, "/inspector");
    const task = pickNavItem(navItems, "/inspector/inspections");
    const wallet = pickNavItem(navItems, "/inspector/wallet");
    const profile = pickNavItem(navItems, "/inspector/profile");
    return [
      home && { ...home, label: "Home" },
      task && { ...task, label: "Task", icon: task.icon ?? ClipboardCheck },
      wallet && { ...wallet, label: "Wallet", icon: wallet.icon ?? Wallet },
      profile && { ...profile, label: "Profile", icon: profile.icon ?? UserRound },
    ].filter((item): item is MobileStickyItem => !!item);
  }

  // Buyer mobile menu from design: Home, Search, Car Hub, Wallet, Profile.
  return [
    {
      href: "/dashboard",
      label: "Home",
      icon: pickNavItem(navItems, "/dashboard")?.icon ?? Home,
    },
    { href: "/cars", label: "Search", icon: Search },
    {
      href: "/dashboard/activity",
      label: "Car Hub",
      icon: pickNavItem(navItems, "/dashboard/activity")?.icon ?? ClipboardList,
    },
    {
      href: "/dashboard/wallet",
      label: "Wallet",
      icon: pickNavItem(navItems, "/dashboard/wallet")?.icon ?? Wallet,
    },
    {
      href: "/dashboard/profile",
      label: "Profile",
      icon: pickNavItem(navItems, "/dashboard/profile")?.icon ?? UserRound,
    },
  ];
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SidebarContent({
  user,
  navItems,
  collapsed,
  onNavigate,
  onLogout,
  onLockedClick,
}: {
  user: DashboardUser;
  navItems: DashboardNavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
  onLogout?: () => void;
  onLockedClick?: (item: DashboardNavItem) => void;
}) {
  const [location] = useLocation();
  const withReviewApp = (() => {
    if (navItems.some((item) => item.href.endsWith("/review-app"))) return navItems;
    const first = navItems[0]?.href ?? "";
    let href = "";
    if (first.startsWith("/seller")) href = "/seller/review-app";
    else if (first.startsWith("/inspector")) href = "/inspector/review-app";
    else if (first.startsWith("/dashboard")) href = "/dashboard/review-app";
    if (!href) return navItems;
    return [...navItems, { href, label: "Review App", icon: Star }];
  })();

  return (
    <div className="flex h-full flex-col">
      {/* Profile block */}
      <div
        className={cn(
          "flex flex-col items-center gap-3 border-b border-gray-100 px-4 py-6 transition-all",
          collapsed && "px-2 py-4",
        )}
      >
        <Avatar
          className={cn(
            "ring-4 ring-primary/10 transition-all",
            collapsed ? "h-10 w-10" : "h-24 w-24",
          )}
        >
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
          <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">{user.name}</div>
            <div className="mt-1 flex items-center justify-center gap-2 text-xs text-gray-500">
              <span className="truncate max-w-[160px]">{user.email}</span>
              {user.showVerificationState ? (
                <Badge
                  className={
                    user.verified
                      ? "bg-primary/10 text-primary hover:bg-primary/10 border-0 text-[10px] px-1.5 py-0"
                      : "bg-amber-100 text-amber-800 hover:bg-amber-100 border-0 text-[10px] px-1.5 py-0"
                  }
                >
                  {user.verified ? "Verified" : "Unverified"}
                </Badge>
              ) : user.verified ? (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-0 text-[10px] px-1.5 py-0">
                  Verified
                </Badge>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          {withReviewApp.map((item) => {
            const Icon = item.icon;
            const active =
              !item.locked &&
              (location === item.href ||
                (item.href !== "/" && location.startsWith(item.href)));
            const tooltip = collapsed ? item.label : undefined;

            const inner = (
              <>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-gray-100 text-gray-600 group-hover:bg-gray-200",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-400" />
                  </>
                )}
              </>
            );

            return (
              <li key={item.href}>
                {item.locked ? (
                  <button
                    type="button"
                    title={tooltip}
                    onClick={() => {
                      onLockedClick?.(item);
                      onNavigate?.();
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition-all hover:bg-gray-50",
                      collapsed && "justify-center px-2",
                    )}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all",
                      active
                        ? "bg-primary/5 text-primary"
                        : "text-gray-700 hover:bg-gray-50",
                      collapsed && "justify-center px-2",
                    )}
                    title={tooltip}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
          {/* Logout row */}
          <li className="pt-2">
            <button
              onClick={onLogout}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-all hover:bg-red-50",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? "Logout" : undefined}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
                <LogOut className="h-4 w-4" />
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Logout</span>
                  <ChevronRight className="h-4 w-4 text-red-300" />
                </>
              )}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export function DashboardLayout({
  user,
  navItems,
  title,
  children,
  onLogout,
}: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { toast } = useToast();
  const mobileStickyItems = buildMobileStickyItems(navItems);

  const handleLockedClick = (item: DashboardNavItem) => {
    toast({
      title: "You're not yet verified",
      description:
        item.lockHint ??
        "Finish verification in Settings to unlock this section.",
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      <Navbar />

      <main className="flex-1">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          {/* Mobile top bar */}
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMobileOpen(true)}
              className="rounded-full"
              data-testid="button-open-dashboard-sidebar"
            >
              <PanelLeftOpen className="h-4 w-4 mr-2" />
              Menu
            </Button>
            {title && (
              <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            )}
            <div className="w-20" />
          </div>

          <div className="flex gap-4 lg:gap-6">
            {/* Desktop sidebar */}
            <aside
              className={cn(
                "hidden lg:flex relative shrink-0 rounded-2xl border border-gray-200 bg-white shadow-sm transition-[width] duration-300",
                collapsed ? "w-[84px]" : "w-[280px]",
              )}
            >
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="absolute -right-3 top-6 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md hover:text-primary hover:shadow-lg"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                data-testid="button-toggle-sidebar"
              >
                {collapsed ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
              <div className="w-full">
                <SidebarContent
                  user={user}
                  navItems={navItems}
                  collapsed={collapsed}
                  onLogout={onLogout}
                  onLockedClick={handleLockedClick}
                />
              </div>
            </aside>

            {/* Mobile drawer */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetContent side="left" className="w-[300px] p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Dashboard Menu</SheetTitle>
                </SheetHeader>
                <SidebarContent
                  user={user}
                  navItems={navItems}
                  collapsed={false}
                  onNavigate={() => setMobileOpen(false)}
                  onLogout={() => {
                    setMobileOpen(false);
                    onLogout?.();
                  }}
                  onLockedClick={handleLockedClick}
                />
              </SheetContent>
            </Sheet>

            {/* Main content */}
            <section className="flex-1 min-w-0 py-2 px-1 pb-24 sm:px-4 lg:px-6 lg:pb-2 overflow-x-auto">
              {children}
            </section>
          </div>
        </div>
      </main>

      <MobileStickyNav
        items={mobileStickyItems}
        onLockedClick={(item) => handleLockedClick(item as DashboardNavItem)}
      />
      <div className="hidden lg:block">
        <Footer />
      </div>
    </div>
  );
}

interface StatCardProps {
  value: string | number;
  label: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  iconTone?: "primary" | "secondary" | "success" | "danger";
  badges?: { text: string; tone: "success" | "danger" | "info" }[];
}

export function StatCard({
  value,
  label,
  icon: Icon,
  iconTone = "primary",
  badges,
}: StatCardProps) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/20 text-secondary-foreground",
    success: "bg-green-100 text-green-700",
    danger: "bg-red-100 text-red-600",
  }[iconTone];

  const badgeTone = {
    success: "bg-green-50 text-green-700 border-green-200",
    danger: "bg-red-50 text-red-600 border-red-200",
    info: "bg-blue-50 text-blue-600 border-blue-200",
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
          {value}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            toneClasses,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-gray-600">{label}</div>
      {badges && badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <span
              key={i}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                badgeTone[b.tone],
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
