import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, X, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Layout } from "@/components/layout";
import { CarCard } from "@/components/car-card";
import { useListCars, getListCarsQueryKey } from "@workspace/api-client-react";
import { formatNaira } from "@/lib/format";

const MAKES = ["Toyota", "Honda", "Mercedes-Benz", "BMW", "Lexus", "Audi", "Ford", "Hyundai", "Kia", "Volkswagen", "Porsche", "Range Rover", "Chevrolet"];
const YEARS = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
const LOCATIONS = ["Lagos", "Abuja", "Port Harcourt"];
const CAR_TYPE_OPTIONS = ["Sedan", "SUV", "Hatchback", "Coupe", "Truck", "Convertible", "Van", "Pickup"];

function parseSearchParams(search: string) {
  const params = new URLSearchParams(search);
  return {
    make: params.get("make") || "",
    model: params.get("model") || "",
    year: params.get("year") || "",
    location: params.get("location") || "",
    condition: params.get("condition") || "",
    carType: params.get("carType") || params.get("bodyType") || "",
    sellerId: params.get("sellerId") || "",
    sellerName: params.get("sellerName") || "",
    page: parseInt(params.get("page") || "1"),
  };
}

export default function CarsPage() {
  const [routeLocation, navigate] = useLocation();
  const [windowSearch, setWindowSearch] = useState(window.location.search);

  const parsed = parseSearchParams(windowSearch);
  const [make, setMake] = useState(parsed.make);
  const [model, setModel] = useState(parsed.model);
  const [year, setYear] = useState(parsed.year);
  const [location, setLocation] = useState(parsed.location);
  const [condition, setCondition] = useState(parsed.condition);
  const [carType, setCarType] = useState(parsed.carType);
  const [sellerId, setSellerId] = useState(parsed.sellerId);
  const [sellerName, setSellerName] = useState(parsed.sellerName);
  const [maxPrice, setMaxPrice] = useState(120);
  const [page, setPage] = useState(parsed.page);
  const [filterOpen, setFilterOpen] = useState(false);
  const [desktopFilterOpen, setDesktopFilterOpen] = useState(false);

  useEffect(() => {
    const handleLocationChange = () => setWindowSearch(window.location.search);
    const handlePop = () => setWindowSearch(window.location.search);
    window.addEventListener("locationchange", handleLocationChange);
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("locationchange", handleLocationChange);
      window.removeEventListener("popstate", handlePop);
    };
  }, []);

  useEffect(() => {
    setWindowSearch(window.location.search);
  }, [routeLocation]);

  useEffect(() => {
    const next = parseSearchParams(windowSearch);
    setLocation(next.location);
    setPage(next.page);
  }, [windowSearch]);

  const params = {
    make: make || undefined,
    model: model || undefined,
    year: year ? parseInt(year) : undefined,
    location: location || undefined,
    condition: condition as "new" | "used" | undefined || undefined,
    carType: carType || undefined,
    maxPrice: maxPrice < 120 ? maxPrice * 1000000 : undefined,
    sellerId: sellerId ? parseInt(sellerId) : undefined,
    page,
    limit: 12,
  };

  const { data } = useListCars(params, {
    query: { queryKey: getListCarsQueryKey(params) },
  });

  const applyFilters = () => {
    setPage(1);
    setFilterOpen(false);
  };

  const clearFilter = (key: string) => {
    if (key === "make") setMake("");
    if (key === "model") setModel("");
    if (key === "year") setYear("");
    if (key === "location") setLocation("");
    if (key === "condition") setCondition("");
    if (key === "carType") setCarType("");
    if (key === "seller") { setSellerId(""); setSellerName(""); }
  };

  const activeFilters = [
    sellerId && { key: "seller", label: `Seller: ${sellerName || "Selected"}` },
    make && { key: "make", label: make },
    model && { key: "model", label: model },
    year && { key: "year", label: year },
    condition && { key: "condition", label: condition === "new" ? "New Cars" : condition === "certified_pre_owned" ? "Certified Pre-Owned" : "Used Cars" },
    carType && { key: "carType", label: carType },
  ].filter(Boolean) as { key: string; label: string }[];

  const FilterPanel = () => (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-semibold mb-2 block">Condition</Label>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "", label: "All" },
            { value: "new", label: "New" },
            { value: "used", label: "Used" },
            { value: "certified_pre_owned", label: "CPO" },
          ].map((c) => (
            <button
              key={c.value}
              onClick={() => setCondition(c.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                condition === c.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-semibold mb-2 block">Car Type</Label>
        <Select value={carType || "any"} onValueChange={(v) => setCarType(v === "any" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Any Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Type</SelectItem>
            {CAR_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-semibold mb-2 block">Make</Label>
        <Select value={make || "any"} onValueChange={(v) => setMake(v === "any" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Any Make" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Make</SelectItem>
            {MAKES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-semibold mb-2 block">Year</Label>
        <Select value={year || "any"} onValueChange={(v) => setYear(v === "any" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Any Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Year</SelectItem>
            {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-semibold mb-2 block">Location</Label>
        <Select value={location || "any"} onValueChange={(v) => setLocation(v === "any" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Any Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Location</SelectItem>
            {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Max Price: {maxPrice < 120 ? formatNaira(maxPrice * 1000000) : "Any"}
        </Label>
        <Slider
          min={5}
          max={120}
          step={5}
          value={[maxPrice]}
          onValueChange={([v]) => setMaxPrice(v)}
          className="mt-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatNaira(5000000)}</span>
          <span>Any</span>
        </div>
      </div>

      <Button onClick={applyFilters} className="w-full bg-primary text-primary-foreground">
        Apply Filters
      </Button>
    </div>
  );

  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Browse Cars</h1>
          <p className="text-primary-foreground/70 text-sm">Find your perfect vehicle from our verified listings</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="text-sm text-muted-foreground self-center">Active filters:</span>
            {activeFilters.map((f) => (
              <Badge key={f.key} variant="secondary" className="flex items-center gap-1 pr-1">
                {f.label}
                <button onClick={() => clearFilter(f.key)} className="hover:text-destructive ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-8">
          {/* Desktop sidebar — hidden by default, toggled by filter button */}
          {desktopFilterOpen && (
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <div className="bg-card border border-border rounded-xl p-5 sticky top-20">
                <h2 className="font-bold text-foreground mb-5 flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Filters
                </h2>
                <FilterPanel />
              </div>
            </aside>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm text-muted-foreground">
                {data ? (
                  <span><span className="font-semibold text-foreground">{data.total}</span> cars found</span>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
              </div>

              {/* Desktop: inline toggle button */}
              <Button
                variant="outline"
                size="sm"
                className="hidden lg:flex items-center gap-2"
                onClick={() => setDesktopFilterOpen((o) => !o)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters {activeFilters.length > 0 && `(${activeFilters.length})`}
              </Button>

              {/* Mobile/tablet: Sheet drawer */}
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters {activeFilters.length > 0 && `(${activeFilters.length})`}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <SheetHeader>
                    <SheetTitle>Filter Cars</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FilterPanel />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {!data ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border overflow-hidden">
                    <Skeleton className="aspect-[16/10] w-full" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data.data.length === 0 ? (
              <div className="text-center py-20">
                <Car className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="font-bold text-foreground mb-2">No cars found</h3>
                <p className="text-muted-foreground text-sm mb-4">Try adjusting your search filters</p>
                <Button variant="outline" onClick={() => { setMake(""); setModel(""); setYear(""); setLocation(""); setCondition(""); setCarType(""); setMaxPrice(120); setSellerId(""); setSellerName(""); }}>
                  Clear All Filters
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {data.data.map((car) => (
                    <CarCard key={car.id} car={car} />
                  ))}
                </div>

                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                      const pg = i + 1;
                      return (
                        <Button
                          key={pg}
                          variant={page === pg ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(pg)}
                          className={page === pg ? "bg-primary text-primary-foreground" : ""}
                        >
                          {pg}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                      disabled={page >= data.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
