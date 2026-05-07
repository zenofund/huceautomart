import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Check,
  Clock,
  Upload,
  AlertCircle,
  IdCard,
  FileText,
  Crown,
  Image as ImageIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  Star,
  Zap,
  BarChart2,
  Images,
  List,
  CalendarDays,
  X,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { buildSellerNav } from "@/lib/seller-nav";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { ProfileBankTab } from "@/components/profile-bank-tab";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/upload";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AvatarCropDialog } from "@/components/dialogs/avatar-crop-dialog";

type TabId = "profile" | "business" | "payment" | "subscription";

interface VerificationState {
  nin: string;
  proof: string;
  bank: string;
  profile: string;
  allCompleted: boolean;
}

interface SellerProfile {
  isVerified?: boolean | null;
  ninNumber: string | null;
  ninDocumentUrl: string | null;
  proofOfAddressUrl: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  businessName: string | null;
  lotName: string | null;
  businessRegNumber: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
}

interface SubPlan {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  maxListings: number;
  maxPhotos: number;
  featuredListingEnabled: boolean;
  analyticsDashboardEnabled: boolean;
  features: string[];
  isFeatured: boolean;
}

interface ActiveSub {
  id: number;
  status: string;
  expiresAt: string;
  plan: {
    id: number;
    name: string;
    price: number;
    maxListings: number;
    maxPhotos: number;
    durationDays: number;
    featuredListingEnabled: boolean;
    analyticsDashboardEnabled: boolean;
    features: string[];
    isFeatured: boolean;
  };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        <Check className="h-3 w-3" /> Completed
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
        <Clock className="h-3 w-3" /> In-Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">
      <AlertCircle className="h-3 w-3" /> Pending
    </span>
  );
}

export default function SellerSettings() {
  const { user: authUser, logout, refetch } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const initialTab = useMemo<TabId>(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab");
    if (t === "business" || t === "payment" || t === "subscription") return t;
    return "profile";
  }, []);

  const [tab, setTab] = useState<TabId>(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [sellerApproved, setSellerApproved] = useState(false);

  // editable fields
  const [ninNumber, setNinNumber] = useState("");
  const [ninDocumentUrl, setNinDocumentUrl] = useState("");
  const [proofOfAddressUrl, setProofOfAddressUrl] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [lotName, setLotName] = useState("");
  const [businessRegNumber, setBusinessRegNumber] = useState("");
  const [businessBio, setBusinessBio] = useState("");
  const [businessLocation, setBusinessLocation] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");

  const loadProfile = async () => {
    const res = await fetch("/api/sellers/me/profile", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setProfile(data.profile);
    setSellerApproved(Boolean(data.profile?.isVerified));
    setProfilePhotoUrl(data.profilePhotoUrl);
    setVerification(data.verification);
    if (data.profile) {
      setNinNumber(data.profile.ninNumber ?? "");
      setNinDocumentUrl(data.profile.ninDocumentUrl ?? "");
      setProofOfAddressUrl(data.profile.proofOfAddressUrl ?? "");
      setBusinessName(data.profile.businessName ?? "");
      setLotName(data.profile.lotName ?? "");
      setBusinessRegNumber(data.profile.businessRegNumber ?? "");
      setBusinessBio(data.profile.bio ?? "");
      setBusinessLocation(data.profile.location ?? "");
      setBusinessWebsite(data.profile.website ?? "");
    }
    if (data.profilePhotoUrl) setPhotoUrlInput(data.profilePhotoUrl);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadProfile();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const switchTab = (next: TabId) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    setLocation(`/seller/settings?${params.toString()}`, { replace: true });
  };

  const patch = async (payload: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/sellers/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Couldn't save",
          description: (data as { error?: string }).error ?? "Try again.",
          variant: "destructive",
        });
        return false;
      }
      setProfile(data.profile);
      setProfilePhotoUrl(data.profilePhotoUrl);
      setVerification(data.verification);
      await refetch();
      toast({ title: "Saved" });
      return true;
    } finally {
      setSaving(false);
    }
  };

  const allVerified = !!verification?.allCompleted;
  const navItems = buildSellerNav({ sellerVerified: sellerApproved });

  const user: DashboardUser = {
    name:
      profile?.businessName ??
      (authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "Seller"),
    email: authUser?.email ?? "",
    verified: sellerApproved,
    showVerificationState: true,
    avatarUrl: profilePhotoUrl ?? authUser?.profilePhotoUrl ?? undefined,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  return (
    <DashboardLayout
      user={user}
      navItems={navItems}
      title="Settings"
      onLogout={handleLogout}
    >
      <div className="mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-bold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account, business, payment, and subscription.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => switchTab(v as TabId)}>
        <TabsList className="bg-gray-100/60 p-1 h-auto rounded-xl flex w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="profile" className="rounded-lg px-3 py-2 text-xs sm:text-sm">Profile</TabsTrigger>
          <TabsTrigger value="business" className="rounded-lg px-3 py-2 text-xs sm:text-sm">Business</TabsTrigger>
          <TabsTrigger value="payment" className="rounded-lg px-3 py-2 text-xs sm:text-sm">Payment</TabsTrigger>
          <TabsTrigger value="subscription" className="rounded-lg px-3 py-2 text-xs sm:text-sm">Subscription Plan</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
        ) : (
          <>
            <TabsContent value="profile" className="mt-6">
              <ProfileTab
                authUser={authUser}
                profilePhotoUrl={profilePhotoUrl}
                onAfterSave={async () => {
                  await loadProfile();
                  await refetch();
                }}
              />
            </TabsContent>

            <TabsContent value="business" className="mt-6 space-y-8">
              <BusinessSection
                title="Business Details"
                description="Tell buyers about your dealership."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Business Name">
                    <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. God's Autos" />
                  </Field>
                  <Field label="Lot Name (optional)">
                    <Input value={lotName} onChange={(e) => setLotName(e.target.value)} placeholder="Main showroom" />
                  </Field>
                  <Field label="Business Reg. Number (optional)">
                    <Input value={businessRegNumber} onChange={(e) => setBusinessRegNumber(e.target.value)} placeholder="RC123456" />
                  </Field>
                  <Field label="Business Location (optional)">
                    <Input
                      value={businessLocation}
                      onChange={(e) => setBusinessLocation(e.target.value)}
                      placeholder="e.g. Lekki, Lagos"
                    />
                  </Field>
                  <Field label="Website (optional)">
                    <Input
                      value={businessWebsite}
                      onChange={(e) => setBusinessWebsite(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Business Bio (optional)">
                      <textarea
                        value={businessBio}
                        onChange={(e) => setBusinessBio(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        placeholder="Tell buyers about your dealership, years of experience, and specialties."
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    onClick={() =>
                      patch({
                        ...(businessName.trim() ? { businessName: businessName.trim() } : {}),
                        ...(lotName.trim() ? { lotName: lotName.trim() } : {}),
                        ...(businessRegNumber.trim() ? { businessRegNumber: businessRegNumber.trim() } : {}),
                        ...(businessLocation.trim() ? { location: businessLocation.trim() } : {}),
                        ...(businessBio.trim() ? { bio: businessBio.trim() } : {}),
                        ...(businessWebsite.trim() ? { website: businessWebsite.trim() } : {}),
                      })
                    }
                    disabled={saving}
                    className="bg-primary text-primary-foreground"
                  >
                    Save Business Details
                  </Button>
                </div>
              </BusinessSection>

              <BusinessSection
                id="nin"
                title="NIN Verification"
                description="Upload a photo of your National ID for verification."
                status={verification?.nin}
                icon={IdCard}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="NIN Number">
                    <Input
                      value={ninNumber}
                      onChange={(e) => setNinNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="11-digit NIN"
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="NIN Document">
                    <UploadInput value={ninDocumentUrl} onChange={setNinDocumentUrl} />
                  </Field>
                </div>
                <div className="mt-4">
                  <Button
                    onClick={() =>
                      patch({
                        ...(ninNumber.length === 11 ? { ninNumber } : {}),
                        ...(ninDocumentUrl ? { ninDocumentUrl } : {}),
                      })
                    }
                    disabled={saving || ninNumber.length !== 11 || !ninDocumentUrl}
                    className="bg-primary text-primary-foreground"
                  >
                    Submit NIN for Verification
                  </Button>
                </div>
              </BusinessSection>

              <BusinessSection
                id="address"
                title="Proof of Address"
                description="Utility bill, bank statement, or government-issued letter."
                status={verification?.proof}
                icon={FileText}
              >
                <Field label="Proof of Address Document">
                  <UploadInput value={proofOfAddressUrl} onChange={setProofOfAddressUrl} />
                </Field>
                <div className="mt-4">
                  <Button
                    onClick={() => patch({ proofOfAddressUrl })}
                    disabled={saving || !proofOfAddressUrl}
                    className="bg-primary text-primary-foreground"
                  >
                    Submit Proof of Address
                  </Button>
                </div>
              </BusinessSection>
            </TabsContent>

            <TabsContent value="payment" className="mt-6">
              <ProfileBankTab />
            </TabsContent>

            <TabsContent value="subscription" className="mt-6">
              <SubscriptionTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-gray-700">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function UploadInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filename = value
    ? decodeURIComponent(value.split("/").pop() ?? "Uploaded file")
    : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Uploading…</>
          ) : (
            <><Upload className="h-4 w-4 mr-1.5" />{filename ? "Replace file" : "Browse file…"}</>
          )}
        </Button>
        {filename && (
          <span className="text-xs text-gray-500 truncate max-w-[200px]" title={filename}>
            {filename}
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/*,application/pdf"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setUploading(true);
            setError(null);
            try {
              const { servingUrl } = await uploadFile(f);
              onChange(servingUrl);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
        >
          View uploaded file
        </a>
      )}
    </div>
  );
}

function BusinessSection({
  id,
  title,
  description,
  status,
  icon: Icon,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  status?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                status === "completed"
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-gray-900">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs text-gray-500">{description}</p>
            )}
          </div>
        </div>
        {status && <StatusBadge status={status} />}
      </div>
      {children}
    </section>
  );
}

// ─── Profile Tab — mirrors the buyer profile design and features ────────────
// Avatar header with Change Photo, Personal Information section (Full Name,
// Email, Phone), and Password Information section. Hits the same backend
// endpoints (`/api/auth/profile`, `/api/auth/change-password`) so the seller
// flow is identical to the buyer flow.

interface ProfileAuthUser {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  emailVerified?: boolean;
  profilePhotoUrl?: string | null;
}

function PFLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-gray-800 mb-1.5">
      {children}
    </label>
  );
}

function PFTextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition",
        disabled && "bg-gray-50 text-gray-400 cursor-not-allowed",
      )}
    />
  );
}

function PFPasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function PFSaveButton({
  disabled,
  onClick,
  children = "Save Changes",
}: {
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full px-5 py-2.5 text-xs font-semibold transition-colors",
        disabled
          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
          : "bg-primary text-white hover:bg-primary/90",
      )}
    >
      {children}
    </button>
  );
}

function ProfileTab({
  authUser,
  profilePhotoUrl,
  onAfterSave,
}: {
  authUser: ProfileAuthUser | null;
  profilePhotoUrl: string | null;
  onAfterSave: () => Promise<void>;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const initialName = authUser
    ? `${authUser.firstName} ${authUser.lastName}`.trim()
    : "";
  const initialEmail = authUser?.email ?? "";
  const initialPhone = authUser?.phone ?? "";
  const initialPhoto =
    profilePhotoUrl ?? authUser?.profilePhotoUrl ?? undefined;

  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(
    initialPhoto,
  );
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Re-sync when the underlying user changes (e.g. after refetch)
  useEffect(() => {
    if (!authUser) return;
    setFullName(`${authUser.firstName} ${authUser.lastName}`.trim());
    setPhone(authUser.phone ?? "");
    setPhotoPreview(profilePhotoUrl ?? authUser.profilePhotoUrl ?? undefined);
  }, [
    authUser?.firstName,
    authUser?.lastName,
    authUser?.phone,
    authUser?.profilePhotoUrl,
    profilePhotoUrl,
  ]);

  const personalDirty =
    fullName.trim() !== initialName ||
    phone.trim() !== (initialPhone ?? "") ||
    photoPreview !== initialPhoto;

  const newPwdValid = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(newPwd);
  const passwordDirty = currentPwd.length > 0 && newPwd.length > 0;

  const firstInitial = (initialName.charAt(0) || "S").toUpperCase();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({
        title: "Unsupported file",
        description: "Please choose an image file.",
        variant: "destructive",
      });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({
        title: "Photo too large",
        description: "Please choose an image under 5 MB.",
        variant: "destructive",
      });
      return;
    }
    setCropFile(f);
    setIsCropOpen(true);
  };

  const handleSavePersonal = async () => {
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");

    if (!firstName || !lastName) {
      toast({
        title: "Invalid name",
        description: "Please enter both a first and last name.",
        variant: "destructive",
      });
      return;
    }

    setSavingPersonal(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone.trim() || null,
          profilePhotoUrl:
            photoPreview !== initialPhoto ? photoPreview ?? null : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error((data as { error?: string }).error ?? "Failed to save");
      toast({
        title: "Profile updated",
        description: "Your personal details have been saved.",
      });
      await onAfterSave();
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSavePassword = async () => {
    if (!newPwdValid) {
      toast({
        title: "Weak password",
        description: "Password must be 8+ characters with letters and numbers.",
        variant: "destructive",
      });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPwd,
          newPassword: newPwd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (data as { error?: string }).error ?? "Failed to change password",
        );
      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
      setCurrentPwd("");
      setNewPwd("");
    } catch (err) {
      toast({
        title: "Could not update password",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      {/* Header: avatar + identity */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 pb-6 border-b border-gray-200">
        <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full overflow-hidden bg-[#9A4042] flex items-center justify-center shrink-0">
          {photoPreview ? (
            <img
              src={photoPreview}
              alt={initialName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-3xl font-bold text-white">
              {firstInitial}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            {initialName || "Seller"}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-sm text-gray-400">{initialEmail}</span>
            {authUser?.emailVerified && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                Email Verified
              </span>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
            data-testid="button-change-photo"
          >
            <ImageIcon className="h-3.5 w-3.5" /> Change Photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </div>

      {/* Personal Information */}
      <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-10 py-8 border-b border-gray-200">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            Personal Information
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Update your personal details here.
          </p>
          <div className="mt-4">
            <PFSaveButton
              disabled={!personalDirty || savingPersonal}
              onClick={handleSavePersonal}
            >
              {savingPersonal ? "Saving..." : "Save Changes"}
            </PFSaveButton>
          </div>
        </div>
        <div className="space-y-5 max-w-xl">
          <div>
            <PFLabel>Full Name</PFLabel>
            <PFTextInput
              value={fullName}
              onChange={setFullName}
              placeholder="Your full name"
            />
          </div>
          <div>
            <PFLabel>Email</PFLabel>
            <PFTextInput value={initialEmail} disabled placeholder={initialEmail} />
            <p className="mt-1.5 text-[11px] text-gray-400">
              Email cannot be changed here. Contact admin to update your email
              address.
            </p>
          </div>
          <div>
            <PFLabel>Phone Number</PFLabel>
            <PFTextInput
              value={phone}
              onChange={setPhone}
              placeholder="+234 703 404 1184"
              type="tel"
            />
          </div>
        </div>
      </section>

      {/* Password Information */}
      <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-10 py-8">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            Password Information
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Update your Password here.
          </p>
          <div className="mt-4">
            <PFSaveButton
              disabled={!passwordDirty || savingPassword}
              onClick={handleSavePassword}
            >
              {savingPassword ? "Saving..." : "Save Changes"}
            </PFSaveButton>
          </div>
        </div>
        <div className="space-y-5 max-w-xl">
          <div>
            <PFLabel>Current Password</PFLabel>
            <PFPasswordInput
              value={currentPwd}
              onChange={setCurrentPwd}
              placeholder="••••••••••"
            />
          </div>
          <div>
            <PFLabel>New Password</PFLabel>
            <PFPasswordInput
              value={newPwd}
              onChange={setNewPwd}
              placeholder="••••••••••"
            />
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                newPwd.length === 0
                  ? "bg-gray-100 text-gray-500"
                  : newPwdValid
                    ? "bg-primary/10 text-primary"
                    : "bg-red-50 text-red-600",
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              8+ Alphanumeric Characters
            </div>
          </div>
        </div>
      </section>
      <AvatarCropDialog
        open={isCropOpen}
        file={cropFile}
        onClose={() => {
          setIsCropOpen(false);
          setCropFile(null);
        }}
        onConfirm={async (croppedFile) => {
          try {
            const { servingUrl } = await uploadFile(croppedFile);
            setPhotoPreview(servingUrl);
            setIsCropOpen(false);
            setCropFile(null);
          } catch (err) {
            toast({
              title: "Upload failed",
              description:
                err instanceof Error ? err.message : "Could not upload photo.",
              variant: "destructive",
            });
          }
        }}
      />
    </>
  );
}

// ─── Subscription Tab ─────────────────────────────────────────────────────────

function planPrice(p: SubPlan): { label: string; period: string } {
  if (p.price === 0) return { label: "Free", period: "" };
  const label = `₦${p.price.toLocaleString("en-NG")}`;
  const period =
    p.durationDays === 30 ? "/month"
    : p.durationDays === 365 ? "/year"
    : `/${p.durationDays} days`;
  return { label, period };
}

function planFeatureList(p: SubPlan): string[] {
  const list: string[] = [];
  list.push(`Up to ${p.maxListings} active listing${p.maxListings !== 1 ? "s" : ""}`);
  list.push(`${p.maxPhotos} photo${p.maxPhotos !== 1 ? "s" : ""} per listing`);
  if (p.featuredListingEnabled) list.push("Featured listing placement");
  if (p.analyticsDashboardEnabled) list.push("Analytics dashboard");
  (p.features ?? []).forEach((f) => list.push(f));
  list.push(`${p.durationDays}-day plan duration`);
  return list;
}

function SubscriptionTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [initiating, setInitiating] = useState<number | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery<SubPlan[]>({
    queryKey: ["subscription-plans-public"],
    queryFn: async () => {
      const res = await fetch("/api/listings/subscription-plans");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: subData, isLoading: subLoading } = useQuery<{ subscription: ActiveSub | null }>({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      const res = await fetch("/api/me/subscription", { credentials: "include" });
      if (!res.ok) return { subscription: null };
      return res.json();
    },
    staleTime: 30_000,
  });

  const activeSub = subData?.subscription ?? null;

  const freeMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await fetch("/api/subscriptions/free", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to activate plan");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      setNotice({ type: "success", msg: "Your plan has been activated!" });
      toast({ title: "Plan activated", description: "You're now on your new plan." });
    },
    onError: (e: Error) => {
      setNotice({ type: "error", msg: e.message });
      toast({ title: "Activation failed", description: e.message, variant: "destructive" });
    },
  });

  // Handle Paystack callback (?reference=HUCE-SUBS-xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("reference");
    if (!ref || !ref.startsWith("HUCE-SUBS-")) return;
    window.history.replaceState({}, "", window.location.pathname + "?tab=subscription");
    (async () => {
      try {
        const res = await fetch(`/api/payments/verify/${encodeURIComponent(ref)}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.status === "success") {
          qc.invalidateQueries({ queryKey: ["my-subscription"] });
          setNotice({ type: "success", msg: "Payment confirmed! Your subscription is now active." });
          toast({ title: "Subscription activated", description: "Your plan is now active." });
        } else if (data.status === "abandoned") {
          setNotice({ type: "error", msg: "Payment was cancelled. You can try again anytime." });
        } else {
          setNotice({ type: "error", msg: "Payment verification failed. Contact support if you were charged." });
        }
      } catch {
        setNotice({ type: "error", msg: "Could not verify payment. Please contact support." });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe(plan: SubPlan) {
    if (plan.price === 0) {
      freeMutation.mutate(plan.id);
      return;
    }
    setInitiating(plan.id);
    try {
      const callbackUrl = `${window.location.origin}/seller/settings?tab=subscription`;
      const res = await fetch("/api/payments/init", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "subscription", planId: plan.id, callbackUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initialize payment");
      window.location.href = data.authorizationUrl;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setNotice({ type: "error", msg });
      toast({ title: "Payment failed", description: msg, variant: "destructive" });
      setInitiating(null);
    }
  }

  const isLoading = plansLoading || subLoading;

  return (
    <div className="space-y-6">
      {/* Notice banner */}
      {notice && (
        <div className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3",
          notice.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800",
        )}>
          <div className="flex-1 text-sm font-medium">{notice.msg}</div>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100 mt-0.5 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Current plan summary */}
      {!subLoading && activeSub && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Crown className="h-5 w-5 text-primary" />
                <span className="text-sm font-bold text-gray-900">Current Plan:</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {activeSub.plan.name}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-700">
                  <List className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                  <span>{activeSub.plan.maxListings} listing{activeSub.plan.maxListings !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-700">
                  <Images className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                  <span>{activeSub.plan.maxPhotos} photo{activeSub.plan.maxPhotos !== 1 ? "s" : ""}/listing</span>
                </div>
                {activeSub.plan.featuredListingEnabled && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <Star className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                    <span>Featured listings</span>
                  </div>
                )}
                {activeSub.plan.analyticsDashboardEnabled && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <BarChart2 className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                    <span>Analytics</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 sm:text-right sm:flex-col sm:items-end flex-shrink-0">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>
                Expires {new Date(activeSub.expiresAt).toLocaleDateString("en-NG", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Plans heading */}
      <div>
        <h3 className="text-base font-bold text-gray-900">Available Plans</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose a plan that matches your selling needs.
        </p>
      </div>

      {/* Plan cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
              <div className="space-y-2">
                {[0, 1, 2, 3].map((j) => <div key={j} className="h-3 bg-gray-100 rounded w-full" />)}
              </div>
              <div className="h-9 bg-gray-200 rounded-xl w-full" />
            </div>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <Crown className="h-10 w-10 mx-auto text-primary/40" />
          <p className="mt-3 text-sm text-gray-500">No subscription plans available at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const { label: priceLabel, period } = planPrice(plan);
            const features = planFeatureList(plan);
            const isCurrent = activeSub?.plan.id === plan.id;
            const isActivating = freeMutation.isPending && freeMutation.variables === plan.id;
            const isInitiating = initiating === plan.id;
            const busy = isActivating || isInitiating;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md",
                  isCurrent
                    ? "border-primary/40 ring-2 ring-primary/20"
                    : plan.isFeatured
                      ? "border-amber-300 ring-2 ring-amber-100"
                      : "border-gray-200",
                )}
              >
                {/* Badges */}
                <div className="flex items-center gap-2 mb-3 flex-wrap min-h-[1.5rem]">
                  {plan.isFeatured && !isCurrent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      <Zap className="h-3 w-3" /> Recommended
                    </span>
                  )}
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                      <Check className="h-3 w-3" /> Current Plan
                    </span>
                  )}
                </div>

                {/* Plan name */}
                <h4 className="text-sm font-extrabold text-gray-900">{plan.name}</h4>

                {/* Price */}
                <div className="mt-2 mb-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-gray-900">{priceLabel}</span>
                  {period && <span className="text-xs text-gray-400">{period}</span>}
                </div>

                {/* Description */}
                {plan.description && (
                  <p className="text-xs text-gray-500 mb-3">{plan.description}</p>
                )}

                {/* Feature list */}
                <ul className="flex-1 space-y-1.5 mb-4">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-700">
                      <span className="mt-0.5 flex-shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10">
                        <Check className="h-2.5 w-2.5 text-primary" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isCurrent || busy}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    isCurrent
                      ? "bg-primary/10 text-primary cursor-default"
                      : plan.isFeatured
                        ? "bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                        : "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-60",
                  )}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isCurrent
                    ? "Current Plan"
                    : plan.price === 0
                      ? "Activate Free Plan"
                      : activeSub
                        ? "Switch to this Plan"
                        : "Get Started"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
