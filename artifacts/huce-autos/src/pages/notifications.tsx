import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, CheckCheck, ChevronLeft, RefreshCw } from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { useAuth } from "@/context/auth-context";
import { useDashboardNav } from "@/lib/dashboard-nav";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

function formatDateTime(raw: string) {
  return new Date(raw).toLocaleString();
}

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  const { user: authUser, logout } = useAuth();
  const { navItems } = useDashboardNav();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const user: DashboardUser = {
    name: authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "User",
    email: authUser?.email ?? "user@huceautos.com",
    verified: authUser?.emailVerified ?? false,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const dashboardHref = useMemo(() => {
    if (authUser?.role === "seller") return "/seller";
    if (authUser?.role === "inspector") return "/inspector";
    if (authUser?.role === "admin") return "/admin";
    return "/dashboard";
  }, [authUser?.role]);

  const loadNotifications = async (silent = false) => {
    if (!authUser) return;
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const [itemsRes, countRes] = await Promise.all([
        fetch("/api/notifications?limit=100", { credentials: "include" }),
        fetch("/api/notifications/unread-count", { credentials: "include" }),
      ]);
      if (!itemsRes.ok || !countRes.ok) return;

      const itemsJson = (await itemsRes.json()) as { items?: NotificationItem[] };
      const countJson = (await countRes.json()) as { count?: number };
      const deduped = Array.from(
        new Map((itemsJson.items ?? []).map((item) => [item.id, item])).values(),
      );
      setNotifications(deduped);
      setUnreadCount(Number(countJson.count ?? 0));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markOneRead = async (id: number) => {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.isRead) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // no-op
    }
  };

  const markAllRead = async () => {
    if (unreadCount <= 0) return;
    try {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        credentials: "include",
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    if (!authUser) return;
    void loadNotifications();
    const id = window.setInterval(() => {
      void loadNotifications(true);
    }, 30000);
    return () => window.clearInterval(id);
  }, [authUser?.id]);

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  return (
    <DashboardLayout
      user={user}
      navItems={navItems}
      title="Notifications"
      onLogout={handleLogout}
    >
      <section className="container mx-auto max-w-3xl px-4 py-4 sm:py-8">
        <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
          <button
            type="button"
            onClick={() => setLocation(dashboardHref)}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-primary transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <Link href={dashboardHref} className="text-xs font-medium text-primary hover:underline sm:text-sm">
            Go to Dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="sticky top-14 z-10 rounded-t-2xl border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:top-0 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Bell className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
                <h1 className="truncate text-base font-bold text-gray-900 sm:text-lg">
                  Notifications
                </h1>
                {unreadCount > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadNotifications(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-primary hover:text-primary transition-colors"
                  aria-label="Refresh notifications"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/25 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4 sm:p-5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="animate-pulse rounded-xl border border-gray-100 p-4">
                    <div className="h-4 w-1/2 rounded bg-gray-200" />
                    <div className="mt-2 h-3 w-11/12 rounded bg-gray-100" />
                    <div className="mt-1 h-3 w-2/3 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
                <div className="mb-3 rounded-full bg-primary/10 p-3 text-primary">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-gray-900">No notifications yet</p>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                  New activity will appear here as soon as it happens.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void markOneRead(item.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 sm:px-5 sm:py-4 ${
                      item.isRead ? "bg-white" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!item.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900 sm:text-[15px]">
                          {item.title}
                        </p>
                        <p className="mt-1 line-clamp-3 text-xs text-gray-600 sm:text-sm">
                          {item.message}
                        </p>
                        <p className="mt-1.5 text-[11px] text-gray-400 sm:text-xs">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}
