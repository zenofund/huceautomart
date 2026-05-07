import { cn } from "@/lib/utils";

export interface AdminLocalTabItem {
  key: string;
  label: string;
}

interface AdminLocalTabsProps {
  tabs: AdminLocalTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
  getButtonTestId?: (key: string) => string | undefined;
}

export function AdminLocalTabs({
  tabs,
  activeKey,
  onChange,
  className,
  getButtonTestId,
}: AdminLocalTabsProps) {
  return (
    <div className={cn("bg-white border border-gray-200 rounded-2xl shadow-sm p-1.5 mb-4", className)}>
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              data-testid={getButtonTestId?.(tab.key)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors",
                active
                  ? "bg-[#046C4E] text-white shadow-sm"
                  : "text-[#667085] hover:text-[#475467]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
