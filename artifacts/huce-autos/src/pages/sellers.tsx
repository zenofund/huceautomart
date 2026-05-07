import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Star, BadgeCheck, Car, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useListSellers } from "@workspace/api-client-react";
import type { Seller } from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";

function SellerCard({
  seller,
  onContact,
  contactStarting,
}: {
  seller: Seller;
  onContact: (seller: Seller) => void;
  contactStarting: boolean;
}) {
  const initials = seller.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all"
    >
      <div className="flex items-start gap-4 mb-4">
        <Avatar className="h-14 w-14 rounded-xl border border-border flex-shrink-0">
          {seller.avatarUrl && <AvatarImage src={seller.avatarUrl} alt={seller.name} className="object-cover" />}
          <AvatarFallback className="bg-primary/10 text-primary font-bold rounded-xl text-lg">
            {initials || <Car className="h-6 w-6" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground">{seller.name}</h3>
            {seller.verified && (
              <BadgeCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
            )}
          </div>
          {seller.lotName && (
            <p className="text-sm text-muted-foreground">{seller.lotName}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 text-sm text-yellow-500 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < Math.floor(seller.rating) ? "fill-current" : "opacity-30"}`}
          />
        ))}
        <span className="text-muted-foreground ml-1">{seller.rating.toFixed(1)}</span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 text-secondary flex-shrink-0" />
          {seller.location}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Car className="h-4 w-4 text-secondary flex-shrink-0" />
          {seller.totalListings} Active Listings
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BadgeCheck className="h-4 w-4 text-secondary flex-shrink-0" />
          Member since {formatDate(seller.joinedAt)}
        </div>
      </div>

      <div className="flex gap-2">
        <Link href={`/sellers/${seller.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full" data-testid={`button-seller-cars-${seller.id}`}>
            View Cars
          </Button>
        </Link>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground"
          data-testid={`button-seller-contact-${seller.id}`}
          onClick={() => onContact(seller)}
          disabled={contactStarting}
        >
          Contact
        </Button>
      </div>
    </motion.div>
  );
}

export default function SellersPage() {
  const { data: sellers } = useListSellers();
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [contactingSellerId, setContactingSellerId] = useState<number | null>(null);

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

  const startSellerChat = async (seller: Seller) => {
    if (!requireBuyer()) return;
    if (user!.id === seller.id) {
      toast({ title: "This is your own seller profile." });
      return;
    }
    setContactingSellerId(seller.id);
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
      setContactingSellerId(null);
    }
  };

  const filtered = sellers
    ? sellers.filter((s) => {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.lotName ?? "").toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q)
        );
      })
    : null;

  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Browse Verified Sellers</h1>
          <p className="text-primary-foreground/70 text-sm">
            Connect with trusted car sellers offering a wide range of vehicles to suit your needs.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Count + Search bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <p className="text-sm font-semibold text-foreground">
            {filtered
              ? <><span className="text-primary text-base font-black">{filtered.length}</span> {filtered.length === 1 ? "Seller" : "Sellers"} found</>
              : <span className="text-muted-foreground">Loading sellers...</span>
            }
          </p>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, lot or city..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-4 h-10 text-sm"
            />
          </div>
        </div>

        {!filtered ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-28 mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Search className="h-14 w-14 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="font-bold text-foreground mb-2">No sellers found</h3>
            <p className="text-muted-foreground text-sm">Try a different name, lot, or city.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((seller) => (
              <SellerCard
                key={seller.id}
                seller={seller}
                onContact={startSellerChat}
                contactStarting={contactingSellerId === seller.id}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
