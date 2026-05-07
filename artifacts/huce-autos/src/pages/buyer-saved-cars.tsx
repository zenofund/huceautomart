import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import {
  Home, ClipboardList, Heart, Car, MessageSquare,
  Wallet, HeadphonesIcon, UserRound, Search, Loader2,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardNavItem,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { CarCard } from "@/components/car-card";
import { type Car as CarType } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

const buyerNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/activity", label: "Inspection / Offers / Purchases", icon: ClipboardList },
  { href: "/dashboard/saved", label: "Saved Car", icon: Heart },
  { href: "/dashboard/history", label: "Viewed Car History", icon: Car },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/support", label: "Customer Support", icon: HeadphonesIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

function SavedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 sm:py-28">
      <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <ellipse cx="100" cy="135" rx="55" ry="5" fill="#D5E5D8" opacity="0.5" />
        <path d="M55 60 C 55 40, 80 30, 92 48 C 97 55, 100 60, 100 60 C 100 60, 103 55, 108 48 C 120 30, 145 40, 145 60 C 145 85, 105 115, 100 115 C 95 115, 55 85, 55 60 Z" fill="#D5E5D8" />
        <path d="M65 56 C 65 40, 85 32, 95 46 C 99 52, 102 56, 102 56 C 102 56, 105 52, 109 46 C 119 32, 139 40, 139 56 C 139 78, 105 103, 102 103 C 99 103, 65 78, 65 56 Z" fill="#FFFFFF" stroke="#9FB9A3" strokeWidth="2" />
      </svg>
      <h3 className="mt-6 text-base font-bold text-gray-900">No Saved Listings</h3>
      <p className="mt-1 text-xs text-gray-400">You haven't marked any favorite</p>
    </div>
  );
}

export default function BuyerSavedCars() {
  const { user: authUser, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [cars, setCars] = useState<CarType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  // Initial load. The list reflects the latest server state, so a refresh
  // after navigating away will not bring back items the user removed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await jsonFetch<{ data: CarType[] }>("/api/buyer/saved");
        if (!cancelled) setCars(res.data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!cars) return [];
    if (!search) return cars;
    const q = search.toLowerCase();
    return cars.filter(
      (c) =>
        c.make.toLowerCase().includes(q) ||
        c.model.toLowerCase().includes(q) ||
        (c.color ?? "").toLowerCase().includes(q),
    );
  }, [cars, search]);

  const handleRemove = async (id: number) => {
    if (removing.has(id)) return;
    setRemoving((prev) => new Set(prev).add(id));
    // Optimistic — drop the row immediately. If the request fails, splice
    // ONLY this car back in so concurrent removals on other rows don't get
    // resurrected by a stale snapshot.
    const restore = cars?.find((c) => c.id === id);
    setCars((cs) => (cs ? cs.filter((c) => c.id !== id) : cs));
    try {
      await jsonFetch(`/api/buyer/saved/${id}`, { method: "DELETE" });
    } catch (e) {
      if (restore) {
        setCars((cs) => (cs && !cs.some((c) => c.id === id) ? [restore, ...cs] : cs));
      }
      toast({
        title: "Could not remove",
        description: e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setRemoving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const user: DashboardUser = {
    name: authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "Buyer",
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? true,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => { await logout(); setLocation("/sign-in"); };

  return (
    <DashboardLayout user={user} navItems={buyerNav} title="Saved Car" onLogout={handleLogout}>
      <div className="mb-4">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">Saved Car</h1>
      </div>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search here..."
          className="w-full rounded-full border border-gray-200 bg-white pl-11 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          data-testid="input-search-saved"
        />
      </div>

      {error ? (
        <div className="py-16 text-center text-sm text-red-500">{error}</div>
      ) : cars === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
              <Skeleton className="aspect-[16/10] w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <SavedEmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((car) => (
            <div key={car.id} className="relative">
              <CarCard car={car} />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleRemove(car.id);
                }}
                disabled={removing.has(car.id)}
                className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-white/95 shadow-md flex items-center justify-center hover:bg-white transition-colors disabled:opacity-60"
                aria-label="Remove from saved"
                data-testid={`button-unsave-${car.id}`}
              >
                {removing.has(car.id) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
                ) : (
                  <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
