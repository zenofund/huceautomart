/**
 * Upload helper with Cloudinary direct-upload as primary path.
 *
 * Fallback path remains local API upload for development resilience.
 */
export interface UploadResult {
  /** Canonical storage reference (Cloudinary URL or local object path). */
  objectPath: string;
  /** Public URL to render the file. */
  servingUrl: string;
}

interface CloudinarySignatureResponse {
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  publicId: string;
  signature: string;
}

interface LocalUploadResponse {
  objectPath: string;
  servingUrl: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function uploadFileLocally(file: File): Promise<UploadResult> {
  const dataUrl = await fileToDataUrl(file);
  const res = await fetch("/api/storage/uploads/local", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      dataUrl,
    }),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "Failed to upload file locally");
  }
  const payload = (await res.json()) as LocalUploadResponse;
  return {
    objectPath: payload.objectPath,
    servingUrl: payload.servingUrl,
  };
}

async function uploadFileViaCloudinary(file: File): Promise<UploadResult> {
  const meta = await fetch("/api/storage/uploads/cloudinary-signature", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!meta.ok) {
    const j = (await meta.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "Failed to get Cloudinary signature");
  }

  const payload = (await meta.json()) as CloudinarySignatureResponse;
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", payload.apiKey);
  form.append("timestamp", String(payload.timestamp));
  form.append("signature", payload.signature);
  form.append("folder", payload.folder);
  form.append("public_id", payload.publicId);

  const uploadRes = await fetch(payload.uploadUrl, {
    method: "POST",
    body: form,
  });
  if (!uploadRes.ok) {
    const j = (await uploadRes.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? "Cloudinary upload failed");
  }
  const data = (await uploadRes.json()) as {
    secure_url?: string;
    url?: string;
  };
  const servingUrl = String(data.secure_url || data.url || "");
  if (!servingUrl) throw new Error("Cloudinary returned no URL");
  return {
    objectPath: servingUrl,
    servingUrl,
  };
}

import { applyWatermark } from "./watermark";

export async function uploadFile(file: File, options?: { watermark?: boolean }): Promise<UploadResult> {
  let fileToUpload = file;
  if (options?.watermark) {
    try {
      fileToUpload = await applyWatermark(file);
    } catch (e) {
      console.error("Failed to apply watermark", e);
    }
  }

  try {
    return await uploadFileViaCloudinary(fileToUpload);
  } catch (err) {
    // Local fallback keeps uploads working before Cloudinary is configured.
    return uploadFileLocally(fileToUpload).catch((localErr) => {
      const primary = err instanceof Error ? err.message : "Upload failed";
      const fallback =
        localErr instanceof Error ? localErr.message : "Local upload failed";
      throw new Error(`${primary}. Fallback failed: ${fallback}`);
    });
  }
}
