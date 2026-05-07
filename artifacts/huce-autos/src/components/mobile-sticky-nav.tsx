import type { ComponentType } from "react";
import { Link, useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MobileStickyItem {
  href: string;
  label: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  locked?: boolean;
  lockHint?: string;
}

interface MobileStickyNavProps {
  items: MobileStickyItem[];
  onLockedClick?: (item: MobileStickyItem) => void;
}

export function MobileStickyNav({ items, onLockedClick }: MobileStickyNavProps) {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/dashboard" || href === "/seller" || href === "/inspector" || href === "/admin") {
      return location === href;
    }
    return location === href || (href !== "/" && location.startsWith(`${href}/`));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 lg:hidden">
      <div className="mx-auto flex w-full max-w-xl items-end justify-around px-2 pt-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = !item.locked && isActive(item.href);
          const content = (
            <>
              <Icon
                className={cn(
                  "h-6 w-6 mb-1",
                  active ? "text-primary" : "text-gray-400",
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-semibold leading-tight",
                  active ? "text-primary" : "text-gray-500",
                )}
              >
                {item.label}
              </span>
            </>
          );

          return item.locked ? (
            <button
              key={item.href}
              type="button"
              className="flex min-w-0 flex-1 flex-col items-center pb-2"
              onClick={() => onLockedClick?.(item)}
            >
              {content}
            </button>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-0 flex-1 flex-col items-center pb-2"
            >
              {content}
            </Link>
          );
        })}
      </div>
      <div className="flex justify-center pb-[max(env(safe-area-inset-bottom),8px)] pt-1">
        <span className="h-1.5 w-28 rounded-full bg-black/85" />
      </div>
    </div>
  );
}
