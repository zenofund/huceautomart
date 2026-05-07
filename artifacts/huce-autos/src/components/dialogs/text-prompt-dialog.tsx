import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

interface TextPromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

export function TextPromptDialog({
  open,
  title,
  description,
  placeholder,
  confirmLabel = "Confirm",
  initialValue = "",
  onClose,
  onConfirm,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">{description}</p>
        ) : null}

        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="mt-5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => onConfirm(value)}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-[#F5C0AE] px-4 py-3 text-sm font-semibold text-white hover:bg-[#EFB099] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
