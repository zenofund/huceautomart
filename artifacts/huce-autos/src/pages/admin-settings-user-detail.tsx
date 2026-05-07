import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteListingDialog } from "@/components/dialogs/delete-listing-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Search } from "lucide-react";

const API_BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface UserDetailResponse {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: "buyer" | "seller" | "inspector" | "admin";
    status: "active" | "inactive" | "suspended" | "pending_verification";
    createdAt: string;
  };
  stats: Record<string, number>;
}

interface AuditLogRow {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditResponse {
  items: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date}, ${time.toLowerCase().replace(" ", "")}`;
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

function statusLabel(status: string) {
  return status === "active" ? "Active" : "Non-active";
}

function actionLabel(action: string) {
  return action
    .replace(/^ADMIN_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminSettingsUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [openReset, setOpenReset] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | "inspector" | "admin">("buyer");
  const [status, setStatus] = useState<"active" | "inactive" | "suspended" | "pending_verification">("active");
  const [editPassword, setEditPassword] = useState("");

  const detailQuery = useQuery({
    queryKey: ["admin-settings-user-detail", id],
    queryFn: () => fetchJSON<UserDetailResponse>(`/admin/users/${id}`),
    enabled: !!id,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-settings-user-audit", id, search, page, pageSize],
    queryFn: () =>
      fetchJSON<AuditResponse>(
        `/admin/users/${id}/audit-log?search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`,
      ),
    enabled: !!id,
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    const u = detailQuery.data.user;
    setFullName(`${u.firstName} ${u.lastName}`.trim());
    setEmail(u.email);
    setPhone(u.phone ?? "");
    setRole(u.role);
    setStatus(u.status);
  }, [detailQuery.data?.user.id]);

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to reset password");
    },
    onSuccess: () => {
      toast({ title: "Password reset successful" });
      setOpenReset(false);
      setNewPassword("");
      setConfirmPassword("");
      qc.invalidateQueries({ queryKey: ["admin-settings-user-audit"] });
    },
    onError: (err: Error) =>
      toast({ title: "Password reset failed", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const trimmed = fullName.trim();
      const firstSpace = trimmed.indexOf(" ");
      const firstName = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
      const lastName = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
      if (!firstName || !lastName) throw new Error("Please enter both first and last name");

      const editRes = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone, role, status }),
      });
      const editJson = await editRes.json().catch(() => ({}));
      if (!editRes.ok) throw new Error(editJson.error ?? "Failed to update user");

      if (editPassword.trim()) {
        const resetRes = await fetch(`/api/admin/users/${id}/reset-password`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: editPassword, confirmPassword: editPassword }),
        });
        const resetJson = await resetRes.json().catch(() => ({}));
        if (!resetRes.ok) throw new Error(resetJson.error ?? "Failed to update password");
      }
    },
    onSuccess: () => {
      toast({ title: "User updated" });
      setOpenEdit(false);
      setEditPassword("");
      qc.invalidateQueries({ queryKey: ["admin-settings-user-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-settings-user-audit"] });
      qc.invalidateQueries({ queryKey: ["admin-settings-users"] });
    },
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const u = detailQuery.data?.user;
      if (!u) throw new Error("User not loaded");
      const nextStatus = u.status === "active" ? "inactive" : "active";
      const res = await fetch(`/api/admin/users/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to change status");
    },
    onSuccess: () => {
      toast({ title: "User status updated" });
      qc.invalidateQueries({ queryKey: ["admin-settings-user-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-settings-user-audit"] });
      qc.invalidateQueries({ queryKey: ["admin-settings-users"] });
    },
    onError: (err: Error) =>
      toast({ title: "Status update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to delete user");
    },
    onSuccess: () => {
      toast({ title: "User deleted successfully" });
      qc.invalidateQueries({ queryKey: ["admin-settings-users"] });
      setLocation("/admin/settings");
    },
    onError: (err: Error) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => pageNumbers(page, totalPages), [page, totalPages]);
  const rows = auditQuery.data?.items ?? [];

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <button
            onClick={() => setLocation("/admin/settings")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 flex-1">
            {detailQuery.data ? `${detailQuery.data.user.firstName} ${detailQuery.data.user.lastName}` : "User"}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setOpenReset(true)}
              className="h-10 px-4 rounded-md border border-gray-200 text-sm font-semibold text-gray-800"
            >
              Reset Password
            </button>
            <button
              onClick={() => setOpenEdit(true)}
              className="h-10 px-4 rounded-md bg-[#046C4E] text-white text-sm font-semibold"
            >
              Edit User
            </button>
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending || !detailQuery.data}
              className="h-10 px-4 rounded-md bg-[#FDECEC] text-[#DC2626] text-sm font-semibold disabled:opacity-50"
            >
              {detailQuery.data?.user.status === "active" ? "Deactivate User" : "Activate User"}
            </button>
            <button
              onClick={() => setOpenDeleteConfirm(true)}
              disabled={deleteMutation.isPending || !detailQuery.data}
              className="h-10 px-4 rounded-md bg-[#DC2626] text-white text-sm font-semibold disabled:opacity-50"
            >
              Delete User
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          {detailQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !detailQuery.data ? (
            <p className="text-sm text-gray-500">User not found.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-5">
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">ID</p>
                  <p className="text-base font-bold text-gray-900">{detailQuery.data.user.id}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Full Name</p>
                  <p className="text-sm font-semibold text-gray-900">{`${detailQuery.data.user.firstName} ${detailQuery.data.user.lastName}`.trim()}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Email Address</p>
                  <p className="text-sm font-semibold text-gray-900">{detailQuery.data.user.email}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Phone Number</p>
                  <p className="text-sm font-semibold text-gray-900">{detailQuery.data.user.phone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Role</p>
                  <p className="text-sm font-semibold text-gray-900 capitalize">{detailQuery.data.user.role}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Registration Date</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDate(detailQuery.data.user.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Status</p>
                  <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${detailQuery.data.user.status === "active" ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#FEE2E2] text-[#B42318]"}`}>
                    {statusLabel(detailQuery.data.user.status)}
                  </span>
                </div>
              </div>

              <div className="mt-10">
                <h2 className="text-lg font-black text-gray-900 mb-4">Audit Log</h2>
                <div className="relative max-w-md mb-5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search here..."
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="border-t border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Date & Time</th>
                        <th className="px-4 py-3">Action Performed</th>
                        <th className="px-4 py-3">Details</th>
                        <th className="px-4 py-3">IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditQuery.isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <tr key={i}>
                            <td colSpan={5} className="px-4 py-4">
                              <Skeleton className="h-6 w-full" />
                            </td>
                          </tr>
                        ))
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-sm text-gray-500 text-center">
                            No audit entries found.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.id} className="border-b border-gray-100">
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">{String(r.id).padStart(2, "0")}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">{formatDate(r.createdAt)}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-gray-900">{actionLabel(r.action)}</td>
                            <td className="px-4 py-4 text-sm text-gray-700">
                              {r.details?.status ? `Status: ${String(r.details.status)}` : "Activity recorded"}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-700">{r.ipAddress ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-6">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="h-11 px-5 rounded-xl border border-[#046C4E] text-sm font-semibold text-gray-800 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {pages.map((p, i) =>
                        p === "…" ? (
                          <span key={`e-${i}`} className="px-2 text-gray-400">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`min-w-[34px] h-8 px-2 rounded text-sm font-medium ${
                              p === page ? "bg-primary/10 text-primary border border-primary/30" : "text-gray-500 hover:text-gray-800"
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
                      className="h-11 px-5 rounded-xl border border-[#046C4E] text-sm font-semibold text-gray-800 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={openReset} onOpenChange={setOpenReset}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6">
          <div>
            <button
              onClick={() => setOpenReset(false)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 mb-5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <h2 className="text-xl font-black text-gray-900 mb-4">Reset Password</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resetMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter New Password"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Enter Confirm Password"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={resetMutation.isPending || !newPassword.trim() || !confirmPassword.trim()}
                className="w-full h-11 rounded-xl bg-[#046C4E] hover:bg-[#045c42] text-white text-sm font-semibold disabled:opacity-50"
              >
                {resetMutation.isPending ? "Proceeding..." : "Proceed"}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6">
          <div>
            <button
              onClick={() => setOpenEdit(false)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 mb-5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <h2 className="text-xl font-black text-gray-900 mb-4">Edit User</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                editMutation.mutate();
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
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter Password (optional)"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={editMutation.isPending || !fullName.trim() || !email.trim()}
                className="w-full h-11 rounded-xl bg-[#046C4E] hover:bg-[#045c42] text-white text-sm font-semibold disabled:opacity-50"
              >
                {editMutation.isPending ? "Proceeding..." : "Proceed"}
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteListingDialog
        open={openDeleteConfirm}
        onClose={() => setOpenDeleteConfirm(false)}
        onConfirm={() => {
          deleteMutation.mutate();
          setOpenDeleteConfirm(false);
        }}
        submitting={deleteMutation.isPending}
        title="Delete this user permanently?"
        description="This action permanently removes the user account and cannot be undone."
        subtitle={
          detailQuery.data
            ? `${detailQuery.data.user.firstName} ${detailQuery.data.user.lastName}`.trim()
            : undefined
        }
        confirmLabel="Delete User"
      />
    </AdminLayout>
  );
}
