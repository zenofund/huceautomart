import {
  Car,
  CheckCircle2,
  Gauge,
  Fuel,
  Calendar,
  Settings2,
  Compass,
  DoorOpen,
  Palette,
  Hash,
  type LucideProps,
} from "lucide-react";

// Thin re-exports so the detail page reads cleanly and we can swap icon set
// in one place without touching the page layout.
export const CarTypeIcon = (p: LucideProps) => <Car {...p} />;
export const ConditionIcon = (p: LucideProps) => <CheckCircle2 {...p} />;
export const GaugeIcon = (p: LucideProps) => <Gauge {...p} />;
export const FuelIcon = (p: LucideProps) => <Fuel {...p} />;
export const CalendarIcon = (p: LucideProps) => <Calendar {...p} />;
export const CogIcon = (p: LucideProps) => <Settings2 {...p} />;
export const CompassIcon = (p: LucideProps) => <Compass {...p} />;
export const DoorIcon = (p: LucideProps) => <DoorOpen {...p} />;
export const PaintIcon = (p: LucideProps) => <Palette {...p} />;
export const VinIcon = (p: LucideProps) => <Hash {...p} />;
