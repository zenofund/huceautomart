# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Workflows

- **Start application** — Frontend (port 25070): `PORT=25070 BASE_PATH=/ pnpm --filter @workspace/huce-autos run dev`
- **API Server** — Backend (port 8080): `PORT=8080 pnpm --filter @workspace/api-server run dev`

## Database Schema

**34 tables** across 10 domain files in `lib/db/src/schema/`. Push changes with:
```
pnpm --filter @workspace/db run push
```

### User Roles & Profiles
| File | Tables | Description |
|---|---|---|
| `users.ts` | `users`, `otp_verifications`, `seller_profiles`, `buyer_profiles`, `inspector_profiles` | Core user system with 4 roles: `buyer`, `seller`, `inspector`, `admin`. Seller verification (NIN, proof of address, bank details). |
| `subscriptions.ts` | `subscription_plans`, `subscriptions` | Seller subscription tiers. Plans have `maxListings`, `maxPhotos`, `durationDays`, `featuredListingEnabled`, `analyticsDashboardEnabled`, `isFeatured`, `features[]`. Free plan auto-assigned to all new users on registration. |

### Marketplace
| File | Tables | Description |
|---|---|---|
| `listings.ts` | `listings`, `listing_images`, `car_categories`, `car_features`, `listing_feature_links`, `saved_vehicles`, `car_view_history`, `delete_listing_requests` | Full car listing system with images, admin-managed categories and features, buyer saved vehicles, view history, admin delete approval flow. Listings have `expiresAt` (set from plan `durationDays` on creation). |
| `offers.ts` | `offers`, `purchases` | Offer lifecycle (pending → accepted/countered/declined → completed). Purchase records with receipt tracking. |

### Payments
| File | Tables | Description |
|---|---|---|
| `payments.ts` | `payment_intents`, `bank_accounts` | Paystack-backed payment flow. Purpose enum: `wallet_topup`, `inspection`, `listing_purchase`, `subscription`. `planId` FK added to `payment_intents` for subscription payments. Routes: `POST /payments/init`, `GET /payments/verify/:ref`, `POST /paystack/webhook`, `GET /me/subscription`, `POST /subscriptions/free`. |

### Services
| File | Tables | Description |
|---|---|---|
| `inspections.ts` | `inspection_types`, `inspections`, `inspection_reports` | Admin-managed inspection types, buyer inspection requests, inspector assignments, detailed condition reports (body, engine, interior, electrical, suspension, tyres). |
| `wallet.ts` | `wallet_accounts`, `wallet_transactions` | Per-user wallets for buyers, sellers, and inspectors. Transaction types: deposit, withdrawal, payment, receipt, commission, refund, inspection fees/earnings. |

### Communication
| File | Tables | Description |
|---|---|---|
| `messages.ts` | `conversations`, `conversation_participants`, `messages`, `support_tickets`, `support_ticket_messages` | Direct messaging between buyers/sellers. Customer support ticketing with priority levels and staff replies. |
| `reviews.ts` | `reviews` | Buyer feedback on sellers after purchase, with seller response capability. |

### Admin / CMS
| File | Tables | Description |
|---|---|---|
| `cms.ts` | `cms_banners`, `cms_news`, `push_messages` | Homepage banners/ads, news articles, push notifications targeted by role. |
| `audit.ts` | `audit_logs` | Full admin audit trail for all platform actions. |

### Legacy Tables
`cars` and `sellers` tables remain for backward compatibility with existing API routes. These will be superseded by `listings` and `users`/`seller_profiles` during the API migration.

### Seed Data
Pre-seeded: 4 sellers and 12 car listings in the legacy `cars`/`sellers` tables. Run `scripts/seed.mjs` from `lib/db/` to re-seed.

## Admin Console
Routes under `/admin/*` (guarded by `RequireAdmin` — redirects non-admins). Top-nav `AdminLayout` with 8 tabs: Home, User Mgt, Car Inventory, Subscriptions, Finances, Customer Support, CMS, Settings.

- `pages/admin-dashboard.tsx`: Stat cards (users, listings, inspections, revenue) + recent users / recent listings tables.
- `pages/admin-placeholder.tsx`: Stub for the other 7 tabs.
- `components/admin-layout.tsx`, `components/require-admin.tsx`.

Backend: `routes/admin.ts` exposes `GET /api/admin/stats/overview`, `/api/admin/recent/users`, `/api/admin/recent/listings`. Guarded by `requireAdmin` middleware in `lib/auth-middleware.ts`.

Seed admin: `admin@huceautos.com` / `Password123!` (id 4, role=admin).
