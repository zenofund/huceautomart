import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ChevronLeft, ChevronRight, Image as ImageIcon, Eye, EyeOff, CheckCircle2, Plus } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { AvatarCropDialog } from "@/components/dialogs/avatar-crop-dialog";

const API_BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

type SettingsTab = "profile" | "users" | "seller-approval" | "onboarding" | "audit-log";
type ApprovalStatusFilter = "all" | "pending" | "verified" | "rejected";
type UserStatusFilter = "" | "active" | "non_active";

interface SellerApprovalListItem {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  userStatus: string;
  createdAt: string;
  verificationStatus: "pending" | "verified" | "rejected";
  progress: {
    nin: "pending" | "completed";
    proof: "pending" | "completed";
    bank: "pending" | "completed";
    profile: "pending" | "completed";
    completedCount: number;
    totalCount: number;
    allCompleted: boolean;
  };
}

interface SellerApprovalListResponse {
  items: SellerApprovalListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface AdminUsersFallbackResponse {
  items: Array<{
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    businessName: string | null;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

interface StorageHealthResponse {
  provider: "cloudinary" | "local_fallback";
  cloudinaryConfigured: boolean;
  uploadFolder: string;
  missing: string[];
  localFallbackAvailable: boolean;
}

interface GoogleAuthHealthResponse {
  provider: "google";
  configured: boolean;
  callbackUrl: string;
  frontendBaseUrl: string;
  missing: string[];
}

interface SettingsUserRow {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: "buyer" | "seller" | "inspector" | "admin";
  status: string;
  createdAt: string;
}

interface SettingsUsersResponse {
  items: SettingsUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface AuditTrailItem {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  userName: string | null;
}

interface AuditTrailResponse {
  items: AuditTrailItem[];
  total: number;
  page: number;
  pageSize: number;
}

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function pageNumbers(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const first = 1;
  const last = totalPages;
  const around = [current - 1, current, current + 1].filter((p) => p > first && p < last);
  const seq: (number | "…")[] = [first];
  if ((around[0] ?? last) > first + 1) seq.push("…");
  for (const p of around) seq.push(p);
  if ((around[around.length - 1] ?? first) < last - 1) seq.push("…");
  seq.push(last);
  return seq;
}

function statusPill(status: SellerApprovalListItem["verificationStatus"]) {
  if (status === "verified") return "bg-green-50 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function UserStatusDot({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800 whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`} />
      {isActive ? "Active" : "Non-active"}
    </span>
  );
}

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

function AdminProfilePanel() {
  const { user: authUser, refetch } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const initialName = authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : "";
  const initialEmail = authUser?.email ?? "";
  const initialPhone = authUser?.phone ?? "";

  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(
    authUser?.profilePhotoUrl ?? undefined,
  );
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const storageHealthQuery = useQuery({
    queryKey: ["admin-storage-health"],
    queryFn: () => fetchJSON<StorageHealthResponse>("/storage/health"),
  });
  const googleAuthHealthQuery = useQuery({
    queryKey: ["admin-google-auth-health"],
    queryFn: () => fetchJSON<GoogleAuthHealthResponse>("/auth/google/health"),
  });

  useEffect(() => {
    if (!authUser) return;
    setFullName(`${authUser.firstName} ${authUser.lastName}`.trim());
    setPhone(authUser.phone ?? "");
    setPhotoPreview(authUser.profilePhotoUrl ?? undefined);
  }, [
    authUser?.firstName,
    authUser?.lastName,
    authUser?.phone,
    authUser?.profilePhotoUrl,
  ]);

  const personalDirty =
    fullName.trim() !== initialName ||
    phone.trim() !== (initialPhone ?? "") ||
    photoPreview !== (authUser?.profilePhotoUrl ?? undefined);

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

  const firstInitial = (initialName.charAt(0) || "A").toUpperCase();

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-7">
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
            {initialName || "Admin"}
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
              Email cannot be changed here.
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
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-10 py-8">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            Password Information
          </h3>
          <p className="mt-1 text-xs text-gray-500">Update your password here.</p>
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

      <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-10 py-8 border-t border-gray-200">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Storage Health</h3>
          <p className="mt-1 text-xs text-gray-500">
            Verify Cloudinary configuration in runtime.
          </p>
          <div className="mt-4">
            <SaveButton
              disabled={storageHealthQuery.isFetching}
              onClick={() => storageHealthQuery.refetch()}
            >
              {storageHealthQuery.isFetching ? "Checking..." : "Run Check"}
            </SaveButton>
          </div>
        </div>
        <div className="space-y-3 max-w-xl">
          {storageHealthQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : storageHealthQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Unable to fetch storage health. Ensure you are logged in as admin and API is running.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 px-4 py-3 space-y-2">
              <p className="text-sm text-gray-700">
                Provider: <span className="font-semibold">{storageHealthQuery.data?.provider}</span>
              </p>
              <p className="text-sm text-gray-700">
                Cloudinary Config:{" "}
                <span
                  className={`font-semibold ${
                    storageHealthQuery.data?.cloudinaryConfigured ? "text-green-700" : "text-amber-700"
                  }`}
                >
                  {storageHealthQuery.data?.cloudinaryConfigured ? "Ready" : "Missing Config"}
                </span>
              </p>
              <p className="text-sm text-gray-700">
                Upload Folder: <span className="font-semibold">{storageHealthQuery.data?.uploadFolder || "huce-autos"}</span>
              </p>
              {!storageHealthQuery.data?.cloudinaryConfigured && (
                <p className="text-sm text-amber-700">
                  Missing: {storageHealthQuery.data?.missing?.join(", ") || "Unknown"}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] gap-6 md:gap-10 py-8 border-t border-gray-200">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Google Auth Health</h3>
          <p className="mt-1 text-xs text-gray-500">
            Verify Google OAuth runtime configuration.
          </p>
          <div className="mt-4">
            <SaveButton
              disabled={googleAuthHealthQuery.isFetching}
              onClick={() => googleAuthHealthQuery.refetch()}
            >
              {googleAuthHealthQuery.isFetching ? "Checking..." : "Run Check"}
            </SaveButton>
          </div>
        </div>
        <div className="space-y-3 max-w-xl">
          {googleAuthHealthQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : googleAuthHealthQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Unable to fetch Google auth health. Ensure you are logged in as admin and API is running.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 px-4 py-3 space-y-2">
              <p className="text-sm text-gray-700">
                Provider: <span className="font-semibold">{googleAuthHealthQuery.data?.provider}</span>
              </p>
              <p className="text-sm text-gray-700">
                Google OAuth Config:{" "}
                <span
                  className={`font-semibold ${
                    googleAuthHealthQuery.data?.configured ? "text-green-700" : "text-amber-700"
                  }`}
                >
                  {googleAuthHealthQuery.data?.configured ? "Ready" : "Missing Config"}
                </span>
              </p>
              <p className="text-sm text-gray-700 break-all">
                Callback URL: <span className="font-semibold">{googleAuthHealthQuery.data?.callbackUrl || "—"}</span>
              </p>
              <p className="text-sm text-gray-700 break-all">
                Frontend URL: <span className="font-semibold">{googleAuthHealthQuery.data?.frontendBaseUrl || "—"}</span>
              </p>
              {!googleAuthHealthQuery.data?.configured && (
                <p className="text-sm text-amber-700">
                  Missing: {googleAuthHealthQuery.data?.missing?.join(", ") || "Unknown"}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
      </div>
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

function UsersPanel() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("");
  const [page, setPage] = useState(1);
  const [openAdd, setOpenAdd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | "inspector" | "admin">("buyer");
  const [status, setStatus] = useState<"active" | "inactive" | "suspended" | "pending_verification">("active");
  const [password, setPassword] = useState("");
  const pageSize = 10;

  const query = useQuery({
    queryKey: ["admin-settings-users", search, statusFilter, page, pageSize],
    queryFn: () =>
      fetchJSON<SettingsUsersResponse>(
        `/admin/users?role=all&search=${encodeURIComponent(search)}&status=${statusFilter}&page=${page}&pageSize=${pageSize}`,
      ),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmed = fullName.trim();
      const firstSpace = trimmed.indexOf(" ");
      const firstName = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
      const lastName = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
      if (!firstName || !lastName) {
        throw new Error("Please enter both first and last name");
      }
      const res = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          role,
          status,
          password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to create user");
      return json;
    },
    onSuccess: () => {
      toast({ title: "User created successfully" });
      setOpenAdd(false);
      setFullName("");
      setEmail("");
      setPhone("");
      setRole("buyer");
      setStatus("active");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["admin-settings-users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
    },
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => pageNumbers(page, totalPages), [page, totalPages]);
  const items = query.data?.items ?? [];

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-gray-100">
          <h2 className="text-lg font-black text-gray-900 shrink-0">Users ({total})</h2>
          <div className="relative flex-1 min-w-0 sm:max-w-md sm:mx-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search here..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 rounded-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as UserStatusFilter);
              setPage(1);
            }}
            className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="non_active">Non-active</option>
          </select>
          <button
            onClick={() => setOpenAdd(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="w-[72px] px-3 py-3 font-medium whitespace-nowrap">ID</th>
                <th className="px-3 py-3 font-medium">Full Name</th>
                <th className="px-3 py-3 font-medium">Email Address</th>
                <th className="px-3 py-3 font-medium">Phone Number</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Registration Date</th>
                <th className="w-[112px] px-3 py-3 font-medium whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {query.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="p-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-sm text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-gray-50/60"
                    onClick={() => setLocation(`/admin/settings/users/${row.id}`)}
                  >
                    <td className="w-[72px] px-3 py-4 text-gray-500 font-medium whitespace-nowrap">{row.id}</td>
                    <td className="px-3 py-4 font-semibold text-gray-900">
                      {`${row.firstName} ${row.lastName}`.trim() || "—"}
                    </td>
                    <td className="px-3 py-4 text-gray-700 break-words">{row.email}</td>
                    <td className="px-3 py-4 text-gray-700">{row.phone ?? "—"}</td>
                    <td className="px-3 py-4 text-gray-700 capitalize">{row.role.replace("_", " ")}</td>
                    <td className="px-3 py-4 text-gray-700 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="w-[112px] px-3 py-4 whitespace-nowrap"><UserStatusDot status={row.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-gray-100">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <div className="flex items-center gap-1 flex-wrap justify-center">
              {pages.map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[34px] h-8 px-2 rounded text-sm font-medium ${
                      p === page
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6">
          <div>
            <button
              onClick={() => setOpenAdd(false)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 mb-5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <h2 className="text-xl font-black text-gray-900 mb-4">Add User</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter Full Name"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter Email Address"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter Phone Number"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "buyer" | "seller" | "inspector" | "admin")}
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none bg-white focus:ring-2 focus:ring-primary/20"
                >
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="inspector">Inspector</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "active" | "inactive" | "suspended" | "pending_verification")}
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none bg-white focus:ring-2 focus:ring-primary/20"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending_verification">Pending Verification</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Password"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending || !fullName.trim() || !email.trim() || !password.trim()}
                className="w-full h-11 rounded-xl bg-[#046C4E] hover:bg-[#045c42] text-white text-sm font-semibold disabled:opacity-50"
              >
                {createMutation.isPending ? "Proceeding..." : "Proceed"}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SellerApprovalPanel() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApprovalStatusFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const listQuery = useQuery({
    queryKey: ["admin-seller-approvals", search, status, page, pageSize],
    queryFn: async () => {
      try {
        return await fetchJSON<SellerApprovalListResponse>(
          `/admin/settings/seller-approvals?search=${encodeURIComponent(search)}&status=${status}&page=${page}&pageSize=${pageSize}`,
        );
      } catch {
        const fallback = await fetchJSON<AdminUsersFallbackResponse>(
          `/admin/users?role=seller&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`,
        );
        const items: SellerApprovalListItem[] = fallback.items.map((row) => ({
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          businessName: row.businessName,
          userStatus: "pending_verification",
          createdAt: row.createdAt,
          verificationStatus: "pending",
          progress: {
            nin: "pending",
            proof: "pending",
            bank: "pending",
            profile: "pending",
            completedCount: 0,
            totalCount: 4,
            allCompleted: false,
          },
        }));
        return {
          items,
          total: fallback.total,
          page: fallback.page,
          pageSize: fallback.pageSize,
        };
      }
    },
    placeholderData: keepPreviousData,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => pageNumbers(page, totalPages), [page, totalPages]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-gray-100">
        <h2 className="text-lg font-black text-gray-900 shrink-0">
          Seller Approval ({total})
        </h2>
        <div className="relative flex-1 min-w-0 sm:max-w-md sm:mx-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search here..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 rounded-full"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ApprovalStatusFilter);
            setPage(1);
          }}
          className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="w-[72px] px-3 py-3 font-medium whitespace-nowrap">ID</th>
              <th className="px-3 py-3 font-medium">Full Name</th>
              <th className="px-3 py-3 font-medium">Email Address</th>
              <th className="px-3 py-3 font-medium">Phone Number</th>
              <th className="px-3 py-3 font-medium">Business Name</th>
              <th className="px-3 py-3 font-medium">Registration Date</th>
              <th className="px-3 py-3 font-medium">Progress</th>
              <th className="w-[112px] px-3 py-3 font-medium whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="p-4">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))
            ) : listQuery.isError ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-sm text-red-600">
                  Failed to fetch sellers. Please refresh or restart the API server.
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-sm text-gray-500">
                  No seller verification records found
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setLocation(`/admin/settings/seller-approval/${row.id}`)}
                  className="cursor-pointer hover:bg-gray-50/60"
                >
                  <td className="w-[72px] px-3 py-4 text-gray-500 font-medium whitespace-nowrap">{row.id}</td>
                  <td className="px-3 py-4 font-semibold text-gray-900">
                    {`${row.firstName} ${row.lastName}`.trim() || "—"}
                  </td>
                  <td className="px-3 py-4 text-gray-700 break-words">{row.email}</td>
                  <td className="px-3 py-4 text-gray-700">{row.phone ?? "—"}</td>
                  <td className="px-3 py-4 text-gray-700 break-words">{row.businessName ?? "—"}</td>
                  <td className="px-3 py-4 text-gray-700 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-4 text-gray-700 whitespace-nowrap">
                    {row.progress.completedCount}/{row.progress.totalCount} completed
                  </td>
                  <td className="w-[112px] px-3 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusPill(row.verificationStatus)}`}>
                      {row.verificationStatus}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {pages.map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-[34px] h-8 px-2 rounded text-sm font-medium ${
                    p === page
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {p}
                </button>
              ),
            )}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function formatAuditAction(action: string) {
  return action
    .replace(/^ADMIN_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAuditDetails(details: Record<string, unknown> | null) {
  if (!details) return "Activity recorded";
  if (typeof details.status === "string") {
    return `Status changed to ${details.status}`;
  }
  if (typeof details.role === "string") {
    return `Role: ${details.role}`;
  }
  if (typeof details.email === "string") {
    return details.email;
  }
  return "Activity recorded";
}

function AuditLogPanel() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const query = useQuery({
    queryKey: ["admin-audit-log", search, page, pageSize],
    queryFn: () =>
      fetchJSON<AuditTrailResponse>(
        `/admin/audit-log?search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`,
      ),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => pageNumbers(page, totalPages), [page, totalPages]);
  const items = query.data?.items ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-gray-100">
        <h2 className="text-lg font-black text-gray-900 shrink-0">Audit Log</h2>
        <div className="relative flex-1 min-w-0 sm:max-w-md sm:mx-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search here..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 rounded-full"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-5 py-3 font-medium">ID</th>
              <th className="px-3 py-3 font-medium">Date & Time</th>
              <th className="px-3 py-3 font-medium">Action Performed</th>
              <th className="px-3 py-3 font-medium">Details</th>
              <th className="px-3 py-3 font-medium">IP Address</th>
              <th className="px-5 py-3 font-medium">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {query.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="p-4">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-sm text-gray-500">
                  No audit trail found
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 text-gray-700 font-semibold">{String(row.id).padStart(2, "0")}</td>
                  <td className="px-3 py-4 text-gray-900 font-semibold whitespace-nowrap">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-3 py-4 text-gray-900 font-semibold">
                    {formatAuditAction(row.action)}
                  </td>
                  <td className="px-3 py-4 text-gray-700">
                    {formatAuditDetails(row.details)}
                  </td>
                  <td className="px-3 py-4 text-gray-700">{row.ipAddress ?? "—"}</td>
                  <td className="px-5 py-4 text-gray-700">{row.userName ?? "System"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {pages.map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-[34px] h-8 px-2 rounded text-sm font-medium ${
                    p === page
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {p}
                </button>
              ),
            )}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

interface OnboardingSlide {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  order: number;
  isActive: boolean;
}

function OnboardingPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openAdd, setOpenAdd] = useState(false);
  const [editingSlide, setEditingSlide] = useState<OnboardingSlide | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [order, setOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const fileRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["admin-onboarding-slides"],
    queryFn: () => fetchJSON<OnboardingSlide[]>("/admin/onboarding"),
  });

  const resetForm = () => {
    setEditingSlide(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setOrder(0);
    setIsActive(true);
    setOpenAdd(false);
  };

  const handleEdit = (slide: OnboardingSlide) => {
    setEditingSlide(slide);
    setTitle(slide.title);
    setDescription(slide.description);
    setImageUrl(slide.imageUrl);
    setOrder(slide.order);
    setIsActive(slide.isActive);
    setOpenAdd(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title || !description || !imageUrl) {
        throw new Error("Title, description, and image are required");
      }
      const url = editingSlide
        ? `${API_BASE}/admin/onboarding/${editingSlide.id}`
        : `${API_BASE}/admin/onboarding`;
      const method = editingSlide ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          imageUrl,
          order,
          isActive,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to save slide");
      return json;
    },
    onSuccess: () => {
      toast({ title: editingSlide ? "Slide updated" : "Slide created" });
      resetForm();
      qc.invalidateQueries({ queryKey: ["admin-onboarding-slides"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/admin/onboarding/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete slide");
    },
    onSuccess: () => {
      toast({ title: "Slide deleted" });
      qc.invalidateQueries({ queryKey: ["admin-onboarding-slides"] });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const { servingUrl } = await uploadFile(f);
      setImageUrl(servingUrl);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload image.",
        variant: "destructive",
      });
    }
  };

  const slides = query.data ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-black text-gray-900 shrink-0">Mobile App Onboarding</h2>
          <p className="text-sm text-gray-500">Manage the slides shown when users first open the mobile app.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setOpenAdd(true);
          }}
          disabled={slides.length >= 5}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add Slide {slides.length >= 5 ? "(Max 5)" : ""}
        </button>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {query.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)
        ) : slides.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-gray-500">
            No onboarding slides configured.
          </div>
        ) : (
          slides.map((slide) => (
            <div key={slide.id} className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col relative">
              {!slide.isActive && (
                <div className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm z-10">
                  INACTIVE
                </div>
              )}
              <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm z-10">
                Order: {slide.order}
              </div>
              <div className="h-48 w-full bg-gray-100 shrink-0">
                <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-gray-900 line-clamp-1">{slide.title}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 flex-1">{slide.description}</p>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleEdit(slide)}
                    className="flex-1 py-2 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this slide?")) {
                        deleteMutation.mutate(slide.id);
                      }
                    }}
                    className="flex-1 py-2 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={openAdd} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <h2 className="text-xl font-black text-gray-900 mb-4">
            {editingSlide ? "Edit Slide" : "Add Slide"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Image</label>
              {imageUrl ? (
                <div className="relative h-32 w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200 mb-2">
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-gray-100 text-red-500"
                  >
                    <Plus className="h-4 w-4 rotate-45" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="h-32 w-full rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-primary/50 transition mb-2"
                >
                  <ImageIcon className="h-6 w-6 mb-2" />
                  <span className="text-sm font-medium">Click to upload image</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Find Your Dream Car"
                className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short descriptive text for this slide..."
                className="w-full h-20 p-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Order (0 = First)</label>
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex-1 flex flex-col justify-end pb-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                  />
                  Active (Visible)
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={saveMutation.isPending || !title.trim() || !description.trim() || !imageUrl}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-semibold mt-4 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving..." : "Save Slide"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("profile");
  const settingTabs = [
    { key: "profile", label: "Profile" },
    { key: "users", label: "Users" },
    { key: "seller-approval", label: "Seller Approval" },
    { key: "onboarding", label: "App Onboarding" },
    { key: "audit-log", label: "Audit Log" },
  ] as const;

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        <AdminLocalTabs
          tabs={settingTabs.map((t) => ({ key: t.key, label: t.label }))}
          activeKey={tab}
          onChange={(key) => setTab(key as SettingsTab)}
        />

        {tab === "profile" && <AdminProfilePanel />}

        {tab === "users" && <UsersPanel />}

        {tab === "seller-approval" && <SellerApprovalPanel />}

        {tab === "onboarding" && <OnboardingPanel />}

        {tab === "audit-log" && <AuditLogPanel />}
      </div>
    </AdminLayout>
  );
}
