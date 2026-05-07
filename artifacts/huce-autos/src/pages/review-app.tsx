import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Star } from "lucide-react";
import { DashboardLayout, type DashboardUser } from "@/components/dashboard-layout";
import { useAuth } from "@/context/auth-context";
import { useDashboardNav } from "@/lib/dashboard-nav";
import { useToast } from "@/hooks/use-toast";

interface MyReviewItem {
  id: number;
  rating: number;
  title: string;
  comment: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
}

export default function ReviewAppPage() {
  const { user: authUser, logout } = useAuth();
  const { navItems } = useDashboardNav();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  const user: DashboardUser = {
    name: authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "",
    email: authUser?.email ?? "",
    verified: authUser?.emailVerified ?? false,
    avatarUrl: authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const meQuery = useQuery<{ items: MyReviewItem[] }>({
    queryKey: ["app-reviews-me"],
    queryFn: async () => {
      const res = await fetch("/api/app-reviews/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load your app reviews");
      return res.json();
    },
  });

  const hasPending = useMemo(
    () => (meQuery.data?.items ?? []).some((item) => item.status === "pending"),
    [meQuery.data],
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/app-reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, title, comment }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to submit review");
      return payload;
    },
    onSuccess: () => {
      toast({
        title: "Review submitted",
        description: "Your app review is pending admin approval.",
      });
      setRating(5);
      setTitle("");
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["app-reviews-me"] });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to submit review",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const statusTone: Record<MyReviewItem["status"], string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <DashboardLayout user={user} navItems={navItems} title="Review App" onLogout={handleLogout}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Review App</h1>
          <p className="text-sm text-gray-500 mt-1">
            Share your platform experience. Reviews are published after admin approval.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Submit Review</h2>
          {hasPending && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              You already have one pending review. You can submit another after it is approved or rejected.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Rating</label>
              <div className="flex items-center gap-2">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const value = idx + 1;
                  const active = value <= rating;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className="rounded-md p-1 hover:bg-gray-50"
                      aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
                    >
                      <Star className={`h-6 w-6 ${active ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Short title for your review"
                className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={160}
                placeholder="Tell us your experience using the app (max 160 characters)"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <div className="text-right text-xs text-gray-400 mt-1">
                {comment.length}/160 characters
              </div>
            </div>

            <button
              type="submit"
              disabled={
                hasPending ||
                submitMutation.isPending ||
                title.trim().length < 3 ||
                comment.trim().length < 10
              }
              className="h-11 rounded-xl bg-[#046C4E] px-6 text-sm font-semibold text-white hover:bg-[#045c42] disabled:opacity-50"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Review"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">My Review History</h2>
          {meQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading your reviews...</p>
          ) : (meQuery.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No reviews submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {meQuery.data!.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusTone[item.status]}`}>
                      {item.status}
                    </span>
                    <span className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`h-4 w-4 ${idx < item.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
                      />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{item.comment}</p>
                  {item.adminNote && (
                    <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                      Admin note: {item.adminNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
