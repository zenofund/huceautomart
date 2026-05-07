import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, EyeOff, Lock, Mail, User, Phone,
  Building2, Store, ArrowRight,
  MapPin, LocateFixed, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { toApiUrl } from "@/lib/api-base";

type Role = "buyer" | "seller";

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
  // Seller-only
  lotName: string;
}

const EMPTY_FORM: FormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  password: "",
  confirmPassword: "",
  lotName: "",
};

export default function SignUpPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [role, setRole] = useState<Role>("buyer");
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    // If the user is already loaded via AuthContext, auto-redirect them
    if (user) {
      const dest =
        user.role === "seller"
          ? "/seller"
          : user.role === "inspector"
            ? "/inspector"
            : user.role === "admin"
              ? "/admin"
              : "/dashboard";
      navigate(dest, { replace: true });
    }
  }, [user, navigate]);

  const handleGoogleSignUp = () => {
    window.location.href = toApiUrl("/api/auth/google");
  };

  const setField = (key: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Seller is a Business account only if they entered a Lot Name
  const isBusinessSeller = role === "seller" && form.lotName.trim() !== "";

  // ── Geolocation ────────────────────────────────────────────────────────────
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast({ title: "Not supported", description: "Geolocation is not available in your browser.", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const parts: string[] = [];
          const a = data.address || {};
          if (a.road) parts.push(a.road);
          if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood);
          if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village);
          if (a.state) parts.push(a.state);
          if (a.country) parts.push(a.country);
          setField("address", parts.join(", ") || data.display_name || "");
        } catch {
          toast({ title: "Location fetched", description: "Could not convert to address. Try typing it.", variant: "destructive" });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === 1
            ? "Location permission denied. Please allow access and try again."
            : "Could not determine your location. Try again.";
        toast({ title: "Location Error", description: msg, variant: "destructive" });
      },
      { timeout: 10000 }
    );
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;

    if (form.password !== form.confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are identical.", variant: "destructive" });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, string> = {
        role,
        // Buyers are always individual; sellers become company only via Lot Name
        accountType: isBusinessSeller ? "company" : "individual",
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        password: form.password,
      };

      if (role === "seller" && form.lotName) {
        payload.lotName = form.lotName;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Registration Failed", description: data.error, variant: "destructive" });
        return;
      }

      const params = new URLSearchParams({
        userId: String(data.userId),
        email: data.email,
        ...(data.devOtp ? { devOtp: data.devOtp } : {}),
      });
      navigate(`/verify-otp?${params.toString()}`);
    } catch (err) {
      console.error("SignUp error:", err);
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left hero ── */}
      <div
        className="hidden lg:block flex-1 relative"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1200&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 to-primary/70" />
        <div className="relative flex flex-col h-full p-10 justify-between">
          <Link href="/" className="inline-flex">
            <img
              src={`${import.meta.env.BASE_URL}huce-automart-logo.png`}
              alt="Huce Auto Mart"
              className="h-10 w-auto"
            />
          </Link>
          <div>
            <h2 className="text-3xl font-black text-white mb-3">
              Join Nigeria's #1 Auto Marketplace
            </h2>
            <p className="text-primary-foreground/80 leading-relaxed">
              Create your account and get access to thousands of verified car
              listings, trusted sellers, and secure transactions.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 bg-background overflow-auto">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="text-center mb-6 lg:hidden">
            <Link href="/" className="inline-flex mb-4">
              <img
                src={`${import.meta.env.BASE_URL}huce-automart-logo.png`}
                alt="Huce Auto Mart"
                className="h-10 w-auto"
              />
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Create Account</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Join thousands of satisfied users across Nigeria.
          </p>

          {/* ── Role tabs ── */}
          <div className="flex gap-2 mb-6 bg-muted rounded-xl p-1">
            {(["buyer", "seller"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setForm((f) => ({ ...f, lotName: "" }));
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  role === r
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${r}`}
              >
                {r === "buyer" ? "I'm a Buyer" : "I'm a Seller"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ── Name ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">First Name</Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ada"
                    value={form.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Last Name</Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Okonkwo"
                    value={form.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>
            </div>

            {/* ── Email ── */}
            <div>
              <Label className="text-sm font-medium">Email Address</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className="pl-10 h-11"
                  data-testid="input-email"
                  required
                />
              </div>
            </div>

            {/* ── Phone ── */}
            <div>
              <Label className="text-sm font-medium">Phone Number</Label>
              <div className="relative mt-1.5">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="+234 800 000 0000"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
            </div>

            {/* ── Address + Locate Me ── */}
            <div>
              <Label className="text-sm font-medium">Address</Label>
              <div className="relative mt-1.5">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="e.g. Victoria Island, Lagos"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                  className="pl-10 pr-28 h-11"
                />
                <button
                  type="button"
                  onClick={handleLocateMe}
                  disabled={locating}
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-50 transition-colors px-2.5 py-1.5 rounded-md"
                >
                  {locating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <LocateFixed className="h-3 w-3" />
                  )}
                  {locating ? "Locating…" : "Locate me"}
                </button>
              </div>
            </div>

            {/* ── Seller: Car Lot Name ── */}
            <AnimatePresence>
              {role === "seller" && (
                <motion.div
                  key="seller-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-4"
                >
                  <div>
                    <Label className="text-sm font-medium">
                      Car Lot Name{" "}
                      <span className="text-muted-foreground font-normal">(optional — triggers Business account)</span>
                    </Label>
                    <div className="relative mt-1.5">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g. Apex Motors"
                        value={form.lotName}
                        onChange={(e) => setField("lotName", e.target.value)}
                        className="pl-10 h-11"
                      />
                    </div>
                    {form.lotName.trim() && (
                      <p className="text-xs text-primary mt-1.5 flex items-center gap-1 font-medium">
                        <Building2 className="h-3 w-3" />
                        Registered as a Business account
                      </p>
                    )}
                  </div>

                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Password ── */}
            <div>
              <Label className="text-sm font-medium">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="8+ alphanumeric characters"
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  className="pl-10 pr-10 h-11"
                  data-testid="input-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* ── Confirm password ── */}
            <div>
              <Label className="text-sm font-medium">Confirm Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={form.confirmPassword}
                  onChange={(e) => setField("confirmPassword", e.target.value)}
                  className={`pl-10 h-11 ${
                    form.confirmPassword && form.confirmPassword !== form.password
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }`}
                  required
                />
              </div>
              {form.confirmPassword && form.confirmPassword !== form.password && (
                <p className="text-xs text-destructive mt-1">Passwords do not match</p>
              )}
            </div>

            {/* ── Terms ── */}
            <div className="flex items-start gap-3 pt-1">
              <Checkbox
                id="terms"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(!!v)}
                className="mt-0.5"
                data-testid="checkbox-terms"
              />
              <Label
                htmlFor="terms"
                className="text-sm text-muted-foreground leading-snug cursor-pointer"
              >
                I agree to the{" "}
                <span className="text-primary font-medium">Terms & Conditions</span>{" "}
                and{" "}
                <span className="text-primary font-medium">Privacy Policy</span>
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-primary text-primary-foreground font-semibold"
              disabled={!agreed || loading}
              data-testid="button-signup"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating Account…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Create Account <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">Or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            variant="outline"
            className="w-full h-11 font-medium"
            data-testid="button-google-signup"
            type="button"
            onClick={handleGoogleSignUp}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary font-semibold hover:underline">
              Sign In
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
