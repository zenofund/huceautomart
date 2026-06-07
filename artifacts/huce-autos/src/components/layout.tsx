import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Phone, Mail, MapPin, ChevronDown, Bell, LayoutDashboard, UserRound, LogOut, Facebook, Instagram, ArrowUp, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileFooterSheet } from "@/components/mobile-footer-sheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/auth-context";

const DEFAULT_LOCATIONS = ["All Locations", "Lagos", "Abuja", "Port Harcourt"];
const LOCATION_STORAGE_KEY = "huce:selected-location";

function SmartAppBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // If inside our own mobile app's WebView, don't show the banner
    if ((window as any).ReactNativeWebView) return;
    
    // Check if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile && !sessionStorage.getItem('huce-app-banner-closed')) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const handleClose = () => {
    setShow(false);
    sessionStorage.setItem('huce-app-banner-closed', 'true');
  };

  const handleOpenApp = () => {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const playStoreLink = 'https://play.google.com/store/apps/details?id=com.huceautomart.mobile&pcampaignid=web_share';
    const appStoreLink: string | null = null;
    const currentPath = window.location.pathname + window.location.search;
    
    if (isAndroid) {
      window.location.href = `intent://${window.location.host}${currentPath}#Intent;scheme=https;package=com.huceautomart.mobile;S.browser_fallback_url=${encodeURIComponent(playStoreLink)};end;`;
    } else {
      const now = Date.now();
      setTimeout(() => {
        if (Date.now() - now < 2000) {
          if (appStoreLink) window.location.href = appStoreLink;
        }
      }, 1500);
      window.location.href = `huceautos://${currentPath}`;
    }
  };

  return (
    <div className="bg-primary/5 border-b border-primary/10 px-4 py-3 flex items-center justify-between shadow-sm relative z-50">
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        <button onClick={handleClose} className="p-1 -ml-1 text-gray-500 hover:text-gray-700" aria-label="Close banner">
          <X className="h-4 w-4" />
        </button>
        <div className="h-9 w-9 bg-primary text-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-sm font-bold text-gray-900 truncate">Huce Automart App</span>
          <span className="text-xs text-gray-600 truncate">Faster, secure & optimized</span>
        </div>
      </div>
      <button 
        onClick={handleOpenApp}
        className="shrink-0 bg-primary text-white text-xs font-bold px-4 py-2 rounded-full shadow-sm hover:bg-primary/90 transition-colors"
      >
        OPEN IN APP
      </button>
    </div>
  );
}

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("All Locations");
  const [locationOpen, setLocationOpen] = useState(false);
  const [mobileLocationOpen, setMobileLocationOpen] = useState(false);
  const { user, logout } = useAuth();
  
  const { data: dynamicLocations } = useQuery<string[]>({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await fetch("/api/cars/locations");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const locationsList = [
    "All Locations",
    ...Array.from(new Set([...(dynamicLocations ?? []), ...DEFAULT_LOCATIONS.slice(1)])).sort()
  ];
  const [notifications, setNotifications] = useState<Array<{
    id: number;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const dashboardHref =
    user?.role === "seller"
      ? "/seller"
      : user?.role === "inspector"
        ? "/inspector"
        : user?.role === "admin"
          ? "/admin"
          : "/dashboard";
  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : "";
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

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
      const deduped = Array.from(
        new Map((itemsJson.items ?? []).map((item) => [item.id, item])).values(),
      );
      setNotifications(deduped);
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
    const searchParams = new URLSearchParams(window.location.search);
    const queryLocation = searchParams.get("location");
    if (queryLocation && locationsList.includes(queryLocation)) {
      setSelectedLocation(queryLocation);
      try {
        localStorage.setItem(LOCATION_STORAGE_KEY, queryLocation);
      } catch {
        // no-op
      }
      return;
    }

    try {
      const savedLocation = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (savedLocation && locationsList.includes(savedLocation)) {
        setSelectedLocation(savedLocation);
      } else {
        setSelectedLocation("All Locations");
      }
    } catch {
      setSelectedLocation("All Locations");
    }
  }, [location, locationsList.length]);

  const applyLocationFilter = (pickedLocation: string) => {
    setSelectedLocation(pickedLocation);
    setLocationOpen(false);

    try {
      if (pickedLocation === "All Locations") {
        localStorage.removeItem(LOCATION_STORAGE_KEY);
      } else {
        localStorage.setItem(LOCATION_STORAGE_KEY, pickedLocation);
      }
    } catch {
      // no-op
    }

    const params = new URLSearchParams();
    if (pickedLocation !== "All Locations") {
      params.set("location", pickedLocation);
    }
    const query = params.toString();
    setLocation(query ? `/cars?${query}` : "/cars");
    window.dispatchEvent(new Event("locationchange"));
  };

  const links: Array<
    | { href: string; label: string; isPlaceholder?: false }
    | { label: string; isPlaceholder: true }
  > = [
    { href: "/cars", label: "Buy A Car" },
    { href: "/sell", label: "Sell A Car" },
    { href: "/sellers", label: "Car Sellers" },
    { href: "/how-it-works", label: "How It Works" },
    { href: "/news", label: "News" },
  ];

  return (
    <>
      <SmartAppBanner />
      <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 md:px-5 lg:px-8 h-14 flex items-center justify-between gap-4 w-full">

        {/* Logo */}
        <Link href="/" className="shrink-0 group">
          <img
            src={`${import.meta.env.BASE_URL}huce-automart-logo.png`}
            alt="Huce Auto Mart"
            className="h-9 w-auto"
          />
        </Link>

        {/* Center Nav */}
        <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
          {links.map((link) => (
            link.isPlaceholder ? (
              <span
                key={link.label}
                className="px-3.5 py-2 text-sm font-medium text-gray-700/70 cursor-not-allowed rounded-md whitespace-nowrap"
                title="Coming soon"
                aria-disabled="true"
              >
                {link.label}
              </span>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className={`px-3.5 py-2 text-sm font-medium transition-colors rounded-md whitespace-nowrap ${
                  location === link.href
                    ? "text-primary font-semibold"
                    : "text-gray-700 hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            )
          ))}
        </nav>

        {/* Right side */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          {/* Location dropdown */}
          <div className="relative w-40 shrink-0">
            <button
              onClick={() => setLocationOpen(!locationOpen)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-full hover:border-gray-400 transition-colors bg-white"
            >
              <MapPin className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span className="flex-1 text-left truncate">{selectedLocation}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            </button>
            {locationOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                {locationsList.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => applyLocationFilter(loc)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${
                      selectedLocation === loc ? "text-primary font-medium" : "text-gray-700"
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>

          {user ? (
            <>
              {/* Notification bell */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Notifications"
                    className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:border-primary hover:text-primary transition-colors"
                    data-testid="button-notifications"
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
                  <div className="border-t px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setLocation("/notifications")}
                      className="w-full rounded-md py-1.5 text-center text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                    >
                      View all notifications
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Avatar dropdown */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    aria-label="Open account menu"
                    data-testid="button-account-menu"
                  >
                    <Avatar className="h-9 w-9 ring-2 ring-primary/10 hover:ring-primary/30 transition">
                      {user.profilePhotoUrl && (
                        <AvatarImage src={user.profilePhotoUrl} alt={fullName} />
                      )}
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                        {initials || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {fullName || user.email}
                      </span>
                      <span className="text-xs text-gray-500 truncate">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={dashboardHref} className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`${dashboardHref}/profile`} className="cursor-pointer">
                      <UserRound className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-red-600 focus:text-red-600"
                    data-testid="menuitem-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              {/* Sign In button */}
              <Link href="/sign-in">
                <button className="px-4 py-1.5 text-sm font-semibold rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors">
                  Sign - In
                </button>
              </Link>

              {/* Sign Up text link */}
              <Link href="/sign-up" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
                Sign - Up
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          {user && (
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setLocation("/notifications")}
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:border-primary hover:text-primary transition-colors"
              data-testid="button-notifications-mobile"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] leading-4 text-white font-semibold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-md p-0 text-gray-700 hover:bg-gray-100"
                aria-label="Open menu"
              >
                <span className="inline-flex flex-col items-start justify-center gap-[3px]">
                  <span className="block h-[2px] w-[16px] rounded bg-current" />
                  <span className="block h-[2px] w-[12px] rounded bg-current" />
                  <span className="block h-[2px] w-[16px] rounded bg-current" />
                </span>
              </Button>
            </SheetTrigger>
          <SheetContent side="right" className="w-[300px]">
            <SheetHeader className="sr-only">
              <SheetTitle>Mobile Menu</SheetTitle>
            </SheetHeader>
            <div className="mb-8">
              <img
                src={`${import.meta.env.BASE_URL}huce-automart-logo.png`}
                alt="Huce Auto Mart"
                className="h-9 w-auto"
              />
            </div>
            
            {/* Mobile Location Picker */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Location</p>
              <div className="relative">
                <button
                  onClick={() => setMobileLocationOpen(!mobileLocationOpen)}
                  className="flex w-full items-center gap-1.5 px-3 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors bg-white"
                >
                  <MapPin className="h-4 w-4 text-gray-500 shrink-0" />
                  <span className="flex-1 text-left truncate">{selectedLocation}</span>
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                </button>
                {mobileLocationOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                    {locationsList.map((loc) => (
                      <button
                        key={loc}
                        onClick={() => {
                          applyLocationFilter(loc);
                          setMobileLocationOpen(false);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
                          selectedLocation === loc ? "text-primary font-medium" : "text-gray-700"
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Menu</p>
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                link.isPlaceholder ? (
                  <span
                    key={link.label}
                    className="flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium text-gray-500 cursor-not-allowed"
                    title="Coming soon"
                    aria-disabled="true"
                  >
                    {link.label}
                    <ChevronRight className="h-4 w-4 opacity-30" />
                  </span>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      location === link.href
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {link.label}
                    <ChevronRight className="h-4 w-4 opacity-40" />
                  </Link>
                )
              ))}
              
              <MobileFooterSheet>
                <button className="flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors text-gray-700 hover:bg-gray-50 w-full text-left">
                  More Info
                  <ChevronRight className="h-4 w-4 opacity-40" />
                </button>
              </MobileFooterSheet>
            </nav>
            <div className="mt-6 flex flex-col gap-2">
              {user ? (
                <Link href={dashboardHref} onClick={() => setOpen(false)}>
                  <button className="w-full py-2.5 text-sm font-semibold rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors">
                    Dashboard
                  </button>
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" onClick={() => setOpen(false)}>
                    <button className="w-full py-2.5 text-sm font-semibold rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors">
                      Sign In
                    </button>
                  </Link>
                  <Link href="/sign-up" onClick={() => setOpen(false)}>
                    <button className="w-full py-2.5 text-sm font-medium border border-gray-300 rounded-full text-gray-700 hover:bg-gray-50 transition-colors">
                      Sign Up
                    </button>
                  </Link>
                </>
              )}
            </div>
            </SheetContent>
          </Sheet>
        </div>

      </div>
    </header>
    </>
  );
}

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground mt-16">
      <div className="container mx-auto px-4 py-12 hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr] gap-8 lg:gap-10">
        <div>
          <img
            src={`${import.meta.env.BASE_URL}footer-log.png`}
            alt="Huce Auto Mart"
            className="h-10 w-auto mb-4"
          />
          <p className="text-primary-foreground text-sm font-semibold leading-relaxed mb-3">
            Shop New &amp; Used Cars, On The
            <br className="sm:hidden" />
            {" "}Lot Or On The Go
          </p>
          <p className="text-primary-foreground/70 text-sm leading-relaxed mb-4">
            Nigeria's premier car buying and selling platform. Trusted by thousands of buyers and sellers nationwide.
          </p>
          <div className="flex flex-col gap-2 text-sm text-primary-foreground/60">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-secondary" />
              <span>0913 598 8513</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-secondary" />
              <span>hello@huceautomart.com</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-secondary" />
              <span>Lagos, Abuja, Port Harcourt</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 md:contents">
          <div>
            <h4 className="font-semibold mb-4 text-primary-foreground">Quick Links</h4>
            <ul className="space-y-3 text-sm font-semibold text-primary-foreground">
              <li><Link href="/cars" className="hover:text-secondary transition-colors">Buy a Car</Link></li>
              <li><Link href="/sell" className="hover:text-secondary transition-colors">Sell a Car</Link></li>
              <li><Link href="/news" className="hover:text-secondary transition-colors">News</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-primary-foreground">Company</h4>
            <ul className="space-y-3 text-sm font-semibold text-primary-foreground">
              <li><Link href="/about" className="hover:text-secondary transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-secondary transition-colors">Contact Us</Link></li>
              <li><Link href="/how-it-works" className="hover:text-secondary transition-colors">How it Works</Link></li>
              <li><Link href="/faq" className="hover:text-secondary transition-colors">FAQ's</Link></li>
            </ul>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-4 text-primary-foreground">Get the app</h4>
          <div className="flex flex-wrap gap-2 mb-5">
            <a
              href="#"
              className="inline-flex items-center justify-center gap-2 min-w-28 h-10 px-4 rounded-full border border-primary-foreground/40 text-xs font-semibold hover:border-primary-foreground/80 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              App Store
            </a>
            <a
              href="#"
              className="inline-flex items-center justify-center gap-2 min-w-28 h-10 px-4 rounded-full border border-primary-foreground/40 text-xs font-semibold hover:border-primary-foreground/80 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.24.99.2l12.6-7.28-2.7-2.7-10.89 9.78zM.54 1.04C.2 1.4 0 1.96 0 2.68v18.64c0 .72.2 1.28.55 1.64l.09.08 10.44-10.44v-.24L.63.96l-.09.08zM20.4 10.28l-2.98-1.72-3.02 3.02 3.02 3.02 3-1.73c.85-.49.85-1.29-.02-1.59zM3.18.24l12.6 7.28-2.7 2.7L3.18.24z"/>
              </svg>
              Google Play
            </a>
          </div>

          <h5 className="font-semibold mb-3 text-primary-foreground">Connect With Us</h5>
          <div className="flex items-center gap-2">
            <a href="https://www.facebook.com/profile.php?id=61588837874397" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="h-9 w-9 rounded-full border border-primary-foreground/40 flex items-center justify-center hover:border-primary-foreground/80 transition-colors">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="https://www.instagram.com/huceautomart?igsh=aTlicG1peHp1Z2lq" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="h-9 w-9 rounded-full border border-primary-foreground/40 flex items-center justify-center hover:border-primary-foreground/80 transition-colors">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="https://www.tiktok.com/@huceautomart" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="h-9 w-9 rounded-full border border-primary-foreground/40 flex items-center justify-center hover:border-primary-foreground/80 transition-colors">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.12-3.44-3.17-3.61-5.46-.02-.33-.02-.66-.02-.99.1-1.36.56-2.71 1.34-3.83 1.18-1.78 3.1-2.95 5.23-3.15.35-.04.7-.04 1.05-.04v4.01c-.89.04-1.77.34-2.51.87-.87.62-1.46 1.53-1.61 2.6-.08.57-.04 1.16.14 1.7.35.98 1.12 1.8 2.05 2.19.86.37 1.85.42 2.74.13.93-.31 1.72-.98 2.17-1.85.31-.6.44-1.27.46-1.93.01-4.66.01-9.32.01-13.98z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-primary-foreground/20">
        <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="text-primary-foreground/80">&copy; {new Date().getFullYear()} Huce Autos. All rights reserved.</span>
            <div className="md:hidden">
              <MobileFooterSheet>
                <button className="text-primary-foreground/90 underline underline-offset-4 opacity-80 hover:opacity-100 transition-opacity">
                  View More Info
                </button>
              </MobileFooterSheet>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-primary-foreground/90">
            <Link href="/terms-and-conditions" className="hover:text-secondary transition-colors">Terms &amp; Conditions</Link>
            <span className="text-primary-foreground/60">•</span>
            <Link href="/privacy-policy" className="hover:text-secondary transition-colors">Privacy Policy</Link>
            <span className="text-primary-foreground/60">•</span>
            <Link href="/refund-policy" className="hover:text-secondary transition-colors">Refund Policy</Link>
            <span className="text-primary-foreground/60">•</span>
            <Link href="/verified-sellers-program" className="hover:text-secondary transition-colors">Verified Sellers Program</Link>
            <a href="#" aria-label="Back to top" className="ml-1 h-6 w-6 rounded-full border border-primary-foreground/40 flex items-center justify-center hover:border-primary-foreground/80 transition-colors">
              <ArrowUp className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
