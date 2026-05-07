import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import {
  Home, ClipboardList, Heart, Car, MessageSquare,
  Wallet, HeadphonesIcon, UserRound, Search, Trash2, Loader2,
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

function HistoryEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 sm:py-28">
      <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <ellipse cx="100" cy="135" rx="55" ry="5" fill="#D5E5D8" opacity="0.5" />
        <circle cx="100" cy="70" r="45" fill="#D5E5D8" />
        <circle cx="100" cy="70" r="36" fill="#FFFFFF" stroke="#9FB9A3" strokeWidth="2" />
        <path d="M100 50 L100 70 L113 78" stroke="#9FB9A3" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <h3 className="mt-6 text-base font-bold text-gray-900">No Viewed Cars</h3>
      <p className="mt-1 text-xs text-gray-400">You haven't viewed any car yet</p>
    </div>
  );
}

export default function BuyerViewedHistory() {
  const { user: authUser, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [cars, setCars] = useState<CarType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await jsonFetch<{ data: CarType[] }>("/api/buyer/history");
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

  const handleDelete = async (id: number) => {
    if (deleting.has(id)) return;
    setDeleting((prev) => new Set(prev).add(id));
    // Optimistic — drop only the failed row back in on error to avoid
    // resurrecting cards that other in-flight deletes already removed.
    const restore = cars?.find((c) => c.id === id);
    setCars((cs) => (cs ? cs.filter((c) => c.id !== id) : cs));
    try {
      await jsonFetch(`/api/buyer/history/${id}`, { method: "DELETE" });
    } catch (e) {
      if (restore) {
        setCars((cs) => (cs && !cs.some((c) => c.id === id) ? [restore, ...cs] : cs));
      }
      toast({
        title: "Could not delete",
        description: e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setDeleting((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const handleClearAll = async () => {
    if (clearing || !cars || cars.length === 0) return;
    setClearing(true);
    const prev = cars;
    setCars([]);
    try {
      await jsonFetch("/api/buyer/history", { method: "DELETE" });
      toast({ title: "History cleared" });
    } catch (e) {
      setCars(prev);
      toast({
        title: "Could not clear history",
        description: e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  };

  const user: DashboardUser = {
    name: authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "Buyer",
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? true,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => { await logout(); setLocation("/sign-in"); };

  const canClear = (cars?.length ?? 0) > 0 && !clearing;

  return (
    <DashboardLayout user={user} navItems={buyerNav} title="Car History" onLogout={handleLogout}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-gray-900">Car History</h1>
          <p className="text-xs text-gray-500 mt-0.5">Car Viewed History</p>
        </div>
        <button
          onClick={() => void handleClearAll()}
          disabled={!canClear}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F15A29] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#d94d20] transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto"
          data-testid="button-delete-all-history"
        >
          {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete All History
        </button>
      </div>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search here..."
          className="w-full rounded-full border border-gray-200 bg-white pl-11 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          data-testid="input-search-history"
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
        <HistoryEmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((car) => (
            <div key={car.id} className="relative">
              <CarCard car={car} />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleDelete(car.id);
                }}
                disabled={deleting.has(car.id)}
                className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-white/95 shadow-md flex items-center justify-center hover:bg-white transition-colors disabled:opacity-60"
                aria-label="Delete from history"
                data-testid={`button-delete-history-${car.id}`}
              >
                {deleting.has(car.id) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F15A29]" />
                ) : (
                  <Trash2 className="h-4 w-4 text-[#F15A29]" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
