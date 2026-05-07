import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Search, Star, Shield, Wrench, DollarSign, ChevronRight, ChevronLeft,
  TrendingUp, Car, Users, CheckCircle, ArrowRight, MapPin, BadgeCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Layout } from "@/components/layout";
import { CarCard } from "@/components/car-card";
import { AdSlot } from "@/components/ad-slot";
import { NewsCard } from "@/components/news-card";
import {
  useGetFeaturedCars, useGetRecentCars, useGetStatsOverview, useGetStatsByMake, useGetNewsList
} from "@workspace/api-client-react";
import { formatNaira, formatNumber } from "@/lib/format";

const MAKES = ["Toyota", "Honda", "Mercedes-Benz", "BMW", "Lexus", "Audi", "Ford", "Hyundai", "Kia", "Volkswagen", "Porsche", "Range Rover", "Chevrolet"];
const MODELS_MAP: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla", "Highlander", "Land Cruiser", "Avalon"],
  Honda: ["Accord", "CR-V", "Civic", "Pilot"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLE", "GLC"],
  BMW: ["3 Series", "5 Series", "X5", "X3"],
  Lexus: ["ES 350", "RX 350", "GX 460", "LX 570"],
  Audi: ["Q5", "A4", "Q7", "A6"],
};
const YEARS = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
const LOCATIONS = ["Lagos", "Abuja", "Port Harcourt"];

function HeroSection() {
  const [, navigate] = useLocation();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [loc, setLoc] = useState("");
  const [tab, setTab] = useState("all");
  const { data: stats } = useGetStatsOverview();

  // Count shown in the search button reflects the active tab
  const tabCount =
    tab === "new" ? (stats?.totalNewCars ?? 0) :
    tab === "used" ? (stats?.totalUsedCars ?? 0) :
    (stats?.totalCars ?? 0);

  const handleSearch = () => {
    if (tab === "compare") { navigate("/compare"); return; }
    const params = new URLSearchParams();
    if (make) params.set("make", make);
    if (model) params.set("model", model);
    if (year) params.set("year", year);
    if (loc) params.set("location", loc);
    if (tab === "new" || tab === "used") params.set("condition", tab);
    navigate(`/cars?${params.toString()}`);
  };

  const TABS = [
    { id: "all", label: "All" },
    { id: "new", label: "New" },
    { id: "used", label: "Used" },
    { id: "compare", label: "Compare Cars" },
  ];

  return (
    <div className="relative px-0 md:px-5 lg:px-8 pt-0 md:pt-3">
      {/* Green hero banner — boxed with rounded bottom corners */}
      <section
        className="relative overflow-hidden w-full min-h-[455px] md:min-h-0"
        style={{
          background: "linear-gradient(135deg, #16a34a 0%, #15803d 35%, #166534 62%, #14532d 100%)",
          minHeight: 390,
          paddingBottom: 120,
          borderRadius: "0 0 1.5rem 1.5rem",
        }}
      >
        {/* Radial glow top-left */}
        <div
          className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(134,239,172,0.30) 0%, transparent 70%)",
          }}
        />

        {/* Subtle tile pattern for hero depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            opacity: 0.35,
          }}
        />

        {/* Cars image — right side with slight edge crop like reference */}
        <div
          className="md:hidden absolute pointer-events-none select-none"
          style={{
            right: "-185px",
            bottom: "30px",
            width: "96%",
            maxWidth: 640,
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}cars-hero.png`}
            alt="Featured cars"
            className="w-full object-contain object-bottom"
            style={{ maxHeight: 395 }}
          />
        </div>

        <div
          className="hidden md:block absolute pointer-events-none select-none"
          style={{
            right: "-120px",
            bottom: "-8px",
            width: "76%",
            maxWidth: 980,
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}cars-hero.png`}
            alt="Featured cars"
            className="w-full object-contain object-bottom"
            style={{ maxHeight: 420 }}
          />
        </div>

        {/* Left text content */}
        <div className="relative z-10 px-5 md:px-8 lg:px-14 flex items-start md:items-center pt-9 md:pt-0" style={{ minHeight: 308 }}>
          <div className="py-8 md:py-10" style={{ maxWidth: 540 }}>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            >
              <h1 className="font-black text-white leading-tight mb-3" style={{ fontSize: "clamp(1.45rem, 5vw, 2.5rem)" }}>
                Find the{" "}
                <span style={{ color: "#fbbf24" }}>Perfect Car</span>
                <br />
                Fast and Easy
              </h1>
              <p className="text-white/90 leading-relaxed text-sm md:text-base font-medium max-w-lg">
                Your Trusted Partner for Cars and Auto Services Across Nigeria – Anytime, Anywhere.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Search card — overlaps hero by 50px */}
      <div className="relative z-20 px-3 md:px-[60px]" style={{ marginTop: -50 }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-6 pt-5 pb-6"
        >
          {/* Tabs */}
          <div className="flex items-center gap-0 mb-5 border-b border-gray-200">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.id
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "compare" ? (
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm mb-4">Compare two cars side by side to find your perfect match.</p>
              <Link href="/compare">
                <button className="px-8 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors">
                  Go to Compare Cars →
                </button>
              </Link>
            </div>
          ) : (
            <>
              {/* Dropdowns row with labels */}
              <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
                <div className="flex-[5] grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Select Makes</label>
                    <Select value={make} onValueChange={(v) => { setMake(v === "any" ? "" : v); setModel(""); }}>
                      <SelectTrigger className="h-10 text-sm border-gray-300">
                        <SelectValue placeholder="Any Make" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Make</SelectItem>
                        {MAKES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Select Model</label>
                    <Select value={model} onValueChange={(v) => setModel(v === "any" ? "" : v)}>
                      <SelectTrigger className="h-10 text-sm border-gray-300">
                        <SelectValue placeholder="Any Model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Model</SelectItem>
                        {(make ? MODELS_MAP[make] || [] : []).map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Select Year</label>
                    <Select value={year} onValueChange={(v) => setYear(v === "any" ? "" : v)}>
                      <SelectTrigger className="h-10 text-sm border-gray-300">
                        <SelectValue placeholder="Any Year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Year</SelectItem>
                        {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Location</label>
                    <Select value={loc} onValueChange={(v) => setLoc(v === "any" ? "" : v)}>
                      <SelectTrigger className="h-10 text-sm border-gray-300">
                        <SelectValue placeholder="Any Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Location</SelectItem>
                        {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Advanced Search link */}
                <div className="shrink-0 pb-0.5">
                  <Link href="/cars" className="text-sm font-semibold text-primary hover:underline whitespace-nowrap">
                    Advanced Search
                  </Link>
                </div>
              </div>

              {/* Search button — full width on mobile, half width on desktop */}
              <div className="flex">
                <button
                  onClick={handleSearch}
                  className="h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-colors w-full md:w-1/2"
                  style={{ background: "#14532d" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#166534")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#14532d")}
                >
                  <Search className="h-4 w-4" />
                  Search ({tabCount > 0 ? `${tabCount} Cars` : "Cars"})
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

interface DbCategory {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

const CAR_TYPES = [
  {
    label: "Sedan",
    slug: "sedan",
    svg: (
      <svg viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M8,68 L8,50 L26,33 L54,25 L122,25 L148,37 L186,44 L190,50 L190,68 Z" fill="currentColor"/>
        <path d="M30,50 L50,31 L118,31 L140,42 L140,50 Z" fill="white" fillOpacity="0.35"/>
        <circle cx="48" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="48" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
        <circle cx="152" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="152" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
      </svg>
    ),
  },
  {
    label: "SUV",
    slug: "suv",
    svg: (
      <svg viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M8,68 L8,36 L24,20 L52,16 L148,16 L168,26 L188,38 L190,48 L190,68 Z" fill="currentColor"/>
        <path d="M26,36 L40,20 L144,20 L162,30 L162,36 Z" fill="white" fillOpacity="0.35"/>
        <circle cx="48" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="48" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
        <circle cx="155" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="155" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
      </svg>
    ),
  },
  {
    label: "Hatchback",
    slug: "hatchback",
    svg: (
      <svg viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M12,68 L12,50 L34,28 L68,22 L138,22 L162,36 L182,50 L182,68 Z" fill="currentColor"/>
        <path d="M38,50 L60,26 L132,26 L155,40 L155,50 Z" fill="white" fillOpacity="0.35"/>
        <circle cx="50" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="50" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
        <circle cx="145" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="145" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
      </svg>
    ),
  },
  {
    label: "Coupe",
    slug: "coupe",
    svg: (
      <svg viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M6,68 L6,52 L28,36 L60,26 L130,26 L168,40 L192,54 L192,68 Z" fill="currentColor"/>
        <path d="M32,52 L62,30 L125,30 L160,44 L160,52 Z" fill="white" fillOpacity="0.35"/>
        <circle cx="48" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="48" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
        <circle cx="158" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="158" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
      </svg>
    ),
  },
  {
    label: "Truck",
    slug: "truck",
    svg: (
      <svg viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M8,68 L8,36 L22,20 L50,18 L90,18 L96,28 L96,68 Z" fill="currentColor"/>
        <path d="M24,36 L36,20 L86,20 L90,28 L90,36 Z" fill="white" fillOpacity="0.35"/>
        <path d="M100,68 L100,54 L192,54 L192,68 Z" fill="currentColor"/>
        <line x1="100" y1="54" x2="100" y2="68" stroke="white" strokeWidth="2"/>
        <circle cx="40" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="40" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
        <circle cx="164" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="164" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
      </svg>
    ),
  },
  {
    label: "Convertible",
    slug: "convertible",
    svg: (
      <svg viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M10,68 L10,52 L24,44 L48,40 L148,40 L172,46 L190,54 L190,68 Z" fill="currentColor"/>
        <path d="M30,44 L48,40 L112,40 L122,46" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.5"/>
        <path d="M26,52 L42,44 L110,44 L120,48 L120,52 Z" fill="white" fillOpacity="0.25"/>
        <circle cx="48" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="48" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
        <circle cx="155" cy="68" r="14" fill="white" fillOpacity="0.18"/>
        <circle cx="155" cy="68" r="9" fill="currentColor" stroke="white" strokeWidth="3"/>
      </svg>
    ),
  },
];

function BrowseByType() {
  const [, navigate] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: dbCategories } = useQuery<DbCategory[]>({
    queryKey: ["categories-public"],
    queryFn: async () => {
      const res = await fetch("/api/listings/categories");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const hasDbCategories = Array.isArray(dbCategories) && dbCategories.length > 0;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 200 : -200, behavior: "smooth" });
  };

  return (
    <section className="py-14 container mx-auto px-4">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Browse by Type</h2>
          <p className="text-gray-500 text-sm mt-1">Find the perfect car for your lifestyle</p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:bg-green-50 hover:border-primary/40 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:bg-green-50 hover:border-primary/40 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar flex gap-4 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
      >
        {hasDbCategories
          ? dbCategories.map((cat) => (
              <motion.button
                key={cat.id}
                onClick={() => navigate(`/cars?carType=${encodeURIComponent(cat.name)}`)}
                whileHover={{ boxShadow: "0 12px 32px rgba(20,83,45,0.18)" }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="group relative flex-shrink-0 snap-start overflow-hidden rounded-[5px] border border-green-100 bg-green-50 cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                style={{ width: "clamp(130px, 16vw, 180px)" }}
              >
                <div className="w-full aspect-[4/3] flex items-center justify-center overflow-hidden rounded-[5px] p-0">
                  {cat.imageUrl ? (
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary">
                      <Car className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-center text-xs font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100">
                  {cat.name}
                </span>
              </motion.button>
            ))
          : CAR_TYPES.map((type) => (
              <motion.button
                key={type.slug}
                onClick={() => navigate(`/cars?carType=${type.label}`)}
                whileHover={{ boxShadow: "0 12px 32px rgba(20,83,45,0.18)" }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="group relative flex-shrink-0 snap-start overflow-hidden rounded-[5px] border border-green-100 bg-green-50 cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                style={{ width: "clamp(130px, 16vw, 180px)" }}
              >
                <div className="w-full aspect-[4/3] text-primary overflow-hidden rounded-[5px] p-0">
                  {type.svg}
                </div>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-center text-xs font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100">
                  {type.label}
                </span>
              </motion.button>
            ))}
      </div>
    </section>
  );
}

function CarBrowseSection() {
  const { data: featured } = useGetFeaturedCars();
  const { data: recent } = useGetRecentCars();

  const isLoading = !featured && !recent;

  return (
    <section className="py-14 container mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Explore All Vehicles</h2>
          <p className="text-muted-foreground text-sm mt-1">Handpicked listings from trusted sellers nationwide</p>
        </div>
        <Link href="/cars">
          <Button variant="outline" size="sm" className="hidden md:flex items-center gap-1">
            View All <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="recent">
        <TabsList className="mb-6">
          <TabsTrigger value="recent">Recent Cars</TabsTrigger>
          <TabsTrigger value="featured">Featured Cars</TabsTrigger>
        </TabsList>

        <TabsContent value="recent">
          {!recent ? (
            <div className="no-scrollbar flex gap-5 overflow-x-auto pb-2 md:overflow-visible md:grid md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[78vw] sm:w-[45vw] md:w-auto rounded-xl border border-border overflow-hidden">
                  <Skeleton className="aspect-[16/10] w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No cars listed yet</p>
              <p className="text-sm mt-1">Be the first to list your car!</p>
            </div>
          ) : (
            <div className="no-scrollbar flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory md:overflow-visible md:grid md:grid-cols-2 lg:grid-cols-3 md:snap-none">
              {recent.slice(0, 8).map((car) => (
                <div key={car.id} className="flex-shrink-0 snap-start w-[78vw] sm:w-[45vw] md:w-auto">
                  <CarCard car={car} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="featured">
          {!featured ? (
            <div className="no-scrollbar flex gap-5 overflow-x-auto pb-2 md:overflow-visible md:grid md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[78vw] sm:w-[45vw] md:w-auto rounded-xl border border-border overflow-hidden">
                  <Skeleton className="aspect-[16/10] w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : featured.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No featured cars yet</p>
            </div>
          ) : (
            <div className="no-scrollbar flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory md:overflow-visible md:grid md:grid-cols-2 lg:grid-cols-3 md:snap-none">
              {featured.map((car) => (
                <div key={car.id} className="flex-shrink-0 snap-start w-[78vw] sm:w-[45vw] md:w-auto">
                  <CarCard car={car} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="text-center mt-8">
        <Link href="/cars">
          <Button variant="outline" className="px-8">
            View All Cars <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </section>
  );
}

function CtaBanners() {
  return (
    <section className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative rounded-2xl overflow-hidden min-h-[220px] flex items-end p-6">
          <img
            src="https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=700&q=80"
            alt="Sell your car"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/60 to-transparent" />
          <div className="relative">
            <h3 className="text-xl font-bold text-white mb-1">Looking to Sell a Car?</h3>
            <p className="text-white/80 text-sm mb-3">Get the best value for your vehicle</p>
            <Link href="/sell">
              <Button size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold">
                Get Started <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden min-h-[220px] flex items-end p-6">
          <img
            src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=700&q=80"
            alt="Buy a car"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/60 to-transparent" />
          <div className="relative">
            <h3 className="text-xl font-bold text-white mb-1">Want to Buy a Car?</h3>
            <p className="text-white/80 text-sm mb-3">Find your perfect match today</p>
            <Link href="/cars">
              <Button size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold">
                Browse Cars <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyUsSection() {
  const features = [
    {
      icon: Shield,
      title: "Trusted By Thousands",
      description: "Rated 4.9/5 by thousands of satisfied customers across Nigeria.",
    },
    {
      icon: DollarSign,
      title: "Special Financing",
      description: "Our stress-free finance department can find financial solutions to save you money.",
    },
    {
      icon: Wrench,
      title: "Expert Mechanics",
      description: "Professional service and maintenance from certified automotive technicians.",
    },
    {
      icon: CheckCircle,
      title: "Transparent Pricing",
      description: "No hidden fees. What you see is what you pay — guaranteed fair pricing.",
    },
  ];

  return (
    <section className="py-14 bg-muted/40 border-y border-border">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-black text-gray-900">Why Choose Us?</h2>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
            We provide the best car buying and selling experience with our comprehensive services
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -4 }}
              className="bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-all"
            >
              <div className="bg-primary/10 rounded-xl p-3 w-fit mb-4">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-bold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const fallbackTestimonials = [
    {
      name: "Apeli Benibo",
      quote: "Selling my car was hassle-free. The platform's verification process ensured I only dealt with serious buyers.",
      title: "Reliable and Trustworthy.",
      verified: true,
    },
    {
      name: "Oluwadamilola Oyedepo",
      quote: "I was worried about online scams, but this platform's secure payment system gave me peace of mind.",
      title: "Safe and Secure Transactions.",
      verified: true,
    },
    {
      name: "Uma Chukwu",
      quote: "I found the perfect car within days using this platform. The verified listings gave me confidence, and the financing options made everything so easy!",
      title: "A Seamless Experience!",
      verified: true,
    },
  ];

  const { data: liveData } = useQuery<{
    items: Array<{
      id: number;
      rating: number;
      title: string;
      comment: string;
      user: { id: number; name: string; role: string };
    }>;
  }>({
    queryKey: ["landing-app-reviews"],
    queryFn: async () => {
      const res = await fetch("/api/app-reviews?limit=9");
      if (!res.ok) return { items: [] };
      return res.json();
    },
    staleTime: 60_000,
  });

  const testimonials =
    (liveData?.items?.length ?? 0) > 0
      ? liveData!.items.map((item) => ({
          name: item.user.name,
          quote: item.comment,
          title: item.title,
          verified: true,
          rating: item.rating,
          role: item.user.role,
        }))
      : fallbackTestimonials.map((item) => ({
          ...item,
          rating: 5,
          role: "buyer",
        }));

  return (
    <section className="py-14 container mx-auto px-4">
      <div className="text-center mb-12">
        <h2 className="text-2xl font-black text-gray-900">What Customers Say</h2>
        <p className="text-muted-foreground mt-2">Real experiences from real Nigerian car buyers and sellers</p>
      </div>
      <div className="no-scrollbar flex gap-6 overflow-x-auto pb-2 snap-x snap-mandatory md:overflow-visible md:grid md:grid-cols-3 md:snap-none">
        {testimonials.map((t) => (
          <motion.div
            key={t.name}
            whileHover={{ y: -4 }}
            className="flex-shrink-0 snap-start w-[85vw] sm:w-[70vw] md:w-auto bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-1 text-secondary mb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${i < (t.rating ?? 5) ? "fill-current" : "text-gray-300"}`}
                />
              ))}
            </div>
            <p className="font-semibold text-foreground mb-2">"{t.title}"</p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">"{t.quote}"</p>
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 rounded-full w-9 h-9 flex items-center justify-center font-bold text-primary text-sm">
                {t.name[0]}
              </div>
              <div>
                <div className="font-medium text-sm text-foreground">{t.name}</div>
                {t.verified && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Verified {String(t.role ?? "buyer").replace(/^\w/, (s) => s.toUpperCase())}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function AppDownloadBanner() {
  return (
    <section className="container mx-auto px-4 py-10">
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col md:flex-row items-center"
        style={{ background: "#eef0f3", minHeight: 220 }}
      >
        {/* Left content */}
        <div className="relative z-10 flex-1 px-8 py-10 md:py-12">
          <h2
            className="font-black text-gray-900 leading-tight mb-3"
            style={{ fontSize: "clamp(1.4rem, 3.5vw, 2rem)" }}
          >
            <span className="bg-gray-300/70 px-1 rounded">Shop</span> New &amp; Used Cars, On The
            <br />
            Lot Or On The Go
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-sm">
            Download our mobile app and browse thousands of cars at your fingertips.
            Get instant notifications for new listings and price drops.
          </p>
          <div className="flex flex-wrap gap-3">
            {/* App Store button */}
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2.5 hover:bg-gray-700 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div>
                <div className="text-[10px] leading-none opacity-75">Download on the</div>
                <div className="text-sm font-bold leading-tight">App Store</div>
              </div>
            </a>
            {/* Google Play button */}
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2.5 hover:bg-gray-700 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.18 23.76c.3.17.64.24.99.2l12.6-7.28-2.7-2.7-10.89 9.78zM.54 1.04C.2 1.4 0 1.96 0 2.68v18.64c0 .72.2 1.28.55 1.64l.09.08 10.44-10.44v-.24L.63.96l-.09.08zM20.4 10.28l-2.98-1.72-3.02 3.02 3.02 3.02 3-1.73c.85-.49.85-1.29-.02-1.59zM3.18.24l12.6 7.28-2.7 2.7L3.18.24z"/>
              </svg>
              <div>
                <div className="text-[10px] leading-none opacity-75">GET IT ON</div>
                <div className="text-sm font-bold leading-tight">Google Play</div>
              </div>
            </a>
          </div>
        </div>

        {/* Right image */}
        <div className="relative flex-shrink-0 flex items-end justify-center md:justify-end w-full md:w-auto"
          style={{ maxWidth: 320, minHeight: 220 }}>
          <img
            src={`${import.meta.env.BASE_URL}app-download-hand.png`}
            alt="HUCE Autos mobile app"
            className="object-contain object-bottom h-64 md:h-72 w-auto"
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>
    </section>
  );
}

const NEWS_ARTICLES = [
  {
    id: 1,
    category: "Industry News",
    title: "Why Tesla May Hit 200 USD (TSLA Stock Valuation)",
    excerpt: "Comprehensive analysis of Tesla's stock performance and future potential in the automotive industry...",
    date: "December 10, 2024",
    author: "God's Autos",
    image: "https://images.unsplash.com/photo-1617469767054-c3f90ceb86ce?w=600&q=80",
  },
  {
    id: 2,
    category: "Technology",
    title: "The Future of Electric Vehicles in Nigeria",
    excerpt: "Exploring the growing market for electric vehicles and charging infrastructure development...",
    date: "December 8, 2024",
    author: "Huce Autos",
    image: "https://images.unsplash.com/photo-1593941707882-a5bba13938c0?w=600&q=80",
  },
  {
    id: 3,
    category: "Car Reviews",
    title: "Top 10 Most Reliable Cars of 2024",
    excerpt: "Our comprehensive guide to the most dependable vehicles you can buy this year...",
    date: "December 5, 2024",
    author: "Huce Autos",
    image: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80",
  },
  {
    id: 4,
    category: "Market Trends",
    title: "Used Car Prices in Nigeria: What to Expect in 2025",
    excerpt: "A deep dive into the Nigerian used car market and price trends heading into the new year...",
    date: "December 2, 2024",
    author: "Huce Autos",
    image: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&q=80",
  },
  {
    id: 5,
    category: "Tips & Advice",
    title: "How to Inspect a Used Car Before Buying",
    excerpt: "Essential checklist and expert tips to help you avoid common pitfalls when purchasing a second-hand vehicle...",
    date: "November 28, 2024",
    author: "Huce Autos",
    image: "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=600&q=80",
  },
];

function LatestNewsSection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: apiArticles } = useGetNewsList({ limit: 10 });

  const articles = apiArticles && apiArticles.length > 0
    ? apiArticles.map((a) => ({
        id: a.id,
        category: "News",
        title: a.title,
        excerpt: a.excerpt ?? "",
        date: a.publishedAt
          ? new Date(a.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
          : new Date(a.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        author: a.authorName ?? "Huce Autos",
        image: a.imageUrl ?? "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80",
        slug: a.slug,
      }))
    : NEWS_ARTICLES;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 320 : -320, behavior: "smooth" });
  };

  return (
    <section className="py-14 container mx-auto px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Latest News</h2>
          <p className="text-gray-400 text-sm mt-1">Stay updated with the latest automotive news and insights</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => scroll("left")}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-primary text-white shadow hover:bg-primary/80 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-green-50 hover:border-primary/40 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable cards */}
      <div
        ref={scrollRef}
        className="no-scrollbar flex gap-5 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
      >
        {articles.map((article) => (
          <NewsCard
            key={article.id}
            className="flex-shrink-0 snap-start w-[clamp(260px,30vw,320px)]"
            href={"slug" in article && article.slug ? `/news/${article.slug}` : "/news"}
            title={article.title}
            excerpt={article.excerpt}
            imageUrl={article.image}
            author={article.author}
            date={article.date}
            category={article.category}
          />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout>
      <HeroSection />
      <section className="container mx-auto px-4 pt-6">
        <AdSlot basePlacement="landing_hero" imageClassName="h-[100px] md:h-[90px] lg:h-[120px]" />
      </section>
      <BrowseByType />
      <CarBrowseSection />
      <section className="container mx-auto px-4 py-2">
        <AdSlot basePlacement="landing_mid" imageClassName="h-[120px] md:h-[100px] lg:h-[140px]" />
      </section>
      <CtaBanners />
      <WhyUsSection />
      <TestimonialsSection />
      <AppDownloadBanner />
      <LatestNewsSection />
    </Layout>
  );
}
