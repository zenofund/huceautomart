import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle, RefreshCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { AuthLayout } from "@/components/auth-layout";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

export default function VerifyOtpPage() {
  const [, navigate] = useLocation();
  const { refetch } = useAuth();
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const userId = Number(params.get("userId") || "0");
  const email = params.get("email") || "";
  const devOtp = params.get("devOtp") || "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Verification Failed", description: data.error, variant: "destructive" });
        return;
      }
      
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      
      await refetch();
      setVerified(true);
    } catch {
      toast({ title: "Error", description: "Something went wrong. Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed", description: data.error, variant: "destructive" });
        return;
      }
      setCountdown(60);
      setOtp("");
      toast({ title: "Code Sent", description: "A new verification code has been sent." });
      if (data.devOtp) {
        toast({ title: "Dev OTP", description: `Code: ${data.devOtp}` });
      }
    } catch {
      toast({ title: "Error", description: "Failed to resend code.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  if (verified) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Account Verified!</h1>
          <p className="text-muted-foreground mb-8">
            Your account is active. Welcome to HUCE Autos!
          </p>
          <Button
            onClick={() => navigate("/")}
            className="w-full h-11 bg-primary text-primary-foreground font-semibold"
            data-testid="button-go-home"
          >
            Go to Homepage
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Verify Your Email</h1>
        <p className="text-muted-foreground text-sm">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-foreground">{email || "your email"}</span>
        </p>
      </div>

      {devOtp && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-center">
          <p className="text-xs text-amber-700 font-medium mb-1">Dev Mode — Your OTP</p>
          <p className="text-2xl font-mono font-bold text-amber-800 tracking-widest">{devOtp}</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-6">
        <InputOTP
          maxLength={6}
          value={otp}
          onChange={setOtp}
          onComplete={handleVerify}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>

        <Button
          onClick={handleVerify}
          disabled={otp.length !== 6 || loading}
          className="w-full h-11 bg-primary text-primary-foreground font-semibold"
          data-testid="button-verify-otp"
        >
          {loading ? "Verifying..." : "Verify Code"}
        </Button>
      </div>

      <div className="text-center mt-6">
        {countdown > 0 ? (
          <p className="text-sm text-muted-foreground">
            Resend code in <span className="font-medium text-foreground">{countdown}s</span>
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
            {resending ? "Sending..." : "Resend Code"}
          </button>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Wrong email?{" "}
        <Link href="/sign-up" className="text-primary font-medium hover:underline">
          Start over
        </Link>
      </p>
    </AuthLayout>
  );
}
