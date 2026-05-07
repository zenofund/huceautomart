import { Router, type IRouter, type Response } from "express";
import { Readable } from "stream";
import path from "path";
import { randomUUID, createHash } from "crypto";
import { promises as fs } from "fs";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { requireAuth, requireAdmin, type AuthRequest } from "../lib/auth-middleware";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const LOCAL_UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.LOCAL_UPLOAD_DIR || ".local-uploads",
);
const LOCAL_UPLOAD_ROUTE_PREFIX = "/api/storage/local";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const CLOUDINARY_UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || "huce-autos";

function cloudinaryReady() {
  return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

router.get(
  "/storage/health",
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    const missing: string[] = [];
    if (!CLOUDINARY_CLOUD_NAME) missing.push("CLOUDINARY_CLOUD_NAME");
    if (!CLOUDINARY_API_KEY) missing.push("CLOUDINARY_API_KEY");
    if (!CLOUDINARY_API_SECRET) missing.push("CLOUDINARY_API_SECRET");
    const cloudinaryConfigured = missing.length === 0;
    res.json({
      provider: cloudinaryConfigured ? "cloudinary" : "local_fallback",
      cloudinaryConfigured,
      uploadFolder: CLOUDINARY_UPLOAD_FOLDER,
      missing,
      localFallbackAvailable: true,
    });
  },
);

function detectExtension(name: string, contentType: string): string {
  const byType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const fromType = byType[contentType.toLowerCase()];
  if (fromType) return fromType;
  const ext = path.extname(name || "").toLowerCase();
  return ext && ext.length <= 10 ? ext : ".bin";
}

// ─── POST /api/storage/uploads/request-url ─────────────────────────────────
// Authenticated callers receive a short-lived presigned PUT URL plus the
// canonical objectPath (`/objects/uploads/<uuid>`) they should call
// `finalize` with after the PUT completes.
router.post(
  "/storage/uploads/local",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { name, contentType, dataUrl } = (req.body ?? {}) as {
      name?: unknown;
      contentType?: unknown;
      dataUrl?: unknown;
    };
    if (
      typeof name !== "string" ||
      typeof contentType !== "string" ||
      typeof dataUrl !== "string" ||
      !dataUrl.startsWith("data:")
    ) {
      res.status(400).json({ error: "Invalid local upload payload" });
      return;
    }

    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) {
      res.status(400).json({ error: "Invalid data URL format" });
      return;
    }

    const base64Data = dataUrl.slice(commaIdx + 1);
    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64Data, "base64");
    } catch {
      res.status(400).json({ error: "Invalid base64 payload" });
      return;
    }
    if (bytes.length === 0) {
      res.status(400).json({ error: "Uploaded file is empty" });
      return;
    }
    if (bytes.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: "File too large (max 10MB)" });
      return;
    }

    try {
      await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
      const ext = detectExtension(name, contentType);
      const fileName = `${Date.now()}-${randomUUID()}${ext}`;
      const filePath = path.join(LOCAL_UPLOAD_DIR, fileName);
      await fs.writeFile(filePath, bytes);

      res.json({
        objectPath: `/local/${fileName}`,
        servingUrl: `${LOCAL_UPLOAD_ROUTE_PREFIX}/${fileName}`,
      });
    } catch (error) {
      req.log.error({ err: error }, "Error writing local uploaded file");
      res.status(500).json({ error: "Failed to save local upload" });
    }
  },
);

// ─── POST /api/storage/uploads/cloudinary-signature ────────────────────────
// Issues signed params for direct browser upload to Cloudinary.
router.post(
  "/storage/uploads/cloudinary-signature",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { name, size, contentType } = (req.body ?? {}) as {
      name?: unknown;
      size?: unknown;
      contentType?: unknown;
    };
    if (
      typeof name !== "string" ||
      typeof size !== "number" ||
      typeof contentType !== "string"
    ) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    if (!cloudinaryReady()) {
      res.status(503).json({ error: "Cloudinary is not configured on the server" });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const ext = detectExtension(name, contentType).replace(/^\./, "");
    const baseId = `${Date.now()}-${randomUUID()}`;
    const publicId = `${CLOUDINARY_UPLOAD_FOLDER}/${req.user!.userId}/${ext ? `${baseId}.${ext}` : baseId}`;
    const toSign = `folder=${CLOUDINARY_UPLOAD_FOLDER}&public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = createHash("sha1").update(toSign).digest("hex");

    res.json({
      uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      cloudName: CLOUDINARY_CLOUD_NAME,
      apiKey: CLOUDINARY_API_KEY,
      timestamp,
      folder: CLOUDINARY_UPLOAD_FOLDER,
      publicId,
      signature,
    });
  },
);

router.get("/storage/local/:fileName", async (req: AuthRequest, res: Response) => {
  const fileName = String(req.params.fileName ?? "");
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    res.status(400).json({ error: "Invalid file name" });
    return;
  }
  const filePath = path.join(LOCAL_UPLOAD_DIR, fileName);
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(filePath);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { name, size, contentType } = (req.body ?? {}) as {
      name?: unknown;
      size?: unknown;
      contentType?: unknown;
    };
    if (
      typeof name !== "string" ||
      typeof size !== "number" ||
      typeof contentType !== "string"
    ) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      req.log.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

// ─── POST /api/storage/uploads/finalize ────────────────────────────────────
// After the client has PUT the file to `uploadURL`, it calls this endpoint
// with the same `uploadURL` (or `objectPath`) so we can stamp an ACL policy
// onto the object. For listing photos we use `visibility="public"` because
// any logged-out shopper must be able to view them.
router.post(
  "/storage/uploads/finalize",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { uploadURL, objectPath, visibility } = (req.body ?? {}) as {
      uploadURL?: unknown;
      objectPath?: unknown;
      visibility?: unknown;
    };
    const ref =
      typeof uploadURL === "string"
        ? uploadURL
        : typeof objectPath === "string"
          ? objectPath
          : null;
    if (!ref) {
      res.status(400).json({ error: "uploadURL or objectPath is required" });
      return;
    }
    const vis = visibility === "private" ? "private" : "public";
    try {
      const normalizedPath =
        await objectStorageService.trySetObjectEntityAclPolicy(ref, {
          owner: String(req.user!.userId),
          visibility: vis,
        });
      res.json({ objectPath: normalizedPath });
    } catch (error) {
      req.log.error({ err: error }, "Error finalizing object ACL");
      res.status(500).json({ error: "Failed to finalize upload" });
    }
  },
);

function streamObject(res: Response, response: Response | Awaited<ReturnType<ObjectStorageService["downloadObject"]>>) {
  // Helper kept type-light on purpose; see callsites.
}

// ─── GET /api/storage/objects/*path ────────────────────────────────────────
// Private-by-default object retrieval. Even though listing photos are stored
// as `visibility="public"`, we still pass the request through
// `canAccessObjectEntity` so non-public objects are gated on the caller's
// identity.
router.get(
  "/storage/objects/*path",
  async (req: AuthRequest, res: Response) => {
    try {
      const raw = (req.params as Record<string, string | string[]>).path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile =
        await objectStorageService.getObjectEntityFile(objectPath);

      const allowed = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId:
          req.user?.userId !== undefined ? String(req.user.userId) : undefined,
        requestedPermission: ObjectPermission.READ,
      });
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const response = await objectStorageService.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

router.get(
  "/storage/public-objects/*filePath",
  async (req: AuthRequest, res: Response) => {
    try {
      const raw = (req.params as Record<string, string | string[]>).filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const response = await objectStorageService.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

// (unused helper kept for future refactor; keep TS happy)
void streamObject;

export default router;
