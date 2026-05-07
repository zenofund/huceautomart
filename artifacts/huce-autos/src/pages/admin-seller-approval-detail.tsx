import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface SellerApprovalDetail {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  userStatus: string;
  createdAt: string;
  businessName: string | null;
  location: string | null;
  ninNumber: string | null;
  ninDocumentUrl: string | null;
  proofOfAddressUrl: string | null;
  verificationStatus: "pending" | "verified" | "rejected";
  isVerified: boolean | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  hasBankAccount: boolean;
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

interface AdminUserDetailFallback {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    profilePhotoUrl: string | null;
    status: string;
    createdAt: string;
  };
}

interface SellerProfileFallback {
  businessName: string | null;
  location: string | null;
  ninNumber: string | null;
  ninDocumentUrl: string | null;
  proofOfAddressUrl: string | null;
  verificationStatus: string | null;
  isVerified: boolean | null;
}

function statusPill(status: SellerApprovalDetail["verificationStatus"]) {
  if (status === "verified") return "bg-green-50 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function ProgressItem({ label, value }: { label: string; value: "pending" | "completed" }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
          value === "completed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {value === "completed" ? "Completed" : "Pending"}
      </span>
    </div>
  );
}

export default function AdminSellerApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const sellerId = Number(params.id);
  const detailQuery = useQuery({
    queryKey: ["admin-seller-approval-detail", sellerId],
    queryFn: async (): Promise<SellerApprovalDetail> => {
      try {
        return await fetchJSON<SellerApprovalDetail>(`/admin/settings/seller-approvals/${sellerId}`);
      } catch {
        const [base, profile] = await Promise.all([
          fetchJSON<AdminUserDetailFallback>(`/admin/users/${sellerId}`),
          fetchJSON<SellerProfileFallback | null>(`/admin/users/${sellerId}/seller-profile`),
        ]);
        const effectiveStatus: SellerApprovalDetail["verificationStatus"] =
          profile?.isVerified || profile?.verificationStatus === "verified"
            ? "verified"
            : profile?.verificationStatus === "rejected"
              ? "rejected"
              : "pending";
        return {
          id: base.user.id,
          firstName: base.user.firstName,
          lastName: base.user.lastName,
          email: base.user.email,
          phone: base.user.phone,
          profilePhotoUrl: base.user.profilePhotoUrl,
          userStatus: base.user.status,
          createdAt: base.user.createdAt,
          businessName: profile?.businessName ?? null,
          location: profile?.location ?? null,
          ninNumber: profile?.ninNumber ?? null,
          ninDocumentUrl: profile?.ninDocumentUrl ?? null,
          proofOfAddressUrl: profile?.proofOfAddressUrl ?? null,
          verificationStatus: effectiveStatus,
          isVerified: profile?.isVerified ?? null,
          bankName: null,
          bankAccountNumber: null,
          bankAccountName: null,
          hasBankAccount: false,
          progress: {
            nin: profile?.ninNumber && profile?.ninDocumentUrl ? "completed" : "pending",
            proof: profile?.proofOfAddressUrl ? "completed" : "pending",
            bank: "pending",
            profile: base.user.profilePhotoUrl || profile?.businessName ? "completed" : "pending",
            completedCount: [
              Boolean(profile?.ninNumber && profile?.ninDocumentUrl),
              Boolean(profile?.proofOfAddressUrl),
              false,
              Boolean(base.user.profilePhotoUrl || profile?.businessName),
            ].filter(Boolean).length,
            totalCount: 4,
            allCompleted: false,
          },
        };
      }
    },
    enabled: Number.isFinite(sellerId) && sellerId > 0,
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      const res = await fetch(`${API_BASE}/admin/settings/seller-approvals/${sellerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to update verification");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-seller-approvals"] });
      qc.invalidateQueries({ queryKey: ["admin-seller-approval-detail", sellerId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-detail", String(sellerId)] });
      toast({ title: "Seller verification updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <AdminLayout>
      <div className="container mx-auto px-3 sm:px-4 py-6 space-y-4">
        <button
          onClick={() => setLocation("/admin/settings")}
          className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Seller Approval
        </button>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5">
          {detailQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : detailQuery.data ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-gray-900">
                    {`${detailQuery.data.firstName} ${detailQuery.data.lastName}`.trim() || "Seller"}
                  </h3>
                  <p className="text-sm text-gray-600">{detailQuery.data.email}</p>
                  <p className="text-sm text-gray-600">{detailQuery.data.phone ?? "—"}</p>
                  <p className="text-sm text-gray-600">Business: {detailQuery.data.businessName ?? "—"}</p>
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize self-start ${statusPill(detailQuery.data.verificationStatus)}`}>
                  {detailQuery.data.verificationStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ProgressItem label="Profile" value={detailQuery.data.progress.profile} />
                <ProgressItem label="NIN" value={detailQuery.data.progress.nin} />
                <ProgressItem label="Proof Of Address" value={detailQuery.data.progress.proof} />
                <ProgressItem label="Bank" value={detailQuery.data.progress.bank} />
              </div>

              <div className="text-sm text-gray-700">
                Progress: <span className="font-semibold">{detailQuery.data.progress.completedCount}/{detailQuery.data.progress.totalCount}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">NIN Details</p>
                  <p className="text-sm text-gray-700">NIN: {detailQuery.data.ninNumber ?? "—"}</p>
                  {detailQuery.data.ninDocumentUrl ? (
                    <button
                      onClick={() => setPreviewUrl(detailQuery.data.ninDocumentUrl)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    >
                      <Eye className="h-4 w-4" /> View NIN Document
                    </button>
                  ) : (
                    <p className="text-sm text-gray-500 mt-2">No document uploaded</p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Address Verification</p>
                  <p className="text-sm text-gray-700">Location: {detailQuery.data.location ?? "—"}</p>
                  {detailQuery.data.proofOfAddressUrl ? (
                    <button
                      onClick={() => setPreviewUrl(detailQuery.data.proofOfAddressUrl)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    >
                      <Eye className="h-4 w-4" /> View Address Document
                    </button>
                  ) : (
                    <p className="text-sm text-gray-500 mt-2">No document uploaded</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Bank Information</p>
                <p className="text-sm text-gray-700">Bank: {detailQuery.data.bankName ?? "—"}</p>
                <p className="text-sm text-gray-700">Account Number: {detailQuery.data.bankAccountNumber ?? "—"}</p>
                <p className="text-sm text-gray-700">Account Name: {detailQuery.data.bankAccountName ?? "—"}</p>
                <p className="text-sm text-gray-700 mt-1">
                  Verified Bank Record: {detailQuery.data.hasBankAccount ? "Available" : "Not found"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => actionMutation.mutate("approve")}
                  disabled={actionMutation.isPending}
                  className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  Approve Seller
                </button>
                <button
                  onClick={() => actionMutation.mutate("reject")}
                  disabled={actionMutation.isPending}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  Reject Seller
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-600">Unable to load seller details.</p>
          )}
        </div>

        <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Document Preview</DialogTitle>
            </DialogHeader>
            {previewUrl && (
              <div className="max-h-[75vh] overflow-auto rounded border border-gray-200">
                <img src={previewUrl} alt="Seller document preview" className="w-full h-auto" />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
