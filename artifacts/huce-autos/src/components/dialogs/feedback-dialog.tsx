import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (rating: number, comment: string) => void;
}

export function FeedbackDialog({ open, onClose, onSubmit }: FeedbackDialogProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const handleSubmit = () => {
    if (!rating) return;
    onSubmit?.(rating, comment);
    setRating(null);
    setComment("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-lg w-full rounded-2xl overflow-hidden" hideCloseButton>
        <div className="p-6 sm:p-8">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-primary transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>

          <DialogTitle className="text-lg font-bold text-gray-900 mb-1">
            We Value Your Feedback!
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 leading-relaxed mb-5">
            Share your feedback on your recent car purchase to help us improve
            and ensure an even smoother experience for others.
          </DialogDescription>

          {/* Rating row */}
          <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={cn(
                  "rounded-xl border py-3 text-sm font-bold transition-colors",
                  rating === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 bg-white text-gray-700 hover:border-primary/50",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-gray-400 mb-6 -mt-3 px-1">
            <span>Very Dissatisfied</span>
            <span>Very Satisfied</span>
          </div>

          {/* Comment */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-gray-800 mb-2">
              Tell Us About Your Experience
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Type Here"
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!rating}
            className={cn(
              "w-full rounded-full py-3.5 text-sm font-semibold text-white transition-colors",
              rating ? "bg-primary hover:bg-primary/90" : "bg-primary/40 cursor-not-allowed",
            )}
          >
            Proceed
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
