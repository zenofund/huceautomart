# Hostinger Node.js Web App: API Only

Deploy the source repository directly through Hostinger's GitHub integration.
No GitHub Action or compiled-artifact branch is required. The React website and
mobile app remain separate deployments.

## hPanel Settings

| Setting | Value |
| --- | --- |
| Branch | `main` after the deployment changes have been committed and pushed |
| Root directory | Repository root (`.`), not `artifacts/api-server` |
| Framework | Express; use Other if automatic detection selects a frontend |
| Node.js | `22.x` |
| Package manager | pnpm `10.17.1` (also pinned in root `package.json`) |
| Install command, if editable | `pnpm install --frozen-lockfile --prod=false` |
| Build command | `pnpm run build` |
| Output directory | `dist` |
| Entry file inside output | `dist/index.mjs` |
| Entry file if the field is relative to repository root | `dist/dist/index.mjs` |
| Start command from repository root, if exposed | `npm start` |
| Start command from the deployed output directory | `npm start` |

Hostinger's entry-file path is relative to the application's runtime directory:
the generated output has its own `package.json` with `main: dist/index.mjs` and
`start: node --enable-source-maps ./dist/index.mjs`.
The root package's `start` points to that same entry beneath the output folder.

Do not use `npm install` in this pnpm workspace, install production-only dependencies
before compiling, set the root to the API subdirectory, or deploy just the
`artifacts/api-server/dist` folder. The compiler requires dev dependencies, the API
imports sibling workspace libraries, and its bundle still needs external packages.

The deployment build compiles only the API, then uses `pnpm deploy --prod` to
assemble a portable `dist` containing the API bundle, package metadata, internal
libraries, and production dependencies. pnpm workspace injection enables its
lockfile-based deploy implementation. Keep the entire output, including
`node_modules/.pnpm` and symlinks. Build on Hostinger's Linux runner; do not upload
Windows `node_modules`.

The original monorepo build remains available as `pnpm run build:workspace`.
Existing API-only compilation remains available as `pnpm run build:api`.

## Environment

Set these in hPanel, never in Git:

- `NODE_ENV=production`
- `NPM_CONFIG_PRODUCTION=false` during dependency installation if hPanel does not
  expose an install command. This ensures the compiler's dev dependencies are
  installed; the generated deployment still contains production dependencies only.
- `DATABASE_URL`: reachable PostgreSQL connection string, including your database
  provider's SSL settings. Hostinger's bundled MySQL is not a PostgreSQL replacement.
- `JWT_SECRET`: a long, randomly generated secret. Keep the existing production
  value when migrating to avoid invalidating user sessions.
- `ALLOWED_ORIGIN`: exact frontend origin, for example `https://huceautomart.com`.
- `FRONTEND_URL`: frontend URL used in email and authentication redirects.

The server binds to `0.0.0.0`, honors the platform-provided `PORT`, and falls back
to `3000` only when it is absent. Do not override a port assigned by Hostinger.

Also transfer the environment for features you use: payment provider, Google
sign-in, email provider, Cloudinary or Google Cloud Storage, and push notifications.
See `deployment.md` and the existing provider modules for their variable names.
Use external object storage for durable media; do not rely on deployment-local
uploads surviving a redeploy. No schema migrations run automatically during build.

## Verification

From the repository root:

```sh
pnpm install --frozen-lockfile --prod=false
pnpm run build
pnpm run test:deployment
```

The deployment test copies the output outside the workspace, starts it with
test-only credentials, and checks health, CORS, unauthenticated access, default
and supplied ports, invalid ports, and missing database configuration. It does not
connect to a production database.

After Hostinger deploys, request `https://YOUR_API_DOMAIN/api/healthz`.
Expect HTTP 200 and `{"status":"ok"}`. The API's `/` route is not a website, so a
404 there does not mean the API failed. This health endpoint tests the process,
not database or third-party connectivity; also verify sign-in, listings, and
uploads against your configured services.

If deployment fails, collect the first actual error from hPanel's deployment
build log and its runtime log. Distinguish dependency installation, compilation,
and process startup; a successful local build cannot prove hPanel settings or
production credentials are correct.

## Official References

- https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- https://www.hostinger.com/tutorials/deploy-node-js-application
- https://www.hostinger.com/support/how-to-troubleshoot-a-failed-node-js-deployment-using-build-logs/
