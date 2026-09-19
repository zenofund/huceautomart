# HUCE Autos — Deployment Guide
### Frontend on cPanel · Backend on Render

For the API-only Hostinger Node.js Web App deployment, use [HOSTINGER.md](HOSTINGER.md).
The settings below describe the older Render/cPanel deployment.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Required Code Changes Before Deployment](#3-required-code-changes-before-deployment)
4. [Backend — Deploy to Render](#4-backend--deploy-to-render)
5. [Database — PostgreSQL on Render](#5-database--postgresql-on-render)
6. [Run Database Migrations](#6-run-database-migrations)
7. [Object Storage — Migrate from LEGACY to GCS](#7-object-storage--migrate-from-LEGACY-to-gcs)
8. [Frontend — Build & Deploy to cPanel](#8-frontend--build--deploy-to-cpanel)
9. [Connect Frontend to Backend (API Routing)](#9-connect-frontend-to-backend-api-routing)
10. [Custom Domains & SSL](#10-custom-domains--ssl)
11. [Paystack Webhook Reconfiguration](#11-paystack-webhook-reconfiguration)
12. [Final Environment Variable Reference](#12-final-environment-variable-reference)
13. [Go-Live Checklist](#13-go-live-checklist)

---

## 1. Architecture Overview

```
Browser
  │
  ├─ https://huceautos.com          (cPanel — static files)
  │    HTML / CSS / JS bundle
  │    .htaccess proxy rule
  │
  └─ https://api.huceautos.com      (Render — Node.js Web Service)
       Express 5 API (/api/*)
       PostgreSQL (Render managed DB)
       Google Cloud Storage (images)
```

**Why a custom API subdomain?**  
Using `api.huceautos.com` (a subdomain of the same root domain) keeps all HTTP requests
"same-site." This is required for `SameSite=Lax` auth cookies to be sent reliably by
browsers on cross-origin fetch calls from the frontend.

---

## 2. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS | Match this on Render |
| pnpm | 9+ | Render supports it natively |
| Git | any | Render deploys from a Git repo |
| cPanel hosting | any plan | Needs mod_rewrite; mod_proxy for the proxy approach |
| Render account | free tier works | Upgrade for production SLA |
| Google Cloud account | free tier | For object storage (images) |
| Paystack account | live keys | For payments |

---

## 3. Required Code Changes Before Deployment

Make these changes in the codebase first, then commit and push before deploying.

### 3.1 Lock down CORS to your production domain

The current CORS config accepts any origin (`origin: true`). In production this must be
restricted to your actual frontend URL.

**File: `artifacts/api-server/src/app.ts`**

```typescript
// Replace:
app.use(cors({ origin: true, credentials: true }));

// With:
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGIN   // e.g. "https://huceautos.com"
        : true,
    credentials: true,
  }),
);
```

Add `ALLOWED_ORIGIN=https://huceautos.com` to your Render environment variables.

### 3.2 Fix auth cookie settings for cross-origin subdomains

The cookie must travel from `api.huceautos.com` back to `huceautos.com` pages.
Setting `sameSite: "none"` in production (with `secure: true`) is the most
browser-compatible approach when the frontend and API are on different subdomains.

**File: `artifacts/api-server/src/routes/auth.ts`**

Find the `COOKIE_OPTS` constant (near the top) and update it:

```typescript
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (
    process.env.NODE_ENV === "production" ? "none" : "lax"
  ) as "none" | "lax",
  // Scope cookie to the root domain so it is readable by any subdomain.
  domain:
    process.env.NODE_ENV === "production"
      ? process.env.COOKIE_DOMAIN   // e.g. ".huceautos.com"  (leading dot is required)
      : undefined,
};
```

Add `COOKIE_DOMAIN=.huceautos.com` (note the leading dot) to Render env vars.

Also update the logout clear-cookie call to match:

```typescript
res.clearCookie("token", {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  domain: process.env.NODE_ENV === "production"
    ? process.env.COOKIE_DOMAIN
    : undefined,
});
```

### 3.3 Replace LEGACY object storage with GCS service account

The current object storage client authenticates via a LEGACY-specific sidecar process
that is only available inside LEGACY. On Render you must authenticate with a GCS
**service account JSON key** instead.

#### Step A — Create a GCS service account

1. Open [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts.
2. Create a new service account, e.g. `huceautos-storage`.
3. Grant it the **Storage Object Admin** role on your bucket.
4. Create a JSON key → download the file.
5. Open the file and **base64-encode its contents**:
   ```bash
   base64 -i service-account.json | tr -d '\n'
   ```
6. Store that base64 string as `GCS_SERVICE_ACCOUNT_B64` in Render env vars.

#### Step B — Update `objectStorage.ts`

**File: `artifacts/api-server/src/lib/objectStorage.ts`**

Replace the top section (lines 1–30) with:

```typescript
import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

function buildGcsCredentials() {
  // Production: authenticate with a service account JSON key stored as base64.
  if (process.env.GCS_SERVICE_ACCOUNT_B64) {
    const json = Buffer.from(
      process.env.GCS_SERVICE_ACCOUNT_B64,
      "base64",
    ).toString("utf8");
    return JSON.parse(json);
  }
  // Development on LEGACY: fall back to sidecar (keep old behaviour).
  return {
    audience: "LEGACY",
    subject_token_type: "access_token",
    token_url: "http://127.0.0.1:1106/token",
    type: "external_account",
    credential_source: {
      url: "http://127.0.0.1:1106/credential",
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  };
}

export const objectStorageClient = new Storage({
  credentials: buildGcsCredentials(),
  projectId: process.env.GCS_PROJECT_ID || "",
});
```

Replace the existing signed-URL fetch call (line ~248) from:
```typescript
  `${LEGACY_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
```

With a native GCS signed URL using the service account (the `@google-cloud/storage`
SDK's `file.getSignedUrl()` method). Alternatively, make all uploaded objects public
and serve them directly from `storage.googleapis.com`.

> **Current implementation (recommended):** Use [Cloudinary](https://cloudinary.com)
> for new uploads. The API now signs browser uploads through
> `POST /api/storage/uploads/cloudinary-signature`, and the frontend uploads
> directly to Cloudinary with the returned signature.
>
> Required env vars:
> - `CLOUDINARY_CLOUD_NAME`
> - `CLOUDINARY_API_KEY`
> - `CLOUDINARY_API_SECRET`
> - `CLOUDINARY_UPLOAD_FOLDER` (optional, default: `huce-autos`)
>
> `GCS_*` variables may be kept temporarily only for legacy `/api/storage/objects/*`
> assets until old media is migrated.

---

## 4. Backend — Deploy to Render

### 4.1 Push your code to GitHub (or GitLab)

Render deploys from a Git repository. Make sure all of the code changes from section 3
are committed and pushed:

```bash
git add -A
git commit -m "chore: prepare for production deployment"
git push origin main
```

### 4.2 Create a Render Web Service

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub repository.
3. Fill in the settings:

| Setting | Value |
|---|---|
| **Name** | `huceautos-api` |
| **Region** | Choose closest to Nigeria (e.g. Frankfurt) |
| **Branch** | `main` |
| **Runtime** | Node |
| **Root Directory** | *(leave blank — Render uses the repo root)* |
| **Build Command** | `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build` |
| **Start Command** | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |
| **Instance Type** | Starter ($7/month) or higher for production |

> **Why `pnpm install --frozen-lockfile`?** The repo uses a pnpm workspace. Render
> does not install pnpm by default — the build command installs it first.

### 4.3 Set environment variables on Render

In the **Environment** tab of your Web Service, add each variable:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` *(Render assigns this automatically; just declare it)* |
| `DATABASE_URL` | *(auto-populated if you use Render's PostgreSQL — see §5)* |
| `JWT_SECRET` | A long random string — generate with `openssl rand -hex 32` |
| `PAYSTACK_SECRET_KEY` | Your Paystack live secret key (`sk_live_…`) |
| `PAYSTACK_PUBLIC_KEY` | Your Paystack live public key (`pk_live_…`) |
| `ALLOWED_ORIGIN` | `https://huceautos.com` |
| `COOKIE_DOMAIN` | `.huceautos.com` |
| `GCS_PROJECT_ID` | Your Google Cloud project ID |
| `GCS_SERVICE_ACCOUNT_B64` | Base64-encoded service account JSON (see §3.3) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `gs://your-bucket-name/public` |
| `PRIVATE_OBJECT_DIR` | `gs://your-bucket-name/private` |

> **Never commit secrets to Git.** All sensitive values must only live in Render's
> environment variable store.

---

## 5. Database — PostgreSQL on Render

### Option A — Render managed PostgreSQL (recommended)

1. Render Dashboard → **New** → **PostgreSQL**.
2. Choose the same region as your Web Service.
3. Name it `huceautos-db`.
4. After creation, go to the database's **Info** tab and copy the **Internal Database URL**.
5. In your Web Service's environment variables, set `DATABASE_URL` to that URL.
   Render automatically links services in the same account — you can also use the
   "Add from database" shortcut in the environment tab.

### Option B — External PostgreSQL

If you already have a PostgreSQL instance (e.g. Supabase, Neon, or your own VPS):

- Set `DATABASE_URL` to the full connection string:
  `postgresql://user:password@host:5432/dbname?sslmode=require`

---

## 6. Run Database Migrations

The project uses **Drizzle ORM** with a `push` strategy (schema sync rather than
migration files). After the Render service starts for the first time, run the schema
push from your local machine against the production database:

```bash
# Set the production DATABASE_URL in your shell temporarily
export DATABASE_URL="postgresql://..."

# Push the schema to the production database
pnpm --filter @workspace/db run push
```

> This is safe to run repeatedly — Drizzle only applies the diff between the current
> schema and the database state.

**Then seed the first admin account** (if needed):

```bash
pnpm --filter @workspace/db run seed
```

For subsequent deployments, re-run `pnpm --filter @workspace/db run push` whenever
the Drizzle schema files change.

---

## 7. Object Storage — Migrate from LEGACY to GCS

If you created files (car images, profile photos) on LEGACY, you need to copy them to
your production GCS bucket before going live.

### 7.1 Create a GCS bucket

1. Google Cloud Console → Cloud Storage → **Create Bucket**.
2. Name: `huceautos-media` (globally unique — adjust as needed).
3. Region: `europe-west1` (Frankfurt) or closest to your users.
4. Uniform access control: enabled.
5. Create two folders inside the bucket: `public/` and `private/`.

### 7.2 Configure public access for car images

For car listing images that are publicly viewable, grant allUsers the
"Storage Object Viewer" role on the `public/` prefix:

1. Bucket → Permissions → Grant Access.
2. New principals: `allUsers`.
3. Role: **Storage Object Viewer**.
4. Condition: `resource.name.startsWith("projects/_/buckets/huceautos-media/objects/public/")`.

### 7.3 Copy files from LEGACY

Use `gsutil` (Google Cloud SDK) after authenticating with your service account:

```bash
# Authenticate
export GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Copy the LEGACY public objects
gsutil -m cp -r gs://LEGACY-bucket/public/ gs://huceautos-media/public/

# Copy private objects
gsutil -m cp -r gs://LEGACY-bucket/private/ gs://huceautos-media/private/
```

---

## 8. Frontend — Build & Deploy to cPanel

### 8.1 Build the frontend locally

The build requires two environment variables. Set them before running the build:

```bash
# Windows (PowerShell)
$env:PORT="3000"
$env:BASE_PATH="/"
$env:NODE_ENV="production"

# macOS / Linux
export PORT=3000
export BASE_PATH=/
export NODE_ENV=production

# Build
pnpm --filter @workspace/huce-autos run build
```

The output is written to:
```
artifacts/huce-autos/dist/public/
```

This folder contains `index.html`, the `assets/` folder (JS/CSS chunks), and any
static images (e.g. `hero-cars.png`) copied from `attached_assets/`.

### 8.2 Upload to cPanel

1. Log in to cPanel → **File Manager**.
2. Navigate to `public_html` (or the subdirectory for your domain).
3. Upload all contents of `artifacts/huce-autos/dist/public/` directly into `public_html`.
   - Upload as a zip and extract, or use FTP (FileZilla) for large uploads.
4. Confirm `index.html` is at the root of `public_html`.

### 8.3 Create `.htaccess` for SPA routing + API proxy

Create a file called `.htaccess` in `public_html` with the following contents:

```apache
Options -MultiViews
RewriteEngine On

# ── API Proxy ────────────────────────────────────────────────────────────────
# Forward all /api/* requests to your Render backend.
# This keeps everything on the same origin so cookies work without sameSite=none.
#
# Requires mod_proxy and mod_proxy_http to be enabled on your cPanel host.
# Ask your hosting provider to enable these modules if the proxy rules don't work.

<IfModule mod_proxy.c>
  ProxyPreserveHost Off
  RequestHeader set X-Forwarded-Proto "https"

  ProxyPass        /api/  https://api.huceautos.com/api/
  ProxyPassReverse /api/  https://api.huceautos.com/api/
</IfModule>

# ── SPA Client-Side Routing ───────────────────────────────────────────────────
# All non-file, non-directory requests serve index.html so wouter handles routing.

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ /index.html [L]
```

> **If your host does not support `mod_proxy`** (common on basic shared hosting):
> - Skip the ProxyPass block.
> - Set up a subdomain `api.huceautos.com` pointing to Render (see §10).
> - Update the code changes in §3.2 so cookies travel between subdomains.
> - Update all `fetch('/api/...')` calls to use `https://api.huceautos.com/api/...`
>   via a `VITE_API_BASE_URL` environment variable baked in at build time.

---

## 9. Connect Frontend to Backend (API Routing)

### If using the .htaccess proxy (recommended)

No frontend code changes needed. The browser sends requests to
`https://huceautos.com/api/...` and cPanel transparently forwards them to
`https://api.huceautos.com/api/...`. Auth cookies are scoped to `huceautos.com`
so they travel with every request automatically.

### If your host does not support mod_proxy

You must tell the frontend where the API lives. The minimal change:

**1. Add a utility in `artifacts/huce-autos/src/lib/api.ts`:**

```typescript
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}
```

**2. Set the build-time variable:**

```bash
export VITE_API_BASE_URL=https://api.huceautos.com
```

**3. Replace existing `jsonFetch` calls** across the frontend pages with `apiFetch`
from this utility (or point all files at this shared helper via a global find-replace).

---

## 10. Custom Domains & SSL

### Backend — api.huceautos.com → Render

1. Render Dashboard → your Web Service → **Settings** → **Custom Domains**.
2. Add `api.huceautos.com`.
3. Render provides a CNAME target (e.g. `huceautos-api.onrender.com`).
4. In your domain registrar (or cPanel DNS Zone Editor), add:
   ```
   Type:  CNAME
   Name:  api
   Value: huceautos-api.onrender.com
   TTL:   3600
   ```
5. Render automatically provisions a Let's Encrypt TLS certificate.

### Frontend — huceautos.com → cPanel

cPanel typically manages SSL automatically via Let's Encrypt through
**AutoSSL**. Verify it is enabled:

1. cPanel → **SSL/TLS** → **Manage SSL Sites** → confirm your domain has a valid cert.
2. If not, run cPanel → **SSL/TLS Status** → **Run AutoSSL**.

Alternatively use Cloudflare (free) as a CDN + SSL layer in front of cPanel — this
also gives you the option to use Cloudflare Workers as a lightweight API proxy if
your host doesn't support `mod_proxy`.

---

## 11. Paystack Webhook Reconfiguration

Your Paystack webhook URL must be updated to point to the production Render endpoint.

1. Log in to [dashboard.paystack.com](https://dashboard.paystack.com).
2. Settings → **API Keys & Webhooks**.
3. Update the webhook URL to:
   ```
   https://api.huceautos.com/api/paystack/webhook
   ```
4. Copy the **Webhook Secret** and add it to Render env vars as `PAYSTACK_WEBHOOK_SECRET`
   (if your route uses it for signature verification).

Verify the webhook is working by making a test payment and checking Render's logs.

---

## 12. Final Environment Variable Reference

### Render (API Server)

| Variable | Required | Example / Notes |
|---|---|---|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Auto | Set by Render automatically |
| `DATABASE_URL` | Yes | `postgresql://user:pass@host/db?sslmode=require` |
| `JWT_SECRET` | Yes | 64-character random hex string |
| `PAYSTACK_SECRET_KEY` | Yes | `sk_live_…` |
| `PAYSTACK_PUBLIC_KEY` | Yes | `pk_live_…` |
| `ALLOWED_ORIGIN` | Yes | `https://huceautos.com` |
| `COOKIE_DOMAIN` | Yes | `.huceautos.com` (leading dot) |
| `GCS_PROJECT_ID` | Yes | Google Cloud project ID |
| `GCS_SERVICE_ACCOUNT_B64` | Yes | Base64 of service account JSON |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Yes | `gs://huceautos-media/public` |
| `PRIVATE_OBJECT_DIR` | Yes | `gs://huceautos-media/private` |
| `LOG_LEVEL` | No | `info` (default) |

### Frontend build (set before running `pnpm build`)

| Variable | Required | Example / Notes |
|---|---|---|
| `PORT` | Yes | Any free port, e.g. `3000` |
| `BASE_PATH` | Yes | `/` (root path on cPanel) |
| `NODE_ENV` | Yes | `production` |
| `VITE_API_BASE_URL` | Only if no .htaccess proxy | `https://api.huceautos.com` |

---

## 13. Go-Live Checklist

Work through this list before announcing the site publicly.

### Code
- [ ] CORS restricted to `https://huceautos.com` in `app.ts`
- [ ] Cookie `sameSite`/`domain` updated in `auth.ts` for production
- [ ] Object storage authenticating via GCS service account (not LEGACY sidecar)
- [ ] All changes committed and pushed to the deployment branch

### Render (Backend)
- [ ] Web Service created, connected to Git repo
- [ ] Build and start commands confirmed (first deploy succeeded)
- [ ] All environment variables set (no placeholder values)
- [ ] PostgreSQL database provisioned and linked
- [ ] Custom domain `api.huceautos.com` added and SSL active
- [ ] Health check: `curl https://api.huceautos.com/api/auth/me` returns 401 (not 404)

### Database
- [ ] `pnpm --filter @workspace/db run push` run against production DB
- [ ] Admin seed account created and login confirmed
- [ ] Subscription plans seeded (if applicable)

### cPanel (Frontend)
- [ ] Build output uploaded to `public_html`
- [ ] `.htaccess` with SPA routing and API proxy in place
- [ ] `https://huceautos.com` loads the app without errors
- [ ] SSL certificate active (HTTPS only — no HTTP access)

### Paystack
- [ ] Webhook URL updated to `https://api.huceautos.com/api/paystack/webhook`
- [ ] Test payment completed end-to-end (buyer → checkout → webhook → purchase record)
- [ ] Live keys (not test keys) in Render env vars

### Object Storage
- [ ] Production GCS bucket created with `public/` and `private/` folders
- [ ] Existing media files copied from LEGACY bucket to GCS bucket
- [ ] Image upload and retrieval tested on production

### Post-launch
- [ ] Monitor Render logs for the first hour (`Logs` tab in the Web Service dashboard)
- [ ] Test sign-up, sign-in, and sign-out flows on production URL
- [ ] Test a listing creation with image upload
- [ ] Confirm Paystack webhook delivery in the Paystack dashboard logs

