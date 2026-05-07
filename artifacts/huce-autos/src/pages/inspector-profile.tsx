import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Image as ImageIcon,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardUser,
} from "@/components/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileBankTab } from "@/components/profile-bank-tab";
import { inspectorNav } from "@/lib/inspector-nav";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/upload";
import { AvatarCropDialog } from "@/components/dialogs/avatar-crop-dialog";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-gray-800 mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
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

function PasswordInput({
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

function SaveButton({
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

interface InspectorProfileData {
  officeName: string | null;
  licenseNumber: string | null;
  serviceArea: string | null;
  bio: string | null;
  isAvailable: boolean;
  rating: number | null;
  totalInspections: number | null;
}

export default function InspectorProfile() {
  const { user: authUser, logout, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const initialName = authUser
    ? `${authUser.firstName} ${authUser.lastName}`.trim()
    : "";
  const initialEmail = authUser?.email ?? "";
  const initialPhone = authUser?.phone ?? "";
  const initialLocation = authUser?.location ?? "";

  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [location, setInspectorLocation] = useState(initialLocation);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(
    authUser?.profilePhotoUrl ?? undefined,
  );
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [officeName, setOfficeName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [bio, setBio] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [savingInspectorProfile, setSavingInspectorProfile] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const inspectorProfileQuery = useQuery({
    queryKey: ["inspector-self-profile"],
    queryFn: async () => {
      const res = await fetch("/api/inspectors/me/profile", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load inspector profile");
      return data as InspectorProfileData;
    },
    enabled: !!authUser && authUser.role === "inspector",
  });

  useEffect(() => {
    if (!authUser) return;
    setFullName(`${authUser.firstName} ${authUser.lastName}`.trim());
    setPhone(authUser.phone ?? "");
    setInspectorLocation(authUser.location ?? "");
    setPhotoPreview(authUser.profilePhotoUrl ?? undefined);
  }, [
    authUser?.firstName,
    authUser?.lastName,
    authUser?.phone,
    authUser?.location,
    authUser?.profilePhotoUrl,
  ]);

  useEffect(() => {
    const p = inspectorProfileQuery.data;
    if (!p) return;
    setOfficeName(p.officeName ?? "");
    setLicenseNumber(p.licenseNumber ?? "");
    setServiceArea(p.serviceArea ?? "");
    setBio(p.bio ?? "");
    setIsAvailable(p.isAvailable ?? true);
  }, [inspectorProfileQuery.data]);

  const user: DashboardUser = {
    name: initialName || "Inspection Officer",
    email: initialEmail,
    verified: authUser?.emailVerified ?? false,
    avatarUrl: photoPreview,
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const personalDirty =
    fullName.trim() !== initialName ||
    phone.trim() !== (initialPhone ?? "") ||
    location.trim() !== (initialLocation ?? "") ||
    photoPreview !== (authUser?.profilePhotoUrl ?? undefined);
  const inspectorProfileDirty =
    officeName !== (inspectorProfileQuery.data?.officeName ?? "") ||
    licenseNumber !== (inspectorProfileQuery.data?.licenseNumber ?? "") ||
    serviceArea !== (inspectorProfileQuery.data?.serviceArea ?? "") ||
    bio !== (inspectorProfileQuery.data?.bio ?? "") ||
    isAvailable !== (inspectorProfileQuery.data?.isAvailable ?? true);

  const newPwdValid = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(newPwd);
  const passwordDirty = currentPwd.length > 0 && newPwd.length > 0;

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
          location: location.trim() || null,
          profilePhotoUrl:
            photoPreview !== (authUser?.profilePhotoUrl ?? undefined)
              ? photoPreview ?? null
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast({
        title: "Profile updated",
        description: "Your personal details have been saved.",
      });
      await refetch();
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
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

  const handleSaveInspectorProfile = async () => {
    setSavingInspectorProfile(true);
    try {
      const res = await fetch("/api/inspectors/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeName: officeName.trim() || null,
          licenseNumber: licenseNumber.trim() || null,
          serviceArea: serviceArea.trim() || null,
          bio: bio.trim() || null,
          isAvailable,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save inspector profile");
      await inspectorProfileQuery.refetch();
      toast({
        title: "Inspector profile updated",
        description: "Your inspector profile details have been saved.",
      });
    } catch (err) {
      toast({
        title: "Could not save inspector profile",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSavingInspectorProfile(false);
    }
  };

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

  const firstInitial = (initialName.charAt(0) || "I").toUpperCase();

  return (
    <>
      <DashboardLayout
        user={user}
        navItems={inspectorNav}
        title="Profile"
        onLogout={handleLogout}
      >
      <div className="mb-6">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">Profile</h1>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="bg-gray-100/60 p-1 h-auto rounded-xl flex w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="profile" className="rounded-lg px-3 py-2 text-xs sm:text-sm">
            Profile
          </TabsTrigger>
          <TabsTrigger value="payment" className="rounded-lg px-3 py-2 text-xs sm:text-sm">
            Payment (Bank)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
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
                <span className="text-3xl font-bold text-white">{firstInitial}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                {initialName || "Inspection Officer"}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-sm text-gray-400">{initialEmail}</span>
                {authUser?.emailVerified && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Verified
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
                <SaveButton
                  disabled={!personalDirty || savingPersonal}
                  onClick={handleSavePersonal}
                >
                  {savingPersonal ? "Saving..." : "Save Changes"}
                </SaveButton>
              </div>
            </div>
            <div className="space-y-5 max-w-xl">
              <div>
                <Label>Full Name</Label>
                <TextInput
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <Label>Email</Label>
                <TextInput value={initialEmail} disabled placeholder={initialEmail} />
                <p className="mt-1.5 text-[11px] text-gray-400">
                  Email cannot be changed here. Contact admin to update your email
                  address.
                </p>
              </div>
              <div>
                <Label>Phone Number</Label>
                <TextInput
                  value={phone}
                  onChange={setPhone}
                  placeholder="+234 703 404 1184"
                  type="tel"
                />
              </div>
              <div>
                <Label>Location</Label>
                <TextInput value={location} onChange={setInspectorLocation} placeholder="e.g. Lekki, Lagos" />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-10 py-8 border-b border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Inspector Profile</h3>
              <p className="mt-1 text-xs text-gray-500">
                Update assignment and professional details.
              </p>
              <div className="mt-4">
                <SaveButton
                  disabled={!inspectorProfileDirty || savingInspectorProfile || inspectorProfileQuery.isLoading}
                  onClick={handleSaveInspectorProfile}
                >
                  {savingInspectorProfile ? "Saving..." : "Save Changes"}
                </SaveButton>
              </div>
            </div>
            <div className="space-y-5 max-w-xl">
              <div>
                <Label>Office Name</Label>
                <TextInput value={officeName} onChange={setOfficeName} placeholder="e.g. AutoCheck Hub" />
              </div>
              <div>
                <Label>License Number</Label>
                <TextInput value={licenseNumber} onChange={setLicenseNumber} placeholder="e.g. INS-04232" />
              </div>
              <div>
                <Label>Service Area</Label>
                <TextInput value={serviceArea} onChange={setServiceArea} placeholder="e.g. Ikeja, Lagos" />
              </div>
              <div>
                <Label>Bio</Label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                  placeholder="Briefly describe your inspection experience."
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Available for Assignments</p>
                  <p className="text-xs text-gray-500">Controls whether admin can assign inspections to you.</p>
                </div>
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 px-4 py-3">
                  <p className="text-xs text-gray-500">Rating</p>
                  <p className="text-lg font-bold text-gray-900">
                    {Number(inspectorProfileQuery.data?.rating ?? 0).toFixed(1)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 px-4 py-3">
                  <p className="text-xs text-gray-500">Total Inspections</p>
                  <p className="text-lg font-bold text-gray-900">
                    {inspectorProfileQuery.data?.totalInspections ?? 0}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Password Information */}
          <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-10 py-8">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Password Information
              </h3>
              <p className="mt-1 text-xs text-gray-500">Update your Password here.</p>
              <div className="mt-4">
                <SaveButton
                  disabled={!passwordDirty || savingPassword}
                  onClick={handleSavePassword}
                >
                  {savingPassword ? "Saving..." : "Save Changes"}
                </SaveButton>
              </div>
            </div>
            <div className="space-y-5 max-w-xl">
              <div>
                <Label>Current Password</Label>
                <PasswordInput
                  value={currentPwd}
                  onChange={setCurrentPwd}
                  placeholder="••••••••••"
                />
              </div>
              <div>
                <Label>New Password</Label>
                <PasswordInput
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
        </TabsContent>

        <TabsContent value="payment" className="mt-6">
          <ProfileBankTab />
        </TabsContent>
      </Tabs>
      </DashboardLayout>
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
