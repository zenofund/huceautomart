import { useEffect, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_MAP: Record<NonNullable<AppDialogProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-3xl",
};

export function AppDialog({
  open,
  onClose,
  title,
  subtitle,
  onBack,
  children,
  footer,
  size = "md",
}: AppDialogProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      data-testid="app-dialog"
    >
      <div
        className={cn(
          "w-full rounded-t-2xl sm:rounded-2xl bg-white shadow-xl max-h-[85dvh] sm:max-h-[90vh] flex flex-col",
          SIZE_MAP[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
          {onBack ? (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
              data-testid="button-dialog-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
            data-testid="button-dialog-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Title */}
        <div className="px-5 sm:px-6 pt-3">
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
        <div className="px-5 sm:px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-6 pt-2">{footer}</div>
        )}
      </div>
    </div>
  );
}
