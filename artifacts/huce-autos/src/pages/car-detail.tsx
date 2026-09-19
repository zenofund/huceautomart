import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, MapPin, Gauge, Calendar, Palette,
  BadgeCheck, Share2, Heart, Car, ArrowLeft,
  Fuel, Settings2, ShieldCheck, Hash, Disc, LayoutGrid,
  CheckCircle2, Navigation, Loader2, Mail, Copy, Check,
  MessageCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InspectionDialog } from "@/components/dialogs/inspection-dialog";
import { NewOfferDialog } from "@/components/dialogs/new-offer-dialog";
import { AdSlot } from "@/components/ad-slot";
import { SEO } from "@/components/seo";
import { useGetCar, getGetCarQueryKey } from "@workspace/api-client-react";
import { formatNaira, formatMileage, formatDate } from "@/lib/format";

import { extractIdFromSlug } from "@/lib/seo";
import { formatInlineMarkup } from "@/components/listing-detail/listing-detail-shared";

const PLACEHOLDER = "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80";

function normalizeMediaUrl(url: string): string {
  const v = String(url ?? "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith("/api/")) return v;
  if (v.startsWith("/objects/") || v.startsWith("/local/")) return `/api/storage${v}`;
  if (v.startsWith("/storage/")) return `/api${v}`;
  return v;
}

function ImageGallery({ images, overlay }: { images: string[]; overlay?: ReactNode }) {
  const [current, setCurrent] = useState(0);
  const normalized = images.map((img) => normalizeMediaUrl(img)).filter(Boolean);
  const imgs = normalized.length > 0 ? normalized : [PLACEHOLDER];

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[16/10]">
        <AnimatePresence mode="wait">
          <motion.img
            key={current}
            src={imgs[current]}
            alt="Car image"
            className="w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
          />
        </AnimatePresence>

        {imgs.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCurrent((c) => Math.min(imgs.length - 1, c + 1))}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Overlay action icons injected by parent */}
        {overlay && (
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {overlay}
          </div>
        )}

        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
          {current + 1} / {imgs.length}
        </div>
      </div>

      {imgs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {imgs.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === current ? "border-primary" : "border-transparent opacity-60 hover:opacity-80"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CarDetailPage() {
  const params = useParams<{ id: string }>();
  const id = extractIdFromSlug(params.id);

  const { data: car, isLoading } = useGetCar(id, {
    query: { enabled: !isNaN(id), queryKey: getGetCarQueryKey(id) },
  });

  // Record the view for the buyer's history. Fire-and-forget — failures here
  // shouldn't block rendering. We re-run only when the listing id changes.
  const { user: viewerForHistory } = useAuth();
  useEffect(() => {
    if (!viewerForHistory || isNaN(id)) return;
    fetch("/api/buyer/history", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: id }),
    }).catch(() => {});
  }, [id, viewerForHistory]);

  const [, setLocation] = useLocation();
  const { user: authUser } = useAuth();
  const isBuyer = authUser?.role === "buyer";
  const isVerifiedUser = !!authUser && authUser.emailVerified;
  const { toast } = useToast();
  const [chatStarting, setChatStarting] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  // ── Save car ──────────────────────────────────────────────────────────────
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);

  useEffect(() => {
    if (!authUser || !isBuyer || !car) return;
    let cancelled = false;
    fetch(`/api/buyer/saved/check/${car.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { saved?: boolean }) => { if (!cancelled) setSaved(!!d.saved); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authUser, isBuyer, car]);

  const toggleSave = async () => {
    if (!requireBuyer("save")) return;
    if (savePending || !car) return;
    const willSave = !saved;
    setSaved(willSave);
    setSavePending(true);
    try {
      if (willSave) {
        await fetch("/api/buyer/saved", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: car.id }),
        });
        toast({ title: "Car saved", description: "Find it under Saved Cars in your dashboard." });
      } else {
        await fetch(`/api/buyer/saved/${car.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        toast({ title: "Removed from saved" });
      }
    } catch {
      setSaved(!willSave);
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setSavePending(false);
    }
  };

  // ── Share car ─────────────────────────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const carUrl = typeof window !== "undefined" ? window.location.href : "";
  const carTitle = car ? `${car.year} ${car.make} ${car.model}` : "Check out this car";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(carUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const requireBuyer = (action?: "save" | "other"): boolean => {
    if (!authUser) {
      toast({
        title: "Sign in required",
        description: "Please sign in to your buyer account to use this feature.",
      });
      return false;
    }
    if (!isBuyer) {
      toast({
        title: "Buyer account required",
        description: action === "save"
          ? "Only buyer accounts can save cars."
          : "Only buyer accounts can make offers, request inspections, or chat with sellers.",
      });
      return false;
    }
    return true;
  };

  const openOffer = () => { if (requireBuyer()) setOfferOpen(true); };
  const openInspection = () => { if (requireBuyer()) setInspectionOpen(true); };

  const startChat = async () => {
    if (!car) return;
    if (!requireBuyer()) return;
    if (authUser!.id === car.sellerId) {
      toast({ title: "That's your own listing." });
      return;
    }
    setChatStarting(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: car.sellerId,
          listingId: car.id,
          subject: `${car.year} ${car.make} ${car.model}`.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to start chat");
      setLocation(`/dashboard/messages/${data.conversationId}`);
    } catch (err) {
      toast({
        title: "Could not start chat",
        description: err instanceof Error ? err.message : "Try again later.",
        variant: "destructive",
      });
    } finally {
      setChatStarting(false);
    }
  };

  if (isLoading && !isNaN(id)) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="aspect-[16/10] rounded-2xl w-full" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!isLoading && (isNaN(id) || !car)) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <Car className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="text-xl font-bold mb-2">Car Not Found</h2>
          <p className="text-muted-foreground mb-6">This listing may have been removed.</p>
          <Link href="/cars">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Browse All Cars
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  // Type narrowing: by this point either we returned above, or `car` is loaded.
  // The combined `!isLoading && !car` check above doesn't narrow `car` for TS,
  // so we add an explicit guard here.
  if (!car) return null;

  function maskVin(vin: string | null | undefined, isVerified: boolean) {
    if (!vin) return null;
    if (isVerified) return vin;
    if (vin.length <= 6) return "***";
    return vin.substring(0, 5) + "********" + vin.slice(-4);
  }

  const features = [
    { label: "Car Type",     value: car.carType,                                icon: Car },
    { label: "Mileage",      value: formatMileage(car.mileage ?? 0),            icon: Gauge },
    { label: "Fuel Type",    value: car.fuelType,                               icon: Fuel },
    { label: "Year",         value: car.year.toString(),                        icon: Calendar },
    { label: "Transmission", value: car.transmission,                           icon: Settings2 },
    { label: "Drive Type",   value: car.driveType,                              icon: Disc },
    { label: "Condition",    value: car.condition === "new" ? "New" : "Used",   icon: ShieldCheck },
    { label: "Doors",        value: car.doors ? `${car.doors} Doors` : null,   icon: LayoutGrid },
    { label: "Color",        value: car.color,                                  icon: Palette },
    { label: "VIN",          value: maskVin(car.vin, isVerifiedUser),           icon: Hash },
  ];

  const SellerBlock = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? "" : "space-y-3"}>
      {/* Seller row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <Avatar className={compact ? "h-14 w-14" : "h-12 w-12"}>
            {car.sellerAvatarUrl && <AvatarImage src={car.sellerAvatarUrl} alt={car.sellerName} />}
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-base">
              {car.sellerName?.[0]?.toUpperCase() ?? "S"}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card ${
              car.sellerIsOnline ? "bg-green-500" : "bg-gray-300"
            }`}
            title={car.sellerIsOnline ? "Online" : "Offline"}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-foreground text-sm leading-tight">{car.sellerName}</span>
            <span className="text-xs text-muted-foreground">· Verified Seller</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              {car.location}
            </span>
            <Link href={`/sellers/${car.sellerId}`}>
              <span className="text-xs text-primary underline underline-offset-2 cursor-pointer hover:text-primary/80 transition-colors">
                View Reviews
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Badges */}
      {!compact && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 font-medium">
            <BadgeCheck className="h-3 w-3" /> Verified ID
          </span>
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 font-medium">
            Quick Reply
          </span>
        </div>
      )}
    </div>
  );

  const ActionButtons = ({ className = "" }: { className?: string }) => (
    <div className={`flex gap-2 ${className}`}>
      <Button
        onClick={openOffer}
        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-2.5 px-3 h-auto flex-1"
        data-testid="button-make-offer"
      >
        Make an Offer
      </Button>
      <Button
        variant="outline"
        onClick={openInspection}
        className="text-xs py-2.5 px-3 h-auto font-medium flex-1 border-primary/40 text-primary hover:bg-primary/5"
        data-testid="button-inspection"
      >
        Request Inspection
      </Button>
      <Button
        variant="outline"
        onClick={startChat}
        disabled={chatStarting}
        className="text-xs py-2.5 px-3 h-auto font-medium flex-1 border-primary/40 text-primary hover:bg-primary/5"
        data-testid="button-start-chat"
      >
        {chatStarting ? "Opening…" : "Start Chat"}
      </Button>
    </div>
  );

  return (
    <Layout>
      <SEO 
        title={`${car.year} ${car.make} ${car.model} for Sale in ${car.location} | HUCE Automart`}
        description={`Buy this ${car.condition === "new" ? "New" : "Used"} ${car.year} ${car.make} ${car.model} for ${formatNaira(car.price)} in ${car.location}. Inspected and verified on HUCE Automart.`}
        image={car.images?.[0] || PLACEHOLDER}
        url={carUrl}
        type="product"
        schema={{
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": `${car.year} ${car.make} ${car.model}`,
          "image": car.images?.[0] || PLACEHOLDER,
          "description": car.description || `Buy this ${car.year} ${car.make} ${car.model} in ${car.location}.`,
          "brand": {
            "@type": "Brand",
            "name": car.make
          },
          "offers": {
            "@type": "Offer",
            "url": carUrl,
            "priceCurrency": "NGN",
            "price": car.price,
            "itemCondition": car.condition === "new" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
            "availability": "https://schema.org/InStock",
            "seller": {
              "@type": "Organization",
              "name": "HUCE Automart"
            }
          }
        }}
      />
      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/cars" className="hover:text-foreground">Cars</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{car.year} {car.make} {car.model}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: gallery + mobile info + car overview + description */}
          <div className="lg:col-span-2 space-y-5">
            <ImageGallery
              images={car.images}
              overlay={
                <TooltipProvider delayDuration={200}>
                  {/* Save button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleSave}
                        disabled={savePending}
                        className={`bg-white/90 backdrop-blur-sm hover:bg-white p-2.5 rounded-full shadow-md transition-all duration-200 ${
                          saved ? "text-rose-500" : "text-gray-700 hover:text-rose-500"
                        }`}
                        aria-label={saved ? "Unsave car" : "Save car"}
                      >
                        {savePending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Heart className={`h-4 w-4 ${saved ? "fill-rose-500" : ""}`} />
                        }
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg">
                      {saved ? "Remove from saved" : "Save Car"}
                    </TooltipContent>
                  </Tooltip>

                  {/* Share button with popover menu */}
                  <Popover open={shareOpen} onOpenChange={setShareOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            className="bg-white/90 backdrop-blur-sm hover:bg-white text-gray-700 hover:text-primary p-2.5 rounded-full shadow-md transition-all duration-200"
                            aria-label="Share car"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg">
                        Share Car
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent side="left" align="start" className="w-52 p-2 shadow-xl rounded-xl">
                      <p className="text-xs font-semibold text-muted-foreground px-2 pb-2">Share this car</p>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`${carTitle} – ${carUrl}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShareOpen(false)}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-sm transition-colors w-full"
                      >
                        <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
                        WhatsApp
                      </a>
                      <a
                        href={`mailto:?subject=${encodeURIComponent(carTitle)}&body=${encodeURIComponent(`Check out this car on HUCE Autos:\n${carUrl}`)}`}
                        onClick={() => setShareOpen(false)}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-sm transition-colors w-full"
                      >
                        <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                        Email
                      </a>
                      <button
                        onClick={() => { void handleCopy(); setShareOpen(false); }}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-sm transition-colors w-full text-left"
                      >
                        {copied
                          ? <Check className="h-4 w-4 text-green-600 shrink-0" />
                          : <Copy className="h-4 w-4 text-gray-500 shrink-0" />
                        }
                        {copied ? "Copied!" : "Copy link"}
                      </button>
                    </PopoverContent>
                  </Popover>
                </TooltipProvider>
              }
            />

            {/* ── MOBILE-ONLY: Title + Price + Seller + Actions ── */}
            <div className="lg:hidden space-y-4">
              {/* Title + Price row */}
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-base font-black text-foreground leading-tight flex-1">
                  {car.make} {car.model} {car.year}
                </h1>
                <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap flex-shrink-0">
                  {formatNaira(car.price)}
                </div>
              </div>

              {/* Seller */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Seller</p>
                <SellerBlock compact />
              </div>

              {/* Action buttons */}
              <ActionButtons />
              <div className="mt-3">
                <AdSlot basePlacement="car_detail_actions" imageClassName="h-[120px] md:h-[140px]" />
              </div>
            </div>

            {/* Car Overview */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-bold text-foreground mb-4">Car Overview</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                {features.map((f) => (
                  <div key={f.label} className="flex items-start gap-2.5 min-w-0">
                    <div className="bg-primary/10 rounded-lg p-1.5 mt-0.5 flex-shrink-0">
                      <f.icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] sm:text-xs text-muted-foreground">{f.label}</div>
                      <div className="font-bold text-foreground text-[12.6px] sm:text-sm truncate">
                        {f.value ?? <span className="text-muted-foreground/60 font-normal">—</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {car.description && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-bold text-foreground mb-3">Description</h2>
                <div 
                  className="prose prose-gray max-w-none text-muted-foreground text-sm leading-relaxed break-words whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: formatInlineMarkup(car.description) }}
                />
              </div>
            )}

            {/* Features */}
            {car.features && Object.keys(car.features).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-bold text-foreground mb-4">Features</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
                  {Object.entries(car.features).map(([groupName, items]) => (
                    <div key={groupName}>
                      <h3 className="text-sm font-semibold text-foreground mb-3">
                        {groupName}
                      </h3>
                      <ul className="space-y-2">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                            <span>{item.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Location */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-bold text-foreground mb-3">Location</h2>
              <div className="flex items-start gap-2 mb-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm text-foreground">{car.location}</span>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(car.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 underline underline-offset-2"
              >
                Get Directions
                <Navigation className="h-3.5 w-3.5" />
              </a>
              <div className="mt-4 rounded-lg overflow-hidden border border-border h-72 bg-muted">
                <iframe
                  title={`Map of ${car.location}`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(car.location)}&output=embed`}
                  width="100%"
                  height="100%"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0 }}
                />
              </div>
            </div>
          </div>

          {/* ── DESKTOP-ONLY: Right sticky panel ── */}
          <div className="hidden lg:block">
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6 sticky top-6">
              {/* Title */}
              <h1 className="text-xl font-black text-foreground leading-tight">
                {car.year} {car.make} {car.model}
              </h1>

              {/* Price */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Price</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">{formatNaira(car.price)}</span>
                  <span className="text-lg font-semibold text-muted-foreground">.00</span>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Seller */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Seller</p>
                <SellerBlock />
              </div>

              <div className="border-t border-border" />

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={openOffer}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-2.5 px-4 h-auto flex-1 min-w-[110px]"
                  data-testid="button-make-offer"
                >
                  Make an Offer
                </Button>
                <Button
                  variant="outline"
                  onClick={openInspection}
                  className="text-xs py-2.5 px-4 h-auto font-medium flex-1 min-w-[90px]"
                  data-testid="button-inspection"
                >
                  Inspection
                </Button>
                <Button
                  variant="outline"
                  onClick={startChat}
                  disabled={chatStarting}
                  className="text-xs py-2.5 px-4 h-auto font-medium flex-1 min-w-[90px]"
                  data-testid="button-start-chat"
                >
                  {chatStarting ? "Opening…" : "Start Chat"}
                </Button>
              </div>
              <div className="mt-3">
                <AdSlot basePlacement="car_detail_actions" imageClassName="h-[120px] md:h-[140px]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <InspectionDialog
        open={inspectionOpen}
        onClose={() => setInspectionOpen(false)}
        listingId={car.id}
        carMake={carTitle}
        onCreated={(id) => {
          setInspectionOpen(false);
          setLocation(`/dashboard/activity/${id}`);
        }}
      />

      <NewOfferDialog
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listingId={car.id}
        suggestedPrices={(() => {
          // Quick-pick chips anchored on the listing price: a small discount
          // ladder (-10%, -7%, -5%, -3%) plus full ask. Keeps the buyer's
          // first counteroffers realistic instead of using stale defaults.
          const p = Number(car.price);
          if (!Number.isFinite(p) || p <= 0) return undefined;
          const round = (n: number) => Math.round(n / 10000) * 10000;
          return [round(p * 0.9), round(p * 0.93), round(p * 0.95), round(p * 0.97), p];
        })()}
      />
    </Layout>
  );
}
