import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Car, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Layout } from "@/components/layout";
import { useListCars, useGetCar, getGetCarQueryKey, getListCarsQueryKey } from "@workspace/api-client-react";
import { formatNaira, formatMileage } from "@/lib/format";

const PLACEHOLDER = "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80";

function CarSelectPanel({ label, carId, onSelect, cars }: {
  label: string;
  carId: number | null;
  onSelect: (id: number | null) => void;
  cars: { id: number; make: string; model: string; year: number }[];
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{label}</div>
      <Select
        value={carId?.toString() || "none"}
        onValueChange={(v) => onSelect(v === "none" ? null : parseInt(v))}
      >
        <SelectTrigger className="h-11" data-testid={`select-compare-${label.toLowerCase().replace(" ", "-")}`}>
          <SelectValue placeholder="Select a car" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Select a car...</SelectItem>
          {cars.map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.year} {c.make} {c.model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CarColumn({ carId, highlight }: { carId: number | null; highlight?: string }) {
  const car = useGetCar(carId!, {
    query: { enabled: !!carId, queryKey: getGetCarQueryKey(carId!) },
  });

  if (!carId) {
    return (
      <div className="flex-1 min-w-0 border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
        <Car className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Select a car to compare</p>
      </div>
    );
  }

  if (car.isLoading) {
    return (
      <div className="flex-1 min-w-0 space-y-4">
        <Skeleton className="aspect-[16/10] rounded-xl w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  const carData = car.data;
  if (!carData) return null;

  const img = carData.images?.[0] || PLACEHOLDER;

  return (
    <div className="flex-1 min-w-0">
      <div className="rounded-xl overflow-hidden border border-border aspect-[16/10] mb-4">
        <img
          src={img}
          alt={`${carData.year} ${carData.make} ${carData.model}`}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
        />
      </div>
      <h3 className="font-bold text-lg text-foreground">
        {carData.year} {carData.make} {carData.model}
      </h3>
      {carData.color && <p className="text-sm text-muted-foreground">{carData.color}</p>}
    </div>
  );
}

function CompareRow({ label, aValue, bValue, format }: {
  label: string;
  aValue: string | number | undefined;
  bValue: string | number | undefined;
  format?: (v: any) => string;
}) {
  const fmt = format || ((v: any) => String(v ?? "—"));
  const aStr = aValue !== undefined ? fmt(aValue) : "—";
  const bStr = bValue !== undefined ? fmt(bValue) : "—";

  const aNum = typeof aValue === "number" ? aValue : null;
  const bNum = typeof bValue === "number" ? bValue : null;
  const aBetter = aNum !== null && bNum !== null ? aNum <= bNum : false;
  const bBetter = aNum !== null && bNum !== null ? bNum <= aNum : false;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 px-4 text-sm font-medium text-muted-foreground w-1/4">{label}</td>
      <td className={`py-3 px-4 text-sm text-center font-semibold ${aBetter ? "text-green-600" : "text-foreground"}`}>
        {aStr}
        {aBetter && <Check className="h-3 w-3 inline ml-1 text-green-600" />}
      </td>
      <td className={`py-3 px-4 text-sm text-center font-semibold ${bBetter ? "text-green-600" : "text-foreground"}`}>
        {bStr}
        {bBetter && <Check className="h-3 w-3 inline ml-1 text-green-600" />}
      </td>
    </tr>
  );
}

export default function ComparePage() {
  const [carAId, setCarAId] = useState<number | null>(null);
  const [carBId, setCarBId] = useState<number | null>(null);

  const { data: allCarsData } = useListCars({ limit: 100 }, {
    query: { queryKey: getListCarsQueryKey({ limit: 100 }) },
  });

  const { data: carA } = useGetCar(carAId!, { query: { enabled: !!carAId, queryKey: getGetCarQueryKey(carAId!) } });
  const { data: carB } = useGetCar(carBId!, { query: { enabled: !!carBId, queryKey: getGetCarQueryKey(carBId!) } });

  const carList = allCarsData?.data || [];

  const canCompare = !!carAId && !!carBId && !!carA && !!carB;

  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
            <ArrowLeftRight className="h-7 w-7 text-secondary" />
            Compare Cars
          </h1>
          <p className="text-primary-foreground/70 text-sm">
            Select two cars to see a detailed side-by-side comparison
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <CarSelectPanel
              label="Car Option A"
              carId={carAId}
              onSelect={setCarAId}
              cars={carList}
            />
            <div className="flex-shrink-0 bg-primary/10 rounded-full p-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
            </div>
            <CarSelectPanel
              label="Car Option B"
              carId={carBId}
              onSelect={setCarBId}
              cars={carList}
            />
          </div>
        </div>

        <div className="flex gap-6 mb-8">
          <CarColumn carId={carAId} />
          <div className="flex-shrink-0 w-px bg-border hidden sm:block" />
          <CarColumn carId={carBId} />
        </div>

        {canCompare ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            <div className="bg-primary text-primary-foreground px-4 py-3">
              <h2 className="font-bold text-sm">Detailed Comparison</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="py-3 px-4 text-xs font-semibold text-muted-foreground text-left w-1/4">Specification</th>
                  <th className="py-3 px-4 text-xs font-semibold text-center">
                    {carA!.year} {carA!.make} {carA!.model}
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-center">
                    {carB!.year} {carB!.make} {carB!.model}
                  </th>
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Price" aValue={carA!.price} bValue={carB!.price} format={formatNaira} />
                <CompareRow label="Year" aValue={carA!.year} bValue={carB!.year} />
                <CompareRow label="Mileage" aValue={carA!.mileage} bValue={carB!.mileage} format={formatMileage} />
                <CompareRow label="Condition" aValue={carA!.condition} bValue={carB!.condition} />
                <CompareRow label="Color" aValue={carA!.color || "—"} bValue={carB!.color || "—"} />
                <CompareRow label="Location" aValue={carA!.location} bValue={carB!.location} />
                <CompareRow label="Seller" aValue={carA!.sellerName} bValue={carB!.sellerName} />
              </tbody>
            </table>
          </motion.div>
        ) : !carAId && !carBId ? null : (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-sm">Select both cars to see the comparison</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
