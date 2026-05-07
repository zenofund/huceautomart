import {
  Home,
  ListChecks,
  ClipboardList,
  MessageSquare,
  Wallet,
  HeadphonesIcon,
  Settings,
} from "lucide-react";
import type { DashboardNavItem } from "@/components/dashboard-layout";

export function buildSellerNav(opts: { sellerVerified: boolean }): DashboardNavItem[] {
  const lockHint = opts.sellerVerified
    ? undefined
    : "Your seller account is unverified. Wait for admin approval to unlock.";
  const locked = !opts.sellerVerified;

  return [
    { href: "/seller", label: "Home", icon: Home },
    { href: "/seller/listings", label: "My Listings", icon: ListChecks, locked, lockHint },
    { href: "/seller/offers", label: "Offers", icon: ClipboardList, locked, lockHint },
    { href: "/seller/messages", label: "Messages", icon: MessageSquare, locked, lockHint },
    { href: "/seller/wallet", label: "Wallet", icon: Wallet, locked, lockHint },
    { href: "/seller/support", label: "Customer Support", icon: HeadphonesIcon },
    { href: "/seller/settings", label: "Settings", icon: Settings },
  ];
}
