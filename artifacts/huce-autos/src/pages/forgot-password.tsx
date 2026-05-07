import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { AuthLayout } from "@/components/auth-layout";
import { useToast } from "@/hooks/use-toast";

type Step = "email" | "otp" | "password" | "done";

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<number>(0);
  const [devOtp, setDevOtp] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      if (data.userId) setUserId(data.userId);
      if (data.devOtp) setDevOtp(data.devOtp);
      setStep("otp");
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = () => {
    if (otp.length === 6) setStep("password");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      setStep("done");
    } catch {
      toast({ title: "Error", description: "Failed to reset password.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {step === "email" && (
        <>
          <h1 className="text-2xl font-bold mb-1">Forgot Password</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Enter your email and we'll send you a reset code.
          </p>
          <form onSubmit={handleRequestReset} className="space-y-5">
            <div>
              <Label className="text-sm font-medium">Email Address</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
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
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary text-primary-foreground font-semibold"
              data-testid="button-send-reset"
            >
              {loading ? "Sending..." : "Send Reset Code"}
            </Button>
          </form>
          <div className="text-center mt-6">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
            </Link>
          </div>
        </>
      )}

      {step === "otp" && (
        <>
          <h1 className="text-2xl font-bold mb-1">Enter Reset Code</h1>
          <p className="text-muted-foreground text-sm mb-6">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
          {devOtp && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-center">
              <p className="text-xs text-amber-700 font-medium mb-1">Dev Mode — Your OTP</p>
              <p className="text-2xl font-mono font-bold text-amber-800 tracking-widest">{devOtp}</p>
            </div>
          )}
          <div className="flex flex-col items-center gap-6">
            <InputOTP maxLength={6} value={otp} onChange={setOtp} onComplete={handleVerifyOtp}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              onClick={handleVerifyOtp}
              disabled={otp.length !== 6}
              className="w-full h-11 bg-primary text-primary-foreground font-semibold"
              data-testid="button-verify-reset-code"
            >
              Continue
            </Button>
          </div>
        </>
      )}

      {step === "password" && (
        <>
          <h1 className="text-2xl font-bold mb-1">New Password</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Choose a strong password for your account.
          </p>
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <Label className="text-sm font-medium">New Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPwd ? "text" : "password"}
                  placeholder="8+ characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 h-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Confirm Password</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPwd ? "text" : "password"}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 h-11"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading || newPassword.length < 8}
              className="w-full h-11 bg-primary text-primary-foreground font-semibold"
              data-testid="button-update-password"
            >
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </>
      )}

      {step === "done" && (
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Password Updated!</h1>
          <p className="text-muted-foreground mb-8">
            Your password has been reset. You can now sign in.
          </p>
          <Button
            onClick={() => navigate("/sign-in")}
            className="w-full h-11 bg-primary text-primary-foreground font-semibold"
          >
            Go to Sign In
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
