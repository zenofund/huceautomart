import { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "./jwt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// Throttle: only write to DB if last update was >60 s ago
const lastSeenCache = new Map<number, number>();

function touchLastSeen(userId: number): void {
  const now = Date.now();
  const prev = lastSeenCache.get(userId) ?? 0;
  if (now - prev < 60_000) return;
  lastSeenCache.set(userId, now);
  db.update(usersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(usersTable.id, userId))
    .catch(() => {});
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token && typeof req.query.token === "string") {
    token = req.query.token;
  }
  
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.user = payload;
  touchLastSeen(payload.userId);
  next();
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}
