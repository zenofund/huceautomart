import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || "huce-autos-dev-secret-change-in-production";

export interface JwtPayload {
  userId: number;
  role: string;
  email: string;
}

export interface GoogleOnboardingPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function signGoogleOnboardingToken(payload: GoogleOnboardingPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export function verifyGoogleOnboardingToken(token: string): GoogleOnboardingPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as GoogleOnboardingPayload;
  } catch {
    return null;
  }
}
