import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { eq, and, asc, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  otpVerificationsTable,
  sellerProfilesTable,
  buyerProfilesTable,
  inspectorProfilesTable,
  subscriptionPlansTable,
  subscriptionsTable,
} from "@workspace/db";
import {
  signToken,
  verifyToken,
  signGoogleOnboardingToken,
  verifyGoogleOnboardingToken,
} from "../lib/jwt";
import { sendOtpEmail, generateOtp, sendWelcomeEmail } from "../lib/email";
import { requireAuth, requireAdmin, type AuthRequest } from "../lib/auth-middleware";
import { deleteManagedMediaRef } from "../lib/mediaCleanup";
import rateLimit from "express-rate-limit";

const router = Router();

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per `window` (here, per 15 minutes)
  message: { error: "Too many requests from this IP, please try again after 15 minutes" },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 OTP requests per `window`
  message: { error: "Too many OTP requests from this IP, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: (
    process.env.NODE_ENV === "production" ? "none" : "lax"
  ) as "none" | "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  domain:
    process.env.NODE_ENV === "production"
      ? process.env.COOKIE_DOMAIN
      : undefined,
};

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_ONBOARDING_COOKIE = "google_onboarding";
const GOOGLE_SCOPE = ["openid", "email", "profile"];

function getFrontendBaseUrl() {
  const fallback =
    process.env.NODE_ENV === "production"
      ? "https://huceautomart.com"
      : "http://localhost:5173";
  return (process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN || fallback).replace(/\/$/, "");
}

function getGoogleCallbackUrl() {
  return (
    process.env.GOOGLE_CALLBACK_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://api.huceautomart.com/api/auth/google/callback"
      : "http://localhost:10000/api/auth/google/callback")
  );
}

function createGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new OAuth2Client(clientId, clientSecret, getGoogleCallbackUrl());
}

function googleReady() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRoleRedirectPath(role: string) {
  if (role === "seller") return "/seller";
  if (role === "inspector") return "/inspector";
  if (role === "admin") return "/admin";
  return "/dashboard";
}

function shouldExposeDevOtp() {
  return process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEV_OTP === "true";
}

async function trySendOtpEmail(
  email: string,
  otp: string,
  purpose: "email_verify" | "password_reset",
  firstName: string,
) {
  try {
    await sendOtpEmail(email, otp, purpose, firstName);
    return true;
  } catch (error) {
    console.error("otp email send failed", error);
    return false;
  }
}

function redirectWithGoogleError(res: Response, code: string) {
  const frontendBase = getFrontendBaseUrl();
  res.redirect(`${frontendBase}/sign-in?googleError=${encodeURIComponent(code)}`);
}

async function assignDefaultPlan(userId: number) {
  try {
    const [freePlan] = await db
      .select({ id: subscriptionPlansTable.id, durationDays: subscriptionPlansTable.durationDays })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(asc(subscriptionPlansTable.price), asc(subscriptionPlansTable.id))
      .limit(1);
    if (!freePlan) return;

    const durationMs = freePlan.durationDays * 24 * 60 * 60 * 1000;
    await db.insert(subscriptionsTable).values({
      sellerId: userId,
      planId: freePlan.id,
      status: "active",
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + durationMs),
    });
  } catch {
    // Non-fatal: don't block auth flow if plan assignment fails
  }
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  try {
    const {
      role = "buyer",
      accountType = "individual",
      firstName,
      lastName,
      email,
      phone,
      address,
      password,
      // Seller-specific
      lotName,
      businessName,
      businessRegNumber,
    } = req.body as {
      role?: string;
      accountType?: string;
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      address?: string;
      password: string;
      lotName?: string;
      businessName?: string;
      businessRegNumber?: string;
    };

    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({ error: "First name, last name, email and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const validRoles = ["buyer", "seller"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: "Role must be buyer or seller" });
      return;
    }

    // Check email uniqueness
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    // If seller has a Car Lot name, force business type
    const resolvedAccountType =
      role === "seller" && lotName?.trim()
        ? "company"
        : accountType === "company"
        ? "company"
        : "individual";

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(usersTable)
      .values({
        role: role as "buyer" | "seller",
        accountType: resolvedAccountType as "individual" | "company",
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        passwordHash,
        status: "pending_verification",
        emailVerified: false,
      })
      .returning();

    // Create role-specific profile
    if (role === "seller") {
      await db.insert(sellerProfilesTable).values({
        userId: user.id,
        lotName: lotName?.trim() || null,
        businessName: businessName?.trim() || null,
        businessRegNumber: businessRegNumber?.trim() || null,
        location: address?.trim() || null,
        verificationStatus: "unverified",
      });
    } else {
      await db.insert(buyerProfilesTable).values({
        userId: user.id,
        businessName:
          resolvedAccountType === "company" ? businessName?.trim() || null : null,
        businessRegNumber:
          resolvedAccountType === "company"
            ? businessRegNumber?.trim() || null
            : null,
        billingAddress: address?.trim() || null,
      });
    }

    // Auto-assign the free plan (lowest-priced active plan) to every new user
    await assignDefaultPlan(user.id);

    // Generate & store OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await db.insert(otpVerificationsTable).values({
      userId: user.id,
      otpCode: hashOtp(otp),
      purpose: "email_verify",
      expiresAt,
      used: false,
    });

    const otpSent = await trySendOtpEmail(user.email, otp, "email_verify", user.firstName);

    res.status(201).json({
      message: "Account created. Check your email for the verification code.",
      userId: user.id,
      email: user.email,
      otpSent,
      ...(shouldExposeDevOtp() && { devOtp: otp }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────

router.post("/auth/verify-otp", otpRateLimiter, async (req, res) => {
  try {
    const { userId, otp } = req.body as { userId: number; otp: string };

    if (!userId || !otp) {
      res.status(400).json({ error: "userId and otp are required" });
      return;
    }

    const record = await db
      .select()
      .from(otpVerificationsTable)
      .where(
        and(
          eq(otpVerificationsTable.userId, userId),
          eq(otpVerificationsTable.purpose, "email_verify"),
          eq(otpVerificationsTable.used, false)
        )
      )
      .orderBy(desc(otpVerificationsTable.createdAt))
      .limit(1)
      .then((rows) => rows[0]);

    if (!record) {
      res.status(400).json({ error: "No pending verification found" });
      return;
    }

    if (new Date() > record.expiresAt) {
      res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      return;
    }

    if (record.otpCode !== hashOtp(otp.trim())) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    // Mark OTP used
    await db
      .update(otpVerificationsTable)
      .set({ used: true })
      .where(eq(otpVerificationsTable.id, record.id));

    // Activate user
    const [user] = await db
      .update(usersTable)
      .set({ emailVerified: true, status: "active" })
      .where(eq(usersTable.id, userId))
      .returning();

    // Issue session cookie
    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    res.cookie("token", token, COOKIE_OPTS);
    void sendWelcomeEmail({
      email: user.email,
      firstName: user.firstName,
    }).catch((error) => {
      console.error("welcome email send failed", error);
    });

    res.json({
      message: "Account verified successfully!",
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        accountType: user.accountType,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// ─── POST /auth/resend-otp ────────────────────────────────────────────────────

router.post("/auth/resend-otp", otpRateLimiter, async (req, res) => {
  try {
    const { userId } = req.body as { userId: number };
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.emailVerified) {
      res.status(400).json({ error: "Email is already verified" });
      return;
    }

    // Invalidate previous OTPs
    const existingOtps = await db
      .select()
      .from(otpVerificationsTable)
      .where(
        and(
          eq(otpVerificationsTable.userId, userId),
          eq(otpVerificationsTable.purpose, "email_verify"),
          eq(otpVerificationsTable.used, false)
        )
      );

    for (const otpRecord of existingOtps) {
      await db
        .update(otpVerificationsTable)
        .set({ used: true })
        .where(eq(otpVerificationsTable.id, otpRecord.id));
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpVerificationsTable).values({
      userId: user.id,
      otpCode: hashOtp(otp),
      purpose: "email_verify",
      expiresAt,
      used: false,
    });

    const otpSent = await trySendOtpEmail(user.email, otp, "email_verify", user.firstName);

    res.json({
      message: "A new verification code has been sent to your email.",
      otpSent,
      ...(shouldExposeDevOtp() && { devOtp: otp }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to resend OTP." });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.status === "suspended") {
      if (user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()) {
        await db
          .update(usersTable)
          .set({ status: "active", suspendedUntil: null, updatedAt: new Date() })
          .where(eq(usersTable.id, user.id));
        user.status = "active";
        user.suspendedUntil = null;
      } else {
        res.status(403).json({ error: "Your account has been suspended. Contact support." });
        return;
      }
    }

    if (!user.emailVerified) {
      // Invalidate existing unused email_verify OTPs
      await db
        .update(otpVerificationsTable)
        .set({ used: true })
        .where(
          and(
            eq(otpVerificationsTable.userId, user.id),
            eq(otpVerificationsTable.purpose, "email_verify"),
            eq(otpVerificationsTable.used, false)
          )
        );

      // Re-send OTP and ask to verify
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.insert(otpVerificationsTable).values({
        userId: user.id,
        otpCode: hashOtp(otp),
        purpose: "email_verify",
        expiresAt,
        used: false,
      });
      const otpSent = await trySendOtpEmail(user.email, otp, "email_verify", user.firstName);

      res.status(403).json({
        error: "Email not verified",
        requiresVerification: true,
        userId: user.id,
        email: user.email,
        otpSent,
        ...(shouldExposeDevOtp() && { devOtp: otp }),
      });
      return;
    }

    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    res.cookie("token", token, COOKIE_OPTS);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        accountType: user.accountType,
        profilePhotoUrl: user.profilePhotoUrl,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─── GET /auth/google ─────────────────────────────────────────────────────────

router.get("/auth/google", async (req, res) => {
  const client = createGoogleClient();
  if (!client || !process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Google sign-in is not configured" });
    return;
  }

  let state = randomBytes(24).toString("hex");
  
  // If the mobile app passes a returnTo URL, append it to the state
  // so we can redirect back to the app after the OAuth flow completes
  const returnTo = String(req.query.returnTo || "");
  if (returnTo) {
    state = `${state}:::${encodeURIComponent(returnTo)}`;
  }

  res.cookie(GOOGLE_STATE_COOKIE, state.split(":::")[0], {
    ...COOKIE_OPTS,
    maxAge: 10 * 60 * 1000,
  });

  const authUrl = client.generateAuthUrl({
    access_type: "online",
    scope: GOOGLE_SCOPE,
    state, // Pass the full state (with returnTo appended) to Google
    prompt: "select_account",
  });
  res.redirect(authUrl);
});

// ─── GET /auth/google/callback ────────────────────────────────────────────────

router.get("/auth/google/callback", async (req, res) => {
  try {
    // If a mobile app triggered the login, it will pass a returnTo state
    const incomingState = String(req.query.state || "");
    const expectedState = req.cookies?.[GOOGLE_STATE_COOKIE];
    
    // Check if the state contains our mobile deep link delimiter
    let isMobile = false;
    let mobileReturnUrl = "";
    let pureState = incomingState;
    
    if (incomingState.includes(":::")) {
      const parts = incomingState.split(":::");
      pureState = parts[0];
      mobileReturnUrl = decodeURIComponent(parts[1]);
      isMobile = true;
    }

    const oauthError = String(req.query.error || "");
    if (oauthError) {
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?error=${encodeURIComponent(oauthError)}`);
      } else {
        redirectWithGoogleError(res, oauthError);
      }
      return;
    }

    res.clearCookie(GOOGLE_STATE_COOKIE, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
    });

    if (!expectedState || !pureState || expectedState !== pureState) {
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?error=state_mismatch`);
      } else {
        redirectWithGoogleError(res, "state_mismatch");
      }
      return;
    }

    const code = String(req.query.code || "");
    if (!code) {
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?error=missing_code`);
      } else {
        redirectWithGoogleError(res, "missing_code");
      }
      return;
    }

    const client = createGoogleClient();
    if (!client || !process.env.GOOGLE_CLIENT_ID) {
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?error=not_configured`);
      } else {
        redirectWithGoogleError(res, "not_configured");
      }
      return;
    }

    const tokenResp = await client.getToken(code);
    const idToken = tokenResp.tokens.id_token;
    if (!idToken) {
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?error=missing_id_token`);
      } else {
        redirectWithGoogleError(res, "missing_id_token");
      }
      return;
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const profile = ticket.getPayload();

    const sub = profile?.sub || "";
    const email = (profile?.email || "").toLowerCase().trim();
    const emailVerified = !!profile?.email_verified;
    const firstName = (profile?.given_name || profile?.name || "").trim() || "Google";
    const lastName = (profile?.family_name || "").trim() || "User";
    const picture = profile?.picture || undefined;

    if (!sub || !email || !emailVerified) {
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?error=invalid_google_profile`);
      } else {
        redirectWithGoogleError(res, "invalid_google_profile");
      }
      return;
    }

    const [byGoogleId] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, sub))
      .limit(1);

    if (byGoogleId) {
      const token = signToken({
        userId: byGoogleId.id,
        role: byGoogleId.role,
        email: byGoogleId.email,
      });
      res.cookie("token", token, COOKIE_OPTS);
      res.clearCookie(GOOGLE_ONBOARDING_COOKIE, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
      });
      
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?token=${token}`);
      } else {
        res.redirect(`${getFrontendBaseUrl()}${getRoleRedirectPath(byGoogleId.role)}?token=${token}`);
      }
      return;
    }

    const [byEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== sub) {
        if (isMobile && mobileReturnUrl) {
          res.redirect(`${mobileReturnUrl}?error=google_account_conflict`);
        } else {
          redirectWithGoogleError(res, "google_account_conflict");
        }
        return;
      }

      const [linkedUser] = await db
        .update(usersTable)
        .set({
          googleId: sub,
          emailVerified: true,
          status: byEmail.status === "pending_verification" ? "active" : byEmail.status,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, byEmail.id))
        .returning();

      const token = signToken({
        userId: linkedUser.id,
        role: linkedUser.role,
        email: linkedUser.email,
      });
      res.cookie("token", token, COOKIE_OPTS);
      res.clearCookie(GOOGLE_ONBOARDING_COOKIE, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
      });
      
      if (isMobile && mobileReturnUrl) {
        res.redirect(`${mobileReturnUrl}?token=${token}`);
      } else {
        res.redirect(`${getFrontendBaseUrl()}${getRoleRedirectPath(linkedUser.role)}?token=${token}`);
      }
      return;
    }

    const onboardingToken = signGoogleOnboardingToken({
      sub,
      email,
      firstName,
      lastName,
      picture,
    });
    res.cookie(GOOGLE_ONBOARDING_COOKIE, onboardingToken, {
      ...COOKIE_OPTS,
      maxAge: 15 * 60 * 1000,
    });
    
    if (isMobile && mobileReturnUrl) {
      res.redirect(`${mobileReturnUrl}?onboardingToken=${onboardingToken}`);
    } else {
      res.redirect(`${getFrontendBaseUrl()}/google-onboarding?onboardingToken=${onboardingToken}`);
    }
  } catch (err) {
    console.error(err);
    // Best effort fallback
    const incomingState = String(req.query.state || "");
    if (incomingState.includes(":::")) {
      const parts = incomingState.split(":::");
      res.redirect(`${decodeURIComponent(parts[1])}?error=callback_failed`);
    } else {
      redirectWithGoogleError(res, "callback_failed");
    }
  }
});

// ─── GET /auth/google/pending ─────────────────────────────────────────────────

router.get("/auth/google/pending", (req, res) => {
  let onboardingToken = req.cookies?.[GOOGLE_ONBOARDING_COOKIE];
  if (!onboardingToken && req.headers.authorization?.startsWith("Bearer ")) {
    onboardingToken = req.headers.authorization.split(" ")[1];
  }
  if (!onboardingToken && typeof req.query.onboardingToken === "string") {
    onboardingToken = req.query.onboardingToken;
  }

  if (!onboardingToken) {
    res.status(404).json({ error: "No pending Google onboarding session" });
    return;
  }

  const payload = verifyGoogleOnboardingToken(onboardingToken);
  if (!payload) {
    res.clearCookie(GOOGLE_ONBOARDING_COOKIE, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
    });
    res.status(401).json({ error: "Google onboarding session expired" });
    return;
  }

  res.json({
    profile: {
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      picture: payload.picture ?? null,
    },
  });
});

// ─── POST /auth/google/complete ───────────────────────────────────────────────

router.post("/auth/google/complete", authRateLimiter, async (req, res) => {
  try {
    let onboardingToken = req.cookies?.[GOOGLE_ONBOARDING_COOKIE];
    if (!onboardingToken && req.headers.authorization?.startsWith("Bearer ")) {
      onboardingToken = req.headers.authorization.split(" ")[1];
    }
    if (!onboardingToken && req.body.onboardingToken) {
      onboardingToken = req.body.onboardingToken;
    }

    if (!onboardingToken) {
      res.status(401).json({ error: "Google onboarding session not found" });
      return;
    }

    const payload = verifyGoogleOnboardingToken(onboardingToken);
    if (!payload) {
      res.clearCookie(GOOGLE_ONBOARDING_COOKIE, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
      });
      res.status(401).json({ error: "Google onboarding session expired" });
      return;
    }

    const { role, lotName } = req.body as { role?: string; lotName?: string };
    if (role !== "buyer" && role !== "seller") {
      res.status(400).json({ error: "Role must be buyer or seller" });
      return;
    }

    const normalizedEmail = payload.email.toLowerCase().trim();
    const [existingByGoogle] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.googleId, payload.sub))
      .limit(1);
    if (existingByGoogle) {
      res.status(409).json({ error: "Google account is already linked to another user" });
      return;
    }

    const [existingByEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);
    if (existingByEmail) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const trimmedLotName = lotName?.trim() || null;
    const resolvedAccountType =
      role === "seller" && trimmedLotName ? "company" : "individual";

    const [user] = await db
      .insert(usersTable)
      .values({
        role,
        accountType: resolvedAccountType,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: normalizedEmail,
        passwordHash: null,
        googleId: payload.sub,
        profilePhotoUrl: payload.picture ?? null,
        emailVerified: true,
        status: "active",
      })
      .returning();

    if (role === "seller") {
      await db.insert(sellerProfilesTable).values({
        userId: user.id,
        lotName: trimmedLotName,
        verificationStatus: "unverified",
      });
    } else {
      await db.insert(buyerProfilesTable).values({
        userId: user.id,
      });
    }

    await assignDefaultPlan(user.id);

    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    res.cookie("token", token, COOKIE_OPTS);
    res.clearCookie(GOOGLE_ONBOARDING_COOKIE, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
    });
    void sendWelcomeEmail({
      email: user.email,
      firstName: user.firstName,
    }).catch((error) => {
      console.error("welcome email send failed", error);
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        accountType: user.accountType,
        profilePhotoUrl: user.profilePhotoUrl,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to complete Google onboarding" });
  }
});

// ─── GET /auth/google/health ──────────────────────────────────────────────────

router.get("/auth/google/health", requireAdmin, (_req: AuthRequest, res: Response) => {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.GOOGLE_CALLBACK_URL) missing.push("GOOGLE_CALLBACK_URL");
  if (!process.env.FRONTEND_URL && !process.env.ALLOWED_ORIGIN) {
    missing.push("FRONTEND_URL or ALLOWED_ORIGIN");
  }

  const callbackUrl = getGoogleCallbackUrl();
  const frontendBaseUrl = getFrontendBaseUrl();

  res.json({
    provider: "google",
    configured: googleReady(),
    callbackUrl,
    frontendBaseUrl,
    missing,
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    domain:
      process.env.NODE_ENV === "production"
        ? process.env.COOKIE_DOMAIN
        : undefined,
  });
  res.clearCookie(GOOGLE_ONBOARDING_COOKIE, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    domain:
      process.env.NODE_ENV === "production"
        ? process.env.COOKIE_DOMAIN
        : undefined,
  });
  res.json({ message: "Logged out successfully" });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user) {
      res.clearCookie("token");
      res.status(401).json({ error: "User not found" });
      return;
    }

    let inspectorLocation: string | null = null;
    if (user.role === "inspector") {
      const [inspectorProfile] = await db
        .select({ serviceArea: inspectorProfilesTable.serviceArea })
        .from(inspectorProfilesTable)
        .where(eq(inspectorProfilesTable.userId, user.id))
        .limit(1);
      inspectorLocation = inspectorProfile?.serviceArea ?? null;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        accountType: user.accountType,
        status: user.status,
        emailVerified: user.emailVerified,
        profilePhotoUrl: user.profilePhotoUrl,
        location: inspectorLocation,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ─── PATCH /auth/profile ──────────────────────────────────────────────────────

router.patch("/auth/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, phone, profilePhotoUrl, location } = req.body as {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      profilePhotoUrl?: string | null;
      location?: string | null;
    };

    const updates: Partial<{
      firstName: string;
      lastName: string;
      phone: string | null;
      profilePhotoUrl: string | null;
      updatedAt: Date;
    }> = {};

    if (typeof firstName === "string") {
      const v = firstName.trim();
      if (!v) {
        res.status(400).json({ error: "First name cannot be empty" });
        return;
      }
      updates.firstName = v;
    }
    if (typeof lastName === "string") {
      const v = lastName.trim();
      if (!v) {
        res.status(400).json({ error: "Last name cannot be empty" });
        return;
      }
      updates.lastName = v;
    }
    if (phone !== undefined) {
      updates.phone = phone === null ? null : String(phone).trim() || null;
    }
    if (profilePhotoUrl !== undefined) {
      updates.profilePhotoUrl =
        profilePhotoUrl === null ? null : String(profilePhotoUrl).trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No changes supplied" });
      return;
    }

    const [before] = await db
      .select({
        profilePhotoUrl: usersTable.profilePhotoUrl,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    updates.updatedAt = new Date();

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.user!.userId))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let responseLocation: string | null = null;
    if (before?.role === "inspector") {
      if (location !== undefined) {
        const cleanLocation =
          location === null ? null : String(location).trim() || null;
        const [existingInspectorProfile] = await db
          .select({ id: inspectorProfilesTable.id })
          .from(inspectorProfilesTable)
          .where(eq(inspectorProfilesTable.userId, req.user!.userId))
          .limit(1);

        if (existingInspectorProfile) {
          await db
            .update(inspectorProfilesTable)
            .set({ serviceArea: cleanLocation, updatedAt: new Date() })
            .where(eq(inspectorProfilesTable.userId, req.user!.userId));
        } else {
          await db.insert(inspectorProfilesTable).values({
            userId: req.user!.userId,
            serviceArea: cleanLocation,
            isAvailable: true,
          });
        }
      }

      const [updatedInspectorProfile] = await db
        .select({ serviceArea: inspectorProfilesTable.serviceArea })
        .from(inspectorProfilesTable)
        .where(eq(inspectorProfilesTable.userId, req.user!.userId))
        .limit(1);
      responseLocation = updatedInspectorProfile?.serviceArea ?? null;
    }

    if (profilePhotoUrl !== undefined) {
      const oldUrl = before?.profilePhotoUrl ?? null;
      const newUrl = user.profilePhotoUrl ?? null;
      if (oldUrl && oldUrl !== newUrl) {
        void deleteManagedMediaRef(oldUrl, req.log);
      }
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        accountType: user.accountType,
        status: user.status,
        emailVerified: user.emailVerified,
        profilePhotoUrl: user.profilePhotoUrl,
        location: responseLocation,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ─── POST /auth/change-password ───────────────────────────────────────────────

router.post("/auth/change-password", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current and new password are required" });
      return;
    }

    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      res
        .status(400)
        .json({ error: "New password must be at least 8 characters and contain letters and numbers" });
      return;
    }

    if (currentPassword === newPassword) {
      res
        .status(400)
        .json({ error: "New password must be different from the current password" });
      return;
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user || !user.passwordHash) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body as { email: string };
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1)
      .then((rows) => rows[0]);

    // Don't reveal if the account exists
    if (!user) {
      res.json({ message: "If an account exists with this email, a reset code has been sent." });
      return;
    }

    // Invalidate previous unused reset OTPs
    await db
      .update(otpVerificationsTable)
      .set({ used: true })
      .where(
        and(
          eq(otpVerificationsTable.userId, user.id),
          eq(otpVerificationsTable.purpose, "password_reset"),
          eq(otpVerificationsTable.used, false)
        )
      );

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpVerificationsTable).values({
      userId: user.id,
      otpCode: hashOtp(otp),
      purpose: "password_reset",
      expiresAt,
      used: false,
    });

    const otpSent = await trySendOtpEmail(user.email, otp, "password_reset", user.firstName);

    res.json({
      message: "If an account exists with this email, a reset code has been sent.",
      userId: user.id,
      otpSent,
      ...(shouldExposeDevOtp() && { devOtp: otp }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process request." });
  }
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────

router.post("/auth/reset-password", authRateLimiter, async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body as {
      userId: number;
      otp: string;
      newPassword: string;
    };

    if (!userId || !otp || !newPassword) {
      res.status(400).json({ error: "userId, otp and newPassword are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const record = await db
      .select()
      .from(otpVerificationsTable)
      .where(
        and(
          eq(otpVerificationsTable.userId, userId),
          eq(otpVerificationsTable.purpose, "password_reset"),
          eq(otpVerificationsTable.used, false)
        )
      )
      .orderBy(desc(otpVerificationsTable.createdAt))
      .limit(1)
      .then((rows) => rows[0]);

    if (!record || new Date() > record.expiresAt || record.otpCode !== hashOtp(otp.trim())) {
      res.status(400).json({ error: "Invalid or expired reset code" });
      return;
    }

    await db
      .update(otpVerificationsTable)
      .set({ used: true })
      .where(eq(otpVerificationsTable.id, record.id));

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, userId));

    res.json({ message: "Password updated successfully. You can now sign in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

export default router;
