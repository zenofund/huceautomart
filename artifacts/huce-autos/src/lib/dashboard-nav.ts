import { useEffect, useState } from "react";
import {
  Home,
  ClipboardList,
  Heart,
  Car,
  MessageSquare,
  Wallet as WalletIcon,
  HeadphonesIcon,
  UserRound,
} from "lucide-react";
import type { DashboardNavItem } from "@/components/dashboard-layout";
import { useAuth } from "@/context/auth-context";
import { buildSellerNav } from "@/lib/seller-nav";
import { inspectorNav } from "@/lib/inspector-nav";

const buyerNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/activity", label: "Inspection / Offers / Purchases", icon: ClipboardList },
  { href: "/dashboard/saved", label: "Saved Car", icon: Heart },
  { href: "/dashboard/history", label: "Viewed Car History", icon: Car },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/dashboard/support", label: "Customer Support", icon: HeadphonesIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

export interface DashboardNavInfo {
  navItems: DashboardNavItem[];
  basePath: "/dashboard" | "/seller" | "/inspector";
  role: "buyer" | "seller" | "inspector";
}

const VERIFIED_CACHE_KEY = "huce.sellerAllVerified";

function readCachedVerified(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(VERIFIED_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCachedVerified(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(VERIFIED_CACHE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function useDashboardNav(): DashboardNavInfo {
  const { user, isLoading } = useAuth();
  const rawRole = user?.role;
  const role: "buyer" | "seller" | "inspector" =
    rawRole === "seller"
      ? "seller"
      : rawRole === "inspector"
        ? "inspector"
        : "buyer";
  // Seed from sessionStorage so we don't flicker locked → unlocked on every
  // page navigation while the profile fetch is in flight.
  const [allVerified, setAllVerified] = useState<boolean>(readCachedVerified);

  useEffect(() => {
    // Don't clear cached verification while auth is still bootstrapping —
    // otherwise a hard refresh momentarily resets seller verification before
    // the user object resolves.
    if (isLoading) return;
    if (role !== "seller") {
      writeCachedVerified(false);
      setAllVerified(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sellers/me/profile", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const next = !!data?.profile?.isVerified;
        if (!cancelled) {
          setAllVerified(next);
          writeCachedVerified(next);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, isLoading]);

  if (role === "seller") {
    return {
      navItems: buildSellerNav({ sellerVerified: allVerified }),
      basePath: "/seller",
      role: "seller",
    };
  }

  if (role === "inspector") {
    return { navItems: inspectorNav, basePath: "/inspector", role: "inspector" };
  }

  return { navItems: buyerNav, basePath: "/dashboard", role: "buyer" };
}
