import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { toApiUrl } from "@/lib/api-base";

export default function SignInPage() {
  const [, navigate] = useLocation();
  const { user, refetch } = useAuth();
  const { toast } = useToast();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If the user is already loaded via AuthContext, auto-redirect them
    // This catches the case where AuthProvider sets the token and fetches user
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
      return;
    }

    const params = new URLSearchParams(window.location.search);
    
    // Check if the mobile app passed a token back via deep link
    const token = params.get("token");
    if (token) {
      localStorage.setItem("token", token);
      
      // Force an immediate reload to let AuthProvider handle the new token
      // This is much more reliable than trying to manage state manually here
      window.location.href = "/";
      return;
    }

    const googleError = params.get("googleError") || params.get("error");
    if (!googleError) return;

    const messages: Record<string, string> = {
      access_denied: "Google sign-in was cancelled.",
      state_mismatch: "Google sign-in could not be verified. Please try again.",
      callback_failed: "Google sign-in failed. Please try again.",
      google_account_conflict:
        "This Google account is linked to another user. Please sign in with email/password.",
    };

    toast({
      title: "Google Sign-In Failed",
      description:
        messages[googleError] || "Google sign-in could not be completed. Please try again.",
      variant: "destructive",
    });
    window.history.replaceState({}, "", "/sign-in");
  }, [toast, user, refetch, navigate]);

  const handleGoogleSignIn = () => {
    window.location.href = toApiUrl("/api/auth/google");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Unverified email — redirect to OTP page
        if (
          data.requiresVerification ||
          (data.error === "Email not verified" && data.userId)
        ) {
          const params = new URLSearchParams({
            userId: String(data.userId),
            email: data.email,
            ...(data.devOtp ? { devOtp: data.devOtp } : {}),
          });
          navigate(`/verify-otp?${params.toString()}`);
          return;
        }
        toast({ title: "Sign In Failed", description: data.error, variant: "destructive" });
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      await refetch();
      const role: string | undefined = data?.user?.role ?? data?.role;
      const dest =
        role === "seller"
          ? "/seller"
          : role === "inspector"
            ? "/inspector"
            : role === "admin"
              ? "/admin"
              : "/dashboard";
      navigate(dest);
    } catch (err) {
      console.error("SignIn error:", err);
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
          <h1 className="text-2xl font-bold text-foreground mb-1">Sign In</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Welcome back! Enter your credentials to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11"
                  data-testid="input-email"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11"
                  data-testid="input-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary text-primary-foreground font-semibold"
              data-testid="button-signin"
            >
              {loading ? (
                "Signing In..."
              ) : (
                <span className="flex items-center gap-2">
                  Sign In <ArrowRight className="h-4 w-4" />
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
            data-testid="button-google-signin"
            type="button"
            onClick={handleGoogleSignIn}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link href="/sign-up" className="text-primary font-semibold hover:underline">
              Sign Up
            </Link>
          </p>
    </AuthLayout>
  );
}
