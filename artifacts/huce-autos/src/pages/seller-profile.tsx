import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  BadgeCheck, Clock, Car, Star, ChevronLeft, ChevronRight, MessageCircle, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Layout } from "@/components/layout";
import { CarCard } from "@/components/car-card";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useGetSeller, useListCars } from "@workspace/api-client-react";

const PAGE_SIZE = 10;

function yearsOn(joinedAt: string): string {
  const years = new Date().getFullYear() - new Date(joinedAt).getFullYear();
  if (years < 1) return "Less than a year on Huce Autos";
  return `${years} Year${years !== 1 ? "s" : ""} on Huce Autos`;
}

function SellerProfileCard({ sellerId }: { sellerId: number }) {
  const { data: seller } = useGetSeller(sellerId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [chatStarting, setChatStarting] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviews, setReviews] = useState<
    Array<{
      id: number;
      rating: number;
      comment: string | null;
      createdAt: string;
      buyerName: string;
      buyerAvatarUrl: string | null;
      listingTitle: string | null;
    }>
  >([]);

  const requireBuyer = (): boolean => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to your buyer account to message sellers.",
      });
      return false;
    }
    if (user.role !== "buyer") {
      toast({
        title: "Buyer account required",
        description: "Only buyer accounts can start chats with sellers.",
      });
      return false;
    }
    return true;
  };

  const startChat = async () => {
    if (!seller) return;
    if (!requireBuyer()) return;
    if (user!.id === seller.id) {
      toast({ title: "This is your own seller profile." });
      return;
    }
    setChatStarting(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: seller.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to start chat");
      setLocation(`/dashboard/messages/${data.conversationId}`);
    } catch (err) {
      toast({
        title: "Could not start chat",
        description: err instanceof Error ? err.message : "Try again later.",
        variant: "destructive",
      });
    } finally {
      setChatStarting(false);
    }
  };

  const loadReviews = async () => {
    if (!seller) return;
    setLoadingReviews(true);
    try {
      const res = await fetch(`/api/sellers/${seller.id}/reviews?limit=20`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Failed to fetch reviews");
      }
      const payload = data as {
        total?: number;
        items?: Array<{
          id: number;
          rating: number;
          comment: string | null;
          createdAt: string;
          buyerName: string | null;
          buyerAvatarUrl: string | null;
          listingTitle: string | null;
        }>;
      };
      setReviewsTotal(Number(payload.total ?? 0));
      setReviews(
        (payload.items ?? []).map((r) => ({
          id: r.id,
          rating: Number(r.rating ?? 0),
          comment: r.comment ?? null,
          createdAt: r.createdAt,
          buyerName: (r.buyerName ?? "").trim() || "Buyer",
          buyerAvatarUrl: r.buyerAvatarUrl ?? null,
          listingTitle: r.listingTitle ?? null,
        })),
      );
    } catch (err) {
      toast({
        title: "Failed to load reviews",
        description: err instanceof Error ? err.message : "Try again later.",
        variant: "destructive",
      });
    } finally {
      setLoadingReviews(false);
    }
  };

  useEffect(() => {
    if (!seller) return;
    void loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller?.id]);

  if (!seller) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 h-full">
        <Skeleton className="h-3 w-16 mb-4" />
        <div className="flex items-start gap-4 mb-4">
          <Skeleton className="h-16 w-16 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <div className="flex gap-2 mb-4">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-36 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full mb-2" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card border border-border rounded-xl p-6 h-full flex flex-col"
    >
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-4">Sellers</p>

      <div className="flex items-start gap-4 mb-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            {seller.avatarUrl && <AvatarImage src={seller.avatarUrl} alt={seller.name} />}
            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black">
              {seller.name?.[0]?.toUpperCase() ?? "S"}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
              seller.isOnline ? "bg-green-500" : "bg-gray-300"
            }`}
            title={seller.isOnline ? "Online" : "Offline"}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-foreground text-base leading-snug">
            {seller.name}
            {seller.location ? ` (Location: ${seller.location})` : ""}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{yearsOn(seller.joinedAt)}</p>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <Car className="h-3.5 w-3.5 text-secondary" />
            {seller.totalListings} Cars Available
          </p>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-5">
        {seller.verified && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-border rounded-full px-3 py-1 text-foreground">
            <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />
            Verified ID
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-border rounded-full px-3 py-1 text-foreground">
          <Clock className="h-3.5 w-3.5 text-green-500" />
          Quick Reply in 2 mins
        </span>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-2 mt-auto">
        <Button
          className="w-full bg-primary text-primary-foreground font-semibold gap-2 h-10"
          onClick={() => void startChat()}
          disabled={chatStarting}
        >
          <MessageCircle className="h-4 w-4" />
          {chatStarting ? "Opening..." : "Message Seller"}
        </Button>
        <Button
          variant="outline"
          className="w-full font-semibold gap-2 h-10"
          onClick={() => {
            setReviewsOpen(true);
            if (reviews.length === 0) void loadReviews();
          }}
        >
          <Star className="h-4 w-4 text-secondary fill-secondary" />
          View Review ({reviewsTotal})
        </Button>
      </div>

      <Dialog open={reviewsOpen} onOpenChange={setReviewsOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Seller Reviews ({reviewsTotal})</DialogTitle>
          </DialogHeader>
          {loadingReviews ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No reviews yet for this seller.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto space-y-3 py-1">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-8 w-8">
                        {r.buyerAvatarUrl ? <AvatarImage src={r.buyerAvatarUrl} alt={r.buyerName} /> : null}
                        <AvatarFallback className="text-xs">{r.buyerName[0]?.toUpperCase() ?? "B"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.buyerName}</p>
                        <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${i < Math.round(r.rating) ? "fill-current" : "opacity-30"}`}
                        />
                      ))}
                    </div>
                  </div>
                  {r.listingTitle ? (
                    <p className="text-xs text-muted-foreground mt-2">Listing: {r.listingTitle}</p>
                  ) : null}
                  <p className="text-sm text-foreground mt-1">{r.comment?.trim() || "No written comment."}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

export default function SellerProfilePage() {
  const params = useParams<{ id: string }>();
  const sellerId = parseInt(params.id);
  const [page, setPage] = useState(1);

  const { data: seller } = useGetSeller(sellerId);
  const { data: carsData } = useListCars({ sellerId, page, limit: PAGE_SIZE });

  const cars = carsData?.data ?? [];
  const totalPages = carsData?.totalPages ?? 1;
  const total = carsData?.total ?? 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* Page heading */}
        <div className="mb-6">
          <Link href="/sellers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-3">
            <ChevronLeft className="h-4 w-4" />
            Back to Sellers
          </Link>
          {seller ? (
            <>
              <h1 className="font-black text-xl text-foreground">{seller.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Available Cars ({total} {total === 1 ? "Car" : "Cars"})
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          )}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {/* First two car cards */}
          {!carsData ? (
            <>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border overflow-hidden">
                  <Skeleton className="aspect-[16/10] w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </>
          ) : (
            cars.slice(0, 2).map((car) => (
              <CarCard key={car.id} car={car} />
            ))
          )}

          {/* Seller profile card — spans 2 columns on lg */}
          <div className="sm:col-span-2 lg:col-span-2">
            <SellerProfileCard sellerId={sellerId} />
          </div>

          {/* Remaining car cards — back to normal flow */}
          {!carsData
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border overflow-hidden">
                  <Skeleton className="aspect-[16/10] w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            : cars.slice(2).map((car) => (
                <CarCard key={car.id} car={car} />
              ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border pt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            {/* Page dots */}
            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(totalPages, 9) }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      page === pageNum
                        ? "bg-primary scale-125"
                        : "bg-gray-300 hover:bg-gray-400"
                    }`}
                    aria-label={`Page ${pageNum}`}
                  />
                );
              })}
              {totalPages > 9 && (
                <span className="text-muted-foreground text-sm">…</span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
