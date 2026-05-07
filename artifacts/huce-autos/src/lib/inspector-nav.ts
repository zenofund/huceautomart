import {
  Home,
  ClipboardCheck,
  Wallet,
  UserRound,
} from "lucide-react";
import type { DashboardNavItem } from "@/components/dashboard-layout";

export const inspectorNav: DashboardNavItem[] = [
  { href: "/inspector", label: "Home", icon: Home },
  { href: "/inspector/inspections", label: "Inspection", icon: ClipboardCheck },
  { href: "/inspector/wallet", label: "Wallet/Transactions", icon: Wallet },
  { href: "/inspector/profile", label: "Profile", icon: UserRound },
];
