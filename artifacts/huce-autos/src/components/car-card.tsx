import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Fuel, Gauge, Star, Settings2, Palette, ShieldCheck, ArrowUpRight, Heart } from "lucide-react";
import { formatNaira, formatMileage } from "@/lib/format";
import { generateSlug } from "@/lib/seo";
import type { Car } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CarCardProps {
  car: Car;
}

const CAR_PLACEHOLDER_IMAGES: Record<string, string> = {
  Toyota: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=600&q=80",
  Honda: "https://images.unsplash.com/photo-1588258219511-64eb629cb833?w=600&q=80",
  "Mercedes-Benz": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=600&q=80",
  BMW: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=600&q=80",
  Lexus: "https://images.unsplash.com/photo-1614200179396-2bdb77ebf81b?w=600&q=80",
  Audi: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=600&q=80",
  Ford: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=600&q=80",
  Porsche: "https://images.unsplash.com/photo-1606152421802-db97b9c7a11b?w=600&q=80",
  default: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80",
};

function getCarImage(car: Car): string {
  if (car.images && car.images.length > 0) {
    return car.images[0];
  }
  return CAR_PLACEHOLDER_IMAGES[car.make] || CAR_PLACEHOLDER_IMAGES.default;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").trim();
}

function truncateWords(text: string | null | undefined, maxWords: number): string {
  if (!text) return "";
  const plainText = stripHtml(text);
  const words = plainText.split(/\s+/);
  if (words.length <= maxWords) return plainText;
  return words.slice(0, maxWords).join(" ") + "…";
}

export function CarCard({ car }: CarCardProps) {
  const image = getCarImage(car);
  const descriptionStrip = truncateWords(car.description, 10);

  const { user: authUser } = useAuth();
  const isBuyer = authUser?.role === "buyer";
  const { toast } = useToast();

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

  const toggleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!authUser) {
      toast({
        title: "Sign in required",
        description: "Please sign in to your buyer account to use this feature.",
      });
      return;
    }
    if (!isBuyer) {
      toast({
        title: "Buyer account required",
        description: "Only buyer accounts can save cars.",
      });
      return;
    }

    if (savePending) return;
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

  return (
    <Link href={`/cars/${car.id}-${generateSlug(`${car.year} ${car.make} ${car.model}`)}`} data-testid={`card-car-${car.id}`}>
      <div className="group rounded-xl border border-border bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer">
        {/* Image */}
        <div className="relative overflow-hidden aspect-[16/10]">
          <img
            src={image}
            alt={`${car.year} ${car.make} ${car.model}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              (e.target as HTMLImageElement).src = CAR_PLACEHOLDER_IMAGES.default;
            }}
          />
            {/* Watermark is now baked into the image itself during upload */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute top-3 left-3 flex gap-2 z-10">
            <Badge
              className={`text-xs font-semibold shadow-sm ${
                car.condition === "new"
                  ? "bg-green-500 text-white hover:bg-green-500"
                  : "bg-primary text-primary-foreground hover:bg-primary"
              }`}
            >
              {car.condition === "new" ? "New" : "Used"}
            </Badge>
            {car.featured && (
              <Badge className="bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary shadow-sm">
                <Star className="h-3 w-3 mr-1 fill-current" />
                Featured
              </Badge>
            )}
          </div>
          
          {/* Like / Save Button */}
          <div className="absolute top-3 right-3 z-10">
            <TooltipProvider delayDuration={200}>
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
            </TooltipProvider>
          </div>

          <div className="absolute bottom-3 right-3 z-10">
            <span className="bg-black/70 text-white text-sm font-bold px-2 py-1 rounded-lg backdrop-blur-sm">
              {formatNaira(car.price)}
            </span>
          </div>
        </div>

        <div className="p-4">
          {/* Title + color + description strip */}
          <div className="mb-3">
            <h3 className="font-bold text-foreground text-base leading-tight group-hover:text-primary transition-colors">
              {car.year} {car.make} {car.model}
            </h3>
            {(car.color || descriptionStrip) && (
              <div className="mt-1 space-y-0.5">
                {car.color && (
                  <p className="text-xs font-medium text-muted-foreground">{car.color}</p>
                )}
                {descriptionStrip && (
                  <p className="text-xs text-muted-foreground/80 leading-snug">{descriptionStrip}</p>
                )}
              </div>
            )}
          </div>

          {/* Feature grid: 2 columns, each feature in its own cell */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Palette className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="truncate">{car.color || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Gauge className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="truncate">{(car.mileage ?? 0) > 0 ? formatMileage(car.mileage ?? 0) : "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Settings2 className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="truncate">{car.transmission || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Fuel className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="truncate">{car.fuelType || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="truncate">{car.condition === "new" ? "New Car" : "Used Car"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="truncate">{car.location}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground">
              by <span className="font-medium text-foreground">{car.sellerName}</span>
            </div>
            <span className="text-muted-foreground" aria-label="Open car details page">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
