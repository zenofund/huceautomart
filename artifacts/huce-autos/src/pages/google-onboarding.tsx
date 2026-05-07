import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Loader2, Store, UserRound } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

type Role = "buyer" | "seller";

interface PendingProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture: string | null;
}

export default function GoogleOnboardingPage() {
  const [, navigate] = useLocation();
  const { refetch } = useAuth();
  const { toast } = useToast();

  const [role, setRole] = useState<Role>("buyer");
  const [lotName, setLotName] = useState("");
  const [profile, setProfile] = useState<PendingProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadPendingProfile = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const onboardingToken = params.get("onboardingToken") || "";
        
        const res = await fetch(`/api/auth/google/pending?onboardingToken=${onboardingToken}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          toast({
            title: "Session Expired",
            description: data.error || "Please continue with Google again.",
            variant: "destructive",
          });
          navigate("/sign-in");
          return;
        }
        setProfile(data.profile);
      } catch {
        toast({
          title: "Unable to Continue",
          description: "Please continue with Google again.",
          variant: "destructive",
        });
        navigate("/sign-in");
      } finally {
        setLoadingProfile(false);
      }
    };

    loadPendingProfile();
  }, [navigate, toast]);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const onboardingToken = params.get("onboardingToken") || "";

      const res = await fetch("/api/auth/google/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role,
          lotName: role === "seller" ? lotName.trim() || undefined : undefined,
          onboardingToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Onboarding Failed",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      await refetch();
      const dest =
        data?.user?.role === "seller"
          ? "/seller"
          : data?.user?.role === "inspector"
            ? "/inspector"
            : data?.user?.role === "admin"
              ? "/admin"
              : "/dashboard";
      navigate(dest);
    } catch {
      toast({
        title: "Onboarding Failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold text-foreground mb-1">Complete Your Account</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Choose how you want to use Huce Autos.
      </p>

      {loadingProfile ? (
        <div className="h-44 rounded-xl border bg-card flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading your Google profile...
        </div>
      ) : (
        <form onSubmit={handleComplete} className="space-y-5">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">
              {profile?.firstName} {profile?.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Select Role</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("buyer")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  role === "buyer"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="h-4 w-4" />
                  Buyer
                </span>
                <span className="text-xs text-muted-foreground">Shop and make offers.</span>
              </button>
              <button
                type="button"
                onClick={() => setRole("seller")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  role === "seller"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Store className="h-4 w-4" />
                  Seller
                </span>
                <span className="text-xs text-muted-foreground">List and sell vehicles.</span>
              </button>
            </div>
          </div>

          {role === "seller" && (
            <div>
              <Label htmlFor="lotName" className="text-sm font-medium">
                Car Lot Name (optional)
              </Label>
              <Input
                id="lotName"
                value={lotName}
                onChange={(e) => setLotName(e.target.value)}
                placeholder="e.g. Apex Motors"
                className="mt-1.5 h-11"
              />
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full h-11">
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Completing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Continue <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground mt-6">
        Changed your mind?{" "}
        <Link href="/sign-in" className="text-primary font-semibold hover:underline">
          Back to Sign In
        </Link>
      </p>
    </AuthLayout>
  );
}
