import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/admin", label: "Home" },
  { href: "/admin/users", label: "User Mgt" },
  { href: "/admin/inventory", label: "Car Inventory" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/finances", label: "Finances" },
  { href: "/admin/support", label: "Customer Support" },
  { href: "/admin/cms", label: "CMS" },
  { href: "/admin/settings", label: "Settings" },
];

function isActive(current: string, href: string) {
  if (href === "/admin") return current === "/admin" || current === "/admin/";
  return current === href || current.startsWith(href + "/");
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const mobileNavRef = useRef<HTMLElement | null>(null);
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<Array<{
    id: number;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const fullName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : "Admin";
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "A";

  const loadNotifications = async () => {
    if (!user) return;
    try {
      setLoadingNotifications(true);
      const [itemsRes, countRes] = await Promise.all([
        fetch("/api/notifications?limit=8", { credentials: "include" }),
        fetch("/api/notifications/unread-count", { credentials: "include" }),
      ]);
      if (!itemsRes.ok || !countRes.ok) return;
      const itemsJson = (await itemsRes.json()) as {
        items?: Array<{
          id: number;
          title: string;
          message: string;
          isRead: boolean;
          createdAt: string;
        }>;
      };
      const countJson = (await countRes.json()) as { count?: number };
      setNotifications(itemsJson.items ?? []);
      setUnreadCount(Number(countJson.count ?? 0));
    } finally {
      setLoadingNotifications(false);
    }
  };

  const markOneRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // no-op
    }
  };

  const markAllRead = async () => {
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
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    void loadNotifications();
    const id = window.setInterval(() => {
      void loadNotifications();
    }, 30000);
    return () => window.clearInterval(id);
  }, [user?.id]);

  useEffect(() => {
    const nav = mobileNavRef.current;
    if (!nav) return;
    const activeLink = nav.querySelector('[data-admin-mobile-active="true"]') as HTMLElement | null;
    if (!activeLink) return;
    activeLink.scrollIntoView({ block: "nearest", inline: "center" });
  }, [location]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 flex items-center h-16 gap-2 max-w-[1400px]">
          {/* Logo */}
          <Link href="/admin" className="shrink-0" data-testid="link-admin-logo">
            <img
              src={`${import.meta.env.BASE_URL}admin-logo.png`}
              alt="Huce Auto Mart"
              className="h-20 w-auto object-contain"
            />
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-end flex-1 self-end -mb-px min-w-0 justify-center">
            {NAV_ITEMS.map((item) => {
              const active = isActive(location, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`relative px-2.5 lg:px-3 xl:px-4 py-3 text-xs lg:text-sm font-medium whitespace-nowrap transition-colors rounded-t-2xl ${
                    active
                      ? "bg-gray-50 text-primary font-semibold"
                      : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/80"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-label="Open admin menu"
                  data-testid="button-admin-menu"
                >
                  <Avatar className="h-9 w-9 ring-2 ring-white/20 hover:ring-white/40 transition">
                    {user?.profilePhotoUrl && (
                      <AvatarImage src={user.profilePhotoUrl} alt={fullName} />
                    )}
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">
                      {initials || "A"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {fullName || "Admin"}
                    </span>
                    <span className="text-xs text-gray-500 truncate">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/admin/settings" className="cursor-pointer">
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout()}
                  className="cursor-pointer text-red-600 focus:text-red-600"
                  data-testid="menuitem-admin-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Notifications"
                  className="relative h-9 w-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  data-testid="button-admin-bell"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] leading-4 text-white font-semibold">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <p className="text-sm font-semibold text-gray-900">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {loadingNotifications ? (
                    <div className="p-3 text-sm text-gray-500">Loading...</div>
                  ) : notifications.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500">No notifications yet.</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => void markOneRead(n.id)}
                        className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                          n.isRead ? "bg-white" : "bg-primary/5"
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile admin navigation */}
        <div className="md:hidden border-t border-white/15">
          <div className="container mx-auto px-3 sm:px-4 max-w-[1400px]">
            <nav
              ref={mobileNavRef}
              className="flex items-center gap-2 overflow-x-auto py-2 whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Admin sections"
            >
              {NAV_ITEMS.map((item) => {
                const active = isActive(location, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-admin-mobile-active={active ? "true" : "false"}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-white text-primary"
                        : "bg-white/10 text-primary-foreground/90 hover:bg-white/20"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
