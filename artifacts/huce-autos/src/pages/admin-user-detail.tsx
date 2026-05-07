import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  MessageSquare,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminLocalTabs } from "@/components/admin-local-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/format";

const API_BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface UserDetail {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: "buyer" | "seller" | "inspector" | "admin";
    status: string;
    profilePhotoUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  stats: Record<string, number>;
}

type TabKey =
  | "offers"
  | "purchases"
  | "inspections"
  | "transactions"
  | "tickets"
  | "listings"
  | "feedback";

interface SellerProfile {
  businessName: string | null;
  ninNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  location: string | null;
}

interface InspectorProfile {
  officeName: string | null;
  licenseNumber: string | null;
  serviceArea: string | null;
  bio: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  rating: number | null;
  totalInspections: number | null;
  isAvailable: boolean | null;
}

interface Tab {
  key: TabKey;
  label: string;
}

function formatDateTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase()
    .replace(" ", "");
  return `${date}, ${time}`;
}

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusPill({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        isActive
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isActive ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {isActive ? "Active" : "Non-active"}
    </span>
  );
}

function StatusDot({ tone, label }: { tone: "green" | "yellow" | "red" | "gray"; label: string }) {
  const map: Record<string, string> = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    gray: "bg-gray-400",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800 whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${map[tone]}`} />
      {label}
    </span>
  );
}

function tone(s: string): "green" | "yellow" | "red" | "gray" {
  if (["accepted", "completed", "active", "open", "paid"].includes(s)) return "green";
  if (["pending", "countered", "assigned", "in_progress"].includes(s)) return "yellow";
  if (["declined", "cancelled", "expired", "failed", "deleted", "suspended", "closed"].includes(s))
    return "red";
  return "gray";
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

const TABS_BY_ROLE: Record<string, Tab[]> = {
  buyer: [
    { key: "offers", label: "Offers" },
    { key: "purchases", label: "Purchases" },
    { key: "inspections", label: "Inspection" },
    { key: "transactions", label: "Transaction History" },
    { key: "tickets", label: "Ticket" },
  ],
  seller: [
    { key: "listings", label: "Listings" },
    { key: "purchases", label: "Purchases" },
    { key: "offers", label: "Offers" },
    { key: "transactions", label: "Transaction History" },
    { key: "tickets", label: "Ticket" },
    { key: "feedback", label: "Seller Feedback" },
  ],
  inspector: [
    { key: "inspections", label: "Inspections" },
    { key: "transactions", label: "Transaction History" },
  ],
};

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: () => fetchJSON<UserDetail>(`/admin/users/${id}`),
    enabled: !!id,
  });

  const role = detailQuery.data?.user.role ?? "buyer";
  const tabs = TABS_BY_ROLE[role] ?? TABS_BY_ROLE.buyer;
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const currentTab = tabs.find((t) => t.key === activeTab) ?? tabs[0];

  useEffect(() => {
    if (activeTab && !tabs.find((t) => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const isActive = detailQuery.data?.user.status === "active";

  const [editOpen, setEditOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/admin/users/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User activated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1400px]">
        {/* Top action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <button
            onClick={() => setLocation("/admin/users")}
            data-testid="button-back"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 self-start"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              data-testid="button-edit-profile"
              disabled={!detailQuery.data}
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" /> Edit Profile
            </button>
            <button
              data-testid="button-send-message"
              disabled={!detailQuery.data}
              onClick={() => setMessageOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              <MessageSquare className="h-4 w-4" /> Send Message
            </button>
            <button
              data-testid="button-toggle-status"
              disabled={reactivateMutation.isPending || !detailQuery.data}
              onClick={() => {
                if (isActive) setDeactivateOpen(true);
                else reactivateMutation.mutate();
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 ${
                isActive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {isActive ? "Deactivate User" : "Activate User"}
            </button>
          </div>
        </div>

        {/* Personal Information card */}
        {detailQuery.isLoading ? (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-5">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : detailQuery.data ? (
          <PersonalInfoCard
            data={detailQuery.data}
            name={`${detailQuery.data.user.firstName} ${detailQuery.data.user.lastName}`.trim()}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-5 text-sm text-gray-500">
            User not found.
          </div>
        )}

        {/* Tabs */}
        <AdminLocalTabs
          tabs={tabs.map((t) => ({ key: t.key, label: t.label }))}
          activeKey={currentTab.key}
          onChange={(key) => setActiveTab(key as TabKey)}
          getButtonTestId={(key) => `tab-${key}`}
        />

        <TabContent userId={id} role={role} tab={currentTab.key} title={currentTab.label} />
      </div>

      {detailQuery.data && (
        <>
          <EditProfileDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            user={detailQuery.data.user}
            userId={id}
          />
          <DeactivateDialog
            open={deactivateOpen}
            onOpenChange={setDeactivateOpen}
            role={role}
            userId={id}
          />
          <SendMessageDialog
            open={messageOpen}
            onOpenChange={setMessageOpen}
            userId={id}
            recipientName={`${detailQuery.data.user.firstName} ${detailQuery.data.user.lastName}`.trim()}
          />
        </>
      )}
    </AdminLayout>
  );
}

function EditProfileDialog({
  open,
  onOpenChange,
  user,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: UserDetail["user"];
  userId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(`${user.firstName} ${user.lastName}`.trim());
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [status, setStatus] = useState<string>(user.status);
  const [businessName, setBusinessName] = useState<string>("");
  const [officeName, setOfficeName] = useState<string>("");
  const [licenseNumber, setLicenseNumber] = useState<string>("");
  const [serviceArea, setServiceArea] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [inspectorAvailable, setInspectorAvailable] = useState<string>("true");

  const isSeller = user.role === "seller";
  const isInspector = user.role === "inspector";
  const profileQuery = useQuery({
    queryKey: ["admin-seller-profile", user.id],
    queryFn: () => fetchJSON<SellerProfile | null>(`/admin/users/${user.id}/seller-profile`),
    enabled: open && isSeller,
  });
  const inspectorProfileQuery = useQuery({
    queryKey: ["admin-inspector-profile-edit", user.id],
    queryFn: () => fetchJSON<InspectorProfile | null>(`/admin/users/${user.id}/inspector-profile`),
    enabled: open && isInspector,
  });

  useEffect(() => {
    if (open) {
      setFullName(`${user.firstName} ${user.lastName}`.trim());
      setEmail(user.email);
      setPhone(user.phone ?? "");
      setStatus(user.status);
    }
  }, [open, user]);

  useEffect(() => {
    if (open && isSeller && profileQuery.data) {
      setBusinessName(profileQuery.data.businessName ?? "");
    }
  }, [open, isSeller, profileQuery.data]);

  useEffect(() => {
    if (open && isInspector && inspectorProfileQuery.data) {
      setOfficeName(inspectorProfileQuery.data.officeName ?? "");
      setLicenseNumber(inspectorProfileQuery.data.licenseNumber ?? "");
      setServiceArea(inspectorProfileQuery.data.serviceArea ?? "");
      setBio(inspectorProfileQuery.data.bio ?? "");
      setInspectorAvailable(String(inspectorProfileQuery.data.isAvailable ?? true));
    }
  }, [open, isInspector, inspectorProfileQuery.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = fullName.trim();
      const sp = trimmed.indexOf(" ");
      const firstName = sp === -1 ? trimmed : trimmed.slice(0, sp);
      const lastName = sp === -1 ? "" : trimmed.slice(sp + 1);
      const payload: Record<string, unknown> = { firstName, lastName, email, phone, status };
      if (isSeller) payload.businessName = businessName.trim() || null;
      if (isInspector) {
        payload.officeName = officeName.trim() || null;
        payload.licenseNumber = licenseNumber.trim() || null;
        payload.serviceArea = serviceArea.trim() || null;
        payload.bio = bio.trim() || null;
        payload.isAvailable = inspectorAvailable === "true";
      }
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to update");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Profile updated" });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 mb-1 self-start hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <DialogTitle className="text-xl font-black">Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="full-name" className="text-sm font-semibold">Full Name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              data-testid="input-full-name"
              className="mt-1.5"
            />
          </div>
          {isSeller && (
            <div>
              <Label htmlFor="business-name" className="text-sm font-semibold">Business Name</Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                data-testid="input-business-name"
                className="mt-1.5"
                placeholder="God's Autos"
              />
            </div>
          )}
          {isInspector && (
            <>
              <div>
                <Label htmlFor="office-name" className="text-sm font-semibold">Office Name</Label>
                <Input
                  id="office-name"
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="license-number" className="text-sm font-semibold">License Number</Label>
                <Input
                  id="license-number"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="service-area" className="text-sm font-semibold">Service Area</Label>
                <Input
                  id="service-area"
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="bio" className="text-sm font-semibold">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Assignment Availability</Label>
                <Select value={inspectorAvailable} onValueChange={setInspectorAvailable}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Available</SelectItem>
                    <SelectItem value="false">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div>
            <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-email"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="phone" className="text-sm font-semibold">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="input-phone"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm font-semibold">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1.5" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending_verification">Pending Verification</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <button
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel-edit"
            className="px-4 py-2.5 rounded-md bg-red-100 text-red-700 font-semibold hover:bg-red-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !fullName.trim() || !email.trim()}
            data-testid="button-confirm-edit"
            className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Saving..." : "Proceed"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
  open,
  onOpenChange,
  role,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: string;
  userId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [duration, setDuration] = useState("3");

  useEffect(() => {
    if (open) setDuration("3");
  }, [open]);

  const options = useMemo(() => {
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    const mk = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return `${days} Days (${fmt(d)})`;
    };
    return [
      { value: "3", label: mk(3) },
      { value: "7", label: mk(7) },
      { value: "30", label: mk(30) },
      { value: "0", label: "Permanent" },
    ];
  }, [open]);

  const roleLabel =
    role === "buyer" ? "Buyer" : role === "seller" ? "Seller" : role === "inspector" ? "Inspector" : "User";

  const mutation = useMutation({
    mutationFn: async () => {
      const days = Number(duration);
      const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended", durationDays: days > 0 ? days : null }),
      });
      if (!res.ok) throw new Error("Failed to deactivate");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: `${roleLabel} deactivated` });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to deactivate", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 mb-1 self-start hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <DialogTitle className="text-xl font-black">Confirm Deactivation of {roleLabel}s</DialogTitle>
          <p className="text-sm text-gray-500">
            Are you sure you want to deactivate this {roleLabel.toLowerCase()}?
          </p>
        </DialogHeader>
        <div className="pt-2">
          <Label className="text-sm font-semibold">Duration</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="mt-1.5" data-testid="select-duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <button
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel-deactivate"
            className="px-4 py-2.5 rounded-md bg-red-100 text-red-700 font-semibold hover:bg-red-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid="button-confirm-deactivate"
            className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Confirming..." : "Confirm"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SendMessageDialog({
  open,
  onOpenChange,
  userId,
  recipientName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  recipientName: string;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (open) {
      setSubject("");
      setContent("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/admin/users/${userId}/message`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to send");
      }
    },
    onSuccess: () => {
      toast({ title: "Message sent" });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 mb-1 self-start hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <DialogTitle className="text-xl font-black">Send Message</DialogTitle>
          {recipientName && (
            <p className="text-sm text-gray-500">To: {recipientName}</p>
          )}
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="msg-subject" className="text-sm font-semibold">Subject (optional)</Label>
            <Input
              id="msg-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Account update, Inquiry, etc."
              data-testid="input-message-subject"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="msg-body" className="text-sm font-semibold">Message</Label>
            <Textarea
              id="msg-body"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your message here..."
              rows={5}
              data-testid="input-message-body"
              className="mt-1.5 resize-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <button
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel-message"
            className="px-4 py-2.5 rounded-md bg-red-100 text-red-700 font-semibold hover:bg-red-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !content.trim()}
            data-testid="button-send-message-confirm"
            className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Sending..." : "Send Message"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <p className="text-[11px] text-gray-400 mb-0.5 truncate">{label}</p>
      <p
        className="text-sm font-bold text-gray-900 truncate"
        title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function PersonalInfoCard({ data, name }: { data: UserDetail; name: string }) {
  if (data.user.role === "seller") {
    return <SellerInfoCard data={data} name={name} />;
  }
  if (data.user.role === "inspector") {
    return <InspectorInfoCard data={data} name={name} />;
  }
  return <BasicInfoCard data={data} name={name} />;
}

function CardShell({
  name,
  u,
  children,
}: {
  name: string;
  u: UserDetail["user"];
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 mb-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8">
        <div className="flex items-start gap-4 sm:gap-6 shrink-0">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 ring-4 ring-primary/10">
            {u.profilePhotoUrl && <AvatarImage src={u.profilePhotoUrl} alt={name} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-black">
              {(u.firstName?.[0] ?? "?")}{(u.lastName?.[0] ?? "")}
            </AvatarFallback>
          </Avatar>
          <div className="sm:max-w-[160px]">
            <h3 className="text-base font-black text-gray-900">Personal Information</h3>
            <p className="text-xs text-gray-500 mt-0.5">User's personal details here.</p>
          </div>
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function BasicInfoCard({ data, name }: { data: UserDetail; name: string }) {
  const u = data.user;
  const s = data.stats;
  const role = u.role;

  const cells: { label: string; value: React.ReactNode }[] = [
    { label: "ID", value: u.id },
    { label: "Name", value: name || "—" },
    { label: "Email", value: u.email },
    { label: "Phone Number", value: u.phone ?? "—" },
  ];

  if (role === "buyer") {
    cells.push(
      { label: "Offers Submitted", value: s.offersSubmitted ?? 0 },
      { label: "Total Purchases", value: s.totalPurchases ?? 0 },
    );
  } else if (role === "inspector") {
    cells.push(
      { label: "Assigned", value: s.assigned ?? 0 },
      { label: "Completed", value: s.completed ?? 0 },
    );
  }

  cells.push(
    { label: "Registration Date", value: formatDateTime(u.createdAt) },
    { label: "Last Login", value: formatDateTime(u.updatedAt) },
  );

  if (role === "buyer") cells.push({ label: "Inspections", value: s.inspections ?? 0 });
  cells.push({ label: "Status", value: <StatusPill status={u.status} /> });

  return (
    <CardShell name={name} u={u}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-5">
        {cells.map((c) => (
          <InfoCell key={c.label} label={c.label} value={c.value} />
        ))}
      </div>
    </CardShell>
  );
}

function SellerInfoCard({ data, name }: { data: UserDetail; name: string }) {
  const u = data.user;
  const s = data.stats;

  const profileQuery = useQuery({
    queryKey: ["admin-seller-profile", u.id],
    queryFn: () => fetchJSON<SellerProfile | null>(`/admin/users/${u.id}/seller-profile`),
    enabled: u.role === "seller",
  });
  const p = profileQuery.data ?? null;

  const accountDetails =
    p && (p.bankName || p.bankAccountNumber || p.bankAccountName) ? (
      <span className="block leading-snug">
        <span className="block">{p.bankName ?? "—"}</span>
        <span className="block">{p.bankAccountNumber ?? "—"}</span>
        <span className="block text-gray-500 font-semibold">{p.bankAccountName ?? "—"}</span>
      </span>
    ) : (
      "—"
    );

  return (
    <CardShell name={name} u={u}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-5">
        <InfoCell label="ID" value={u.id} />
        <InfoCell label="Name" value={name || "—"} />
        <InfoCell label="Business Name" value={p?.businessName ?? "—"} />
        <InfoCell label="Email" value={u.email} />
        <InfoCell label="Phone Number" value={u.phone ?? "—"} />
        <InfoCell label="Total Listing" value={s.totalListings ?? 0} />
        <InfoCell label="Total Car Sold" value={s.carsSold ?? 0} />
        <InfoCell label="Total Car UnSold" value={s.carsUnsold ?? 0} />

        <InfoCell label="Registration Date" value={formatDateTime(u.createdAt)} />
        <InfoCell label="Last Login" value={formatDateTime(u.updatedAt)} />
        <InfoCell label="Account Details" value={accountDetails} className="row-span-1 col-span-1" />
        <InfoCell label="NIN" value={p?.ninNumber ?? "—"} />
        <InfoCell label="Address" value={p?.location ?? "—"} />

        <InfoCell label="Total Revenue" value={formatNaira(Number(s.totalRevenue ?? 0))} />
        <InfoCell label="Status" value={<StatusPill status={u.status} />} />
      </div>
    </CardShell>
  );
}

function InspectorInfoCard({ data, name }: { data: UserDetail; name: string }) {
  const u = data.user;
  const s = data.stats;

  const profileQuery = useQuery({
    queryKey: ["admin-inspector-profile", u.id],
    queryFn: () => fetchJSON<InspectorProfile | null>(`/admin/users/${u.id}/inspector-profile`),
    enabled: u.role === "inspector",
  });
  const p = profileQuery.data ?? null;

  const accountDetails =
    p && (p.bankName || p.bankAccountNumber || p.bankAccountName) ? (
      <span className="block leading-snug">
        <span className="block">{p.bankName ?? "—"}</span>
        <span className="block">{p.bankAccountNumber ?? "—"}</span>
        <span className="block text-gray-500 font-semibold">{p.bankAccountName ?? "—"}</span>
      </span>
    ) : (
      "—"
    );

  return (
    <CardShell name={name} u={u}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-5">
        <InfoCell label="ID" value={u.id} />
        <InfoCell label="Inspection Name" value={name || "—"} />
        <InfoCell label="Office Name" value={p?.officeName ?? "—"} />
        <InfoCell label="License Number" value={p?.licenseNumber ?? "—"} />
        <InfoCell label="Service Area" value={p?.serviceArea ?? "—"} />
        <InfoCell label="Email" value={u.email} />
        <InfoCell label="Phone Number" value={u.phone ?? "—"} />
        <InfoCell label="Total Assigned Inspections" value={s.assigned ?? 0} />

        <InfoCell label="Revenue" value={formatNaira(Number(s.totalRevenue ?? 0))} />
        <InfoCell label="Availability" value={p?.isAvailable ? "Available" : "Unavailable"} />
        <InfoCell label="Rating" value={Number(p?.rating ?? 0).toFixed(1)} />
        <InfoCell label="Total Inspections" value={p?.totalInspections ?? 0} />
        <InfoCell label="Bio" value={p?.bio ?? "—"} />
        <InfoCell label="Registration Date" value={formatDateTime(u.createdAt)} />
        <InfoCell label="Last Login" value={formatDateTime(u.updatedAt)} />
        <InfoCell label="Account Details" value={accountDetails} />
        <InfoCell label="Status" value={<StatusPill status={u.status} />} />
      </div>
    </CardShell>
  );
}

interface PagedResp<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function TabContent({
  userId,
  role,
  tab,
  title,
}: {
  userId: string;
  role: string;
  tab: TabKey;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // reset page when tab changes
  useEffect(() => {
    setPage(1);
    setSearch("");
  }, [tab]);

  const apiTab =
    tab === "transactions"
      ? role === "inspector"
        ? "inspections"
        : "purchases"
      : tab;
  const groupParam = tab === "feedback" ? "&groupBy=day" : "";
  const path = `/admin/users/${userId}/${apiTab}?role=${role}&search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}${groupParam}`;

  const query = useQuery<PagedResp<Record<string, unknown>>>({
    queryKey: ["admin-user-tab", userId, role, tab, search, page],
    queryFn: () => fetchJSON(path),
    placeholderData: keepPreviousData,
    enabled: !!userId,
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = query.data?.items ?? [];
  const pages = pageNumbers(page, totalPages);

  const [feedbackOpen, setFeedbackOpen] = useState<{ dayKey: string; createdAt: string; reviews: Record<string, unknown>[] } | null>(null);

  // Clear any stale dialog state when navigating away/changing inputs
  useEffect(() => {
    setFeedbackOpen(null);
  }, [tab, search, page]);

  const groupedFeedback = useMemo(() => {
    if (tab !== "feedback") return [] as { dayKey: string; createdAt: string; reviews: Record<string, unknown>[] }[];
    return items.map((it) => ({
      dayKey: String(it.dayKey ?? ""),
      createdAt: String(it.createdAt ?? ""),
      reviews: (it.reviews as Record<string, unknown>[] | undefined) ?? [],
    }));
  }, [tab, items]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-gray-100">
        <h2 className="text-lg font-black text-gray-900 shrink-0">{title}</h2>
        <div className="relative flex-1 min-w-0 sm:max-w-md sm:mx-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Search here..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid={`input-search-${tab}`}
            className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white"
          />
        </div>
        {role === "inspector" && tab === "transactions" && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <a
              href={`/api/admin/users/${userId}/transactions/export?role=inspector`}
              target="_blank"
              rel="noreferrer"
              data-testid="button-generate-all-tx"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Generate All
            </a>
            <button
              type="button"
              data-testid="button-filter-tx"
              className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50"
              aria-label="Filter"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <TableHead tab={tab} role={role} />
          <tbody className="divide-y divide-gray-100">
            {query.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="p-4">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-sm text-gray-500">
                  No {title.toLowerCase()} found
                </td>
              </tr>
            ) : tab === "feedback" ? (
              groupedFeedback.map((g, idx) => (
                <FeedbackRow
                  key={g.dayKey}
                  idx={idx + (page - 1) * pageSize}
                  group={g}
                  onView={() => setFeedbackOpen({ dayKey: g.dayKey, createdAt: g.createdAt, reviews: g.reviews })}
                />
              ))
            ) : (
              items.map((row, idx) => (
                <TableRow key={String(row.id ?? idx)} tab={tab} role={role} row={row} idx={idx + (page - 1) * pageSize} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <FeedbackDialog
        open={feedbackOpen !== null}
        onOpenChange={(v) => { if (!v) setFeedbackOpen(null); }}
        group={feedbackOpen as { dayKey: string; createdAt: string; reviews: Record<string, unknown>[] } | null}
      />

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50 order-2 sm:order-1"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-1 order-1 sm:order-2 flex-wrap justify-center">
            {pages.map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">…</span>
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
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50 order-3"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 font-medium first:pl-5 last:pr-5">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-4 text-gray-700 first:pl-5 last:pr-5 ${className ?? ""}`}>{children}</td>;
}

function TableHead({ tab, role }: { tab: TabKey; role: string }) {
  const cls = "text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100";
  if (tab === "offers") {
    return (
      <thead><tr className={cls}>
        <Th>TXN ID</Th><Th>Car Make</Th>
        <Th>{role === "seller" ? "Name" : "Seller Name"}</Th>
        <Th>Offer Amount</Th><Th>Offer Date</Th>
        <Th>{role === "seller" ? "Number of Offers" : "Inspection Status"}</Th>
        <Th>Status</Th>
      </tr></thead>
    );
  }
  if (tab === "feedback") {
    return (
      <thead><tr className={cls}>
        <Th>TXN ID</Th><Th>Date</Th><Th>Feedback</Th><Th>{""}</Th>
      </tr></thead>
    );
  }
  if (tab === "purchases") {
    return (
      <thead><tr className={cls}>
        <Th>TXN ID</Th><Th>Car Make</Th>
        <Th>{role === "seller" ? "Name" : "Seller Name"}</Th>
        <Th>Purchase Amount</Th><Th>Purchase Date</Th><Th>Status</Th>
      </tr></thead>
    );
  }
  if (tab === "transactions") {
    if (role === "inspector") {
      return (
        <thead><tr className={cls}>
          <Th>TXN ID</Th><Th>Description</Th><Th>Seller Name</Th>
          <Th>Amount</Th><Th>Name</Th><Th>Transaction Date</Th>
          <Th>Status</Th><Th>Download Transaction</Th>
        </tr></thead>
      );
    }
    return (
      <thead><tr className={cls}>
        <Th>TXN ID</Th><Th>Car Make</Th>
        <Th>{role === "seller" ? "Name" : "Seller Name"}</Th>
        <Th>Amount</Th><Th>Date</Th><Th>Status</Th>
      </tr></thead>
    );
  }
  if (tab === "inspections") {
    if (role === "inspector") {
      return (
        <thead><tr className={cls}>
          <Th>TXN ID</Th><Th>Car Make</Th><Th>Seller Name</Th><Th>Name</Th>
          <Th>Inspection Earnings</Th><Th>Inspection Result</Th>
          <Th>Date</Th><Th>Status</Th>
        </tr></thead>
      );
    }
    return (
      <thead><tr className={cls}>
        <Th>TXN ID</Th><Th>Car Make</Th>
        <Th>Seller Name</Th>
        <Th>Inspection Amount</Th><Th>Inspection Result</Th>
        <Th>Scheduled Time/ Date</Th><Th>Status</Th>
      </tr></thead>
    );
  }
  if (tab === "tickets") {
    return (
      <thead><tr className={cls}>
        <Th>TXN ID</Th><Th>Received Date</Th><Th>Issue Type</Th><Th>Priority</Th>
        <Th>Assigned Customer Rep</Th><Th>Last Response</Th><Th>Status</Th>
      </tr></thead>
    );
  }
  if (tab === "listings") {
    return (
      <thead><tr className={cls}>
        <Th>TXN ID</Th><Th>Car Make</Th><Th>Car Model</Th><Th>Amount</Th>
        <Th>Upload Date</Th><Th>View</Th><Th>Status</Th>
      </tr></thead>
    );
  }
  return null;
}

function carName(row: Record<string, unknown>) {
  const make = (row.listingMake as string) ?? "";
  const model = (row.listingModel as string) ?? "";
  const year = (row.listingYear as number | string | undefined) ?? "";
  const left = `${make} ${model}`.trim();
  return [left, year].filter(Boolean).join(" ").trim() || "—";
}

function counterpartyName(row: Record<string, unknown>) {
  const f = (row.counterpartyFirst as string) ?? "";
  const l = (row.counterpartyLast as string) ?? "";
  return `${f} ${l}`.trim() || "—";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function FeedbackRow({
  idx,
  group,
  onView,
}: {
  idx: number;
  group: { dayKey: string; createdAt: string; reviews: Record<string, unknown>[] };
  onView: () => void;
}) {
  const id = pad2(idx + 1);
  const top = group.reviews.slice(0, 2);
  return (
    <tr className="hover:bg-gray-50/50 align-top">
      <Td className="font-semibold text-gray-900">{id}</Td>
      <Td className="font-semibold text-gray-900 whitespace-nowrap">
        {formatDateTime(group.createdAt)}
      </Td>
      <Td>
        <ol className="space-y-1.5 text-gray-800">
          {top.map((r, i) => (
            <li key={String(r.id ?? i)} className="font-semibold">
              {i + 1}. {(r.comment as string) || "—"}
            </li>
          ))}
        </ol>
      </Td>
      <Td>
        <button
          type="button"
          onClick={onView}
          data-testid={`button-view-feedback-${id}`}
          className="text-primary font-bold underline hover:text-primary/80"
        >
          View More
        </button>
      </Td>
    </tr>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: { dayKey: string; createdAt: string; reviews: Record<string, unknown>[] } | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 mb-1 self-start hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <DialogTitle className="text-xl font-black">Seller Feedback</DialogTitle>
        </DialogHeader>
        {group && (
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm font-semibold text-gray-700">Date</Label>
              <div className="mt-1.5 px-4 py-3 border border-gray-200 rounded-md text-sm text-gray-700">
                {formatDateTime(group.createdAt)}
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Feedback</Label>
              <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                {group.reviews.map((r, i) => {
                  const first = (r.counterpartyFirst as string) ?? "";
                  const last = (r.counterpartyLast as string) ?? "";
                  const name = `${first} ${last}`.trim() || "Buyer";
                  const initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "B";
                  const comment = (r.comment as string) || "—";
                  const rating = Number(r.rating ?? 0);
                  return (
                    <div
                      key={String(r.id ?? i)}
                      className="border border-gray-200 rounded-lg p-3 flex gap-3"
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-black">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-900 text-sm truncate">{name}</span>
                          <span className="text-amber-500 text-xs font-bold whitespace-nowrap">
                            ★ {rating.toFixed(1)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5 line-clamp-3">{comment}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TableRow({
  tab,
  role,
  row,
  idx,
}: {
  tab: TabKey;
  role: string;
  row: Record<string, unknown>;
  idx: number;
}) {
  const id = pad2(idx + 1);
  const status = String(row.status ?? row.paymentStatus ?? "");

  if (tab === "offers") {
    const inspStatus = (row.inspectionStatus as string | null) ?? null;
    const pct = row.passedPct as number | null | undefined;
    const offerCount = row.offerCount as number | undefined;
    return (
      <tr className="hover:bg-gray-50/50">
        <Td className="font-semibold text-gray-900">{id}</Td>
        <Td className="font-semibold text-gray-900">{carName(row)}</Td>
        <Td>{counterpartyName(row)}</Td>
        <Td className="font-semibold text-gray-900">{formatNaira(Number(row.amount ?? 0))}</Td>
        <Td>{formatDateTime(row.createdAt as string)}</Td>
        <Td>
          {role === "seller" ? (
            <span className="font-semibold text-gray-900">{offerCount ?? 0}</span>
          ) : inspStatus ? (
            <span className="font-semibold text-gray-900">
              {cap(inspStatus)}
              {pct != null && (
                <span className="text-emerald-600 font-bold ml-1">({pct}% Passed)</span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </Td>
        <Td><StatusDot tone={tone(status)} label={cap(status)} /></Td>
      </tr>
    );
  }
  if (tab === "feedback") {
    return null;
  }
  if (tab === "purchases" || tab === "transactions") {
    if (tab === "transactions" && role === "inspector") {
      const sellerName = `${(row.sellerFirst as string) ?? ""} ${(row.sellerLast as string) ?? ""}`.trim() || "—";
      const buyerName = `${(row.buyerFirst as string) ?? ""} ${(row.buyerLast as string) ?? ""}`.trim() || "—";
      const isPaid = !!row.paidAt && status === "completed";
      const escrowTone: "green" | "yellow" = isPaid ? "green" : "yellow";
      const escrowLabel = isPaid ? "Paid" : "In-Escrow";
      const txDate = (row.paidAt as string | null) ?? (row.createdAt as string);
      const description = "Inspection Fee";
      return (
        <tr className="hover:bg-gray-50/50">
          <Td className="font-semibold text-gray-900">{id}</Td>
          <Td className="font-semibold text-gray-900">{description}</Td>
          <Td>{sellerName}</Td>
          <Td className="font-semibold text-gray-900">{formatNaira(Number(row.inspectorEarnings ?? row.fee ?? 0))}</Td>
          <Td>{buyerName}</Td>
          <Td>{formatDateTime(txDate)}</Td>
          <Td><StatusDot tone={escrowTone} label={escrowLabel} /></Td>
          <Td>
            <a
              href={`/api/admin/inspections/${row.id}/receipt`}
              target="_blank"
              rel="noreferrer"
              data-testid={`link-download-tx-${row.id}`}
              className="text-primary font-bold underline hover:text-primary/80"
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
          </Td>
        </tr>
      );
    }
    return (
      <tr className="hover:bg-gray-50/50">
        <Td className="font-semibold text-gray-900">{id}</Td>
        <Td className="font-semibold text-gray-900">{carName(row)}</Td>
        <Td>{counterpartyName(row)}</Td>
        <Td className="font-semibold text-gray-900">{formatNaira(Number(row.amount ?? 0))}</Td>
        <Td>{formatDateTime(row.createdAt as string)}</Td>
        <Td><StatusDot tone={tone(status)} label={cap(status)} /></Td>
      </tr>
    );
  }
  if (tab === "inspections") {
    const pct = row.passedPct as number | null | undefined;
    const resultColor =
      pct == null ? "text-gray-400" : pct >= 70 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500";
    if (role === "inspector") {
      const sellerName = `${(row.sellerFirst as string) ?? ""} ${(row.sellerLast as string) ?? ""}`.trim() || "—";
      const buyerName = `${(row.buyerFirst as string) ?? ""} ${(row.buyerLast as string) ?? ""}`.trim() || "—";
      return (
        <tr className="hover:bg-gray-50/50">
          <Td className="font-semibold text-gray-900">{id}</Td>
          <Td className="font-semibold text-gray-900">{carName(row)}</Td>
          <Td>{sellerName}</Td>
          <Td>{buyerName}</Td>
          <Td className="font-semibold text-gray-900">{formatNaira(Number(row.inspectorEarnings ?? row.fee ?? 0))}</Td>
          <Td className={`font-bold ${resultColor}`}>{pct == null ? "—" : `${pct}%`}</Td>
          <Td>{formatDateTime(row.scheduledAt as string | null)}</Td>
          <Td><StatusDot tone={tone(status)} label={cap(status)} /></Td>
        </tr>
      );
    }
    return (
      <tr className="hover:bg-gray-50/50">
        <Td className="font-semibold text-gray-900">{id}</Td>
        <Td className="font-semibold text-gray-900">{carName(row)}</Td>
        <Td>{counterpartyName(row)}</Td>
        <Td className="font-semibold text-gray-900">{formatNaira(Number(row.fee ?? 0))}</Td>
        <Td className={`font-bold ${resultColor}`}>{pct == null ? "—" : `${pct}%`}</Td>
        <Td>{formatDateTime(row.scheduledAt as string | null)}</Td>
        <Td><StatusDot tone={tone(status)} label={cap(status)} /></Td>
      </tr>
    );
  }
  if (tab === "tickets") {
    const assignedFirst = (row.assignedFirstName as string | null) ?? "";
    const assignedLast = (row.assignedLastName as string | null) ?? "";
    const assigned = `${assignedFirst} ${assignedLast}`.trim() || "—";
    const issueType = (row.category as string) ?? (row.subject as string) ?? "—";
    return (
      <tr className="hover:bg-gray-50/50">
        <Td className="font-semibold text-gray-900">{id}</Td>
        <Td>{formatDateTime(row.createdAt as string)}</Td>
        <Td className="font-semibold text-gray-900">{cap(String(issueType))}</Td>
        <Td className="font-semibold text-gray-900">{cap(String(row.priority ?? ""))}</Td>
        <Td>{assigned}</Td>
        <Td>{formatDateTime(row.lastResponseAt as string | null)}</Td>
        <Td><StatusDot tone={tone(status)} label={cap(status)} /></Td>
      </tr>
    );
  }
  if (tab === "listings") {
    return (
      <tr className="hover:bg-gray-50/50">
        <Td className="font-semibold text-gray-900">{id}</Td>
        <Td className="font-semibold text-gray-900">{String(row.make ?? "—")}</Td>
        <Td className="font-semibold text-gray-900">{String(row.model ?? "—")}</Td>
        <Td className="font-semibold text-gray-900">{formatNaira(Number(row.price ?? 0))}</Td>
        <Td>{formatDate(row.createdAt as string)}</Td>
        <Td>
          <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
            <Eye className="h-4 w-4 text-gray-400" /> {String(row.viewCount ?? 0)}
          </span>
        </Td>
        <Td><StatusDot tone={tone(status)} label={cap(status)} /></Td>
      </tr>
    );
  }
  return null;
}

function cap(s: string) {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
