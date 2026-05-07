import { createHash } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ObjectStorageService } from "./objectStorage";

const LOCAL_UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.LOCAL_UPLOAD_DIR || ".local-uploads",
);
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

const objectStorageService = new ObjectStorageService();

type LoggerLike = {
  warn?: (obj: unknown, msg?: string) => void;
  error?: (obj: unknown, msg?: string) => void;
};

function pathFromRef(ref: string): string {
  const value = String(ref || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return "";
    }
  }
  return value;
}

function extractLocalFileName(ref: string): string | null {
  const p = pathFromRef(ref);
  const m = p.match(/\/api\/storage\/local\/([a-zA-Z0-9._-]+)$/);
  if (m?.[1]) return m[1];
  const m2 = p.match(/^\/local\/([a-zA-Z0-9._-]+)$/);
  return m2?.[1] ?? null;
}

function parseCloudinaryAsset(ref: string): {
  resourceType: "image" | "video" | "raw";
  publicId: string;
} | null {
  const value = String(ref || "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!url.hostname.includes("res.cloudinary.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // /<cloudName>/<resourceType>/upload/[transform...]/[v123]/<publicId>.<ext>
  if (parts.length < 5) return null;
  const cloudName = parts[0];
  const resourceType = parts[1];
  const uploadIdx = parts.indexOf("upload");
  if (cloudName !== CLOUDINARY_CLOUD_NAME || uploadIdx === -1) return null;
  const afterUpload = parts.slice(uploadIdx + 1);
  if (afterUpload.length === 0) return null;
  const versionIdx = afterUpload.findIndex((s) => /^v\d+$/.test(s));
  const publicParts = versionIdx >= 0 ? afterUpload.slice(versionIdx + 1) : afterUpload;
  if (publicParts.length === 0) return null;
  const last = publicParts[publicParts.length - 1] || "";
  publicParts[publicParts.length - 1] = last.replace(/\.[a-z0-9]+$/i, "");
  const publicId = publicParts.join("/");
  if (!publicId) return null;
  const rt =
    resourceType === "video"
      ? "video"
      : resourceType === "raw"
        ? "raw"
        : "image";
  return { resourceType: rt, publicId };
}

async function deleteFromCloudinary(asset: {
  resourceType: "image" | "video" | "raw";
  publicId: string;
}): Promise<void> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`public_id=${asset.publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
    .digest("hex");
  const form = new URLSearchParams();
  form.set("public_id", asset.publicId);
  form.set("timestamp", String(timestamp));
  form.set("api_key", CLOUDINARY_API_KEY);
  form.set("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${asset.resourceType}/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
  );
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Cloudinary destroy failed (${response.status}): ${message}`);
  }
}

export async function deleteManagedMediaRef(
  ref: string | null | undefined,
  logger?: LoggerLike,
): Promise<boolean> {
  const value = String(ref || "").trim();
  if (!value) return false;

  try {
    const cloudAsset = parseCloudinaryAsset(value);
    if (cloudAsset) {
      await deleteFromCloudinary(cloudAsset);
      return true;
    }

    const localFileName = extractLocalFileName(value);
    if (localFileName) {
      const filePath = path.join(LOCAL_UPLOAD_DIR, localFileName);
      await fs.unlink(filePath).catch((err: unknown) => {
        const code = (err as { code?: string })?.code;
        if (code !== "ENOENT") throw err;
      });
      return true;
    }

    const p = pathFromRef(value);
    if (p.startsWith("/objects/") || p.startsWith("/api/storage/objects/")) {
      const objectPath = p.startsWith("/objects/")
        ? p
        : `/objects/${p.replace(/^\/api\/storage\/objects\//, "")}`;
      await objectStorageService.deleteObjectEntity(objectPath);
      return true;
    }
  } catch (err) {
    logger?.warn?.({ err, ref: value }, "Failed to cleanup media reference");
  }

  return false;
}
