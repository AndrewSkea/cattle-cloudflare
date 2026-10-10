# CLAUDE.md — HoovesWho (farm management)

Full-stack farm management: livestock (multi-species) with family trees, health, breeding, land & map,
equipment servicing, inventory, tasks, finances, multi-user farms with roles, Orkney Mart sale import and
cattle traceability (ScotEID reporting deadlines, ear tag checks, holding register, ScotEID reconciliation).

**Production:** https://hooveswho.andrewskea.com (Worker custom domain; also https://cattle-management-api.andrewskea-as.workers.dev).
One Worker serves the app and `/api`. `https://cattle-management.pages.dev` redirects to the workers.dev URL.
CI (`.github/workflows/ci.yml`): every push/PR typechecks, builds and runs the e2e suite; pushes to `main` then migrate
remote D1, deploy, and run the production smoke tests.

## Architecture

```
apps/
  worker/   Cloudflare Worker — Hono API + serves apps/web/out via Workers Static Assets
    src/index.ts            routing, CSRF origin check, auth gate, error handler
    src/lib/                context (roles, HttpError, validation), auth (JWT cookie), crud helper, invites, validators
    src/routes/             auth, farm, animals, records (health/weights/breeding/births/movements),
                            resources (land/structures/equipment/staff/tasks/inventory), finance, dashboard,
                            mart (Orkney Mart matches/import/prices), compliance (+ scoteid, + dev ScotEID mock)
    src/services/           livestock (classes, family graph & stats), finance (auto transactions), exit (sale/death),
                            mart/parse (report parser, pure), mart/orkney (fetch, store, match, candidates),
                            compliance (UK tag check digit, deadlines, holding register), scoteid (SOAP client + sync)
    src/db/schema.ts        Drizzle schema; migrations in src/db/migrations
  web/      Next.js 15 static export (App Router, React 19, Tailwind 3, TanStack Query, Recharts, Leaflet + Geoman)
    app/(app)/*             authenticated pages (shell + guard in app/(app)/layout.tsx)
    app/{login,onboarding,join}, app/page.tsx (landing)
    components/ui/*         design system (button, form, display, overlay, picker)
    components/forms/*      create/edit sheets shared across pages
    lib/                    api client, session, queries, constants, format, types
e2e/        Playwright: app.spec.ts (local flows), prod.spec.ts (read-only production smoke)
scripts/    transform-v1-data.py → seed-v2.sql (the farm's imported data)
```

Key decisions:
- **Same origin** for app and API → first-party `HttpOnly; SameSite=Lax` session cookie, no CORS in production.
  Mutating `/api` requests with a foreign `Origin` are rejected (CSRF).
- **Auth:** Google OAuth (`/api/auth/google` → `/api/auth/callback/google`) with a state cookie and verified email.
  Users pre-provisioned by email (e.g. the imported farm's owner) are linked on first sign-in.
  `POST /api/auth/dev-login` exists only when `DEV_AUTH_ENABLED=true` and `ENVIRONMENT!=production`.
- **Roles** (`farm_members.role`, re-read every request): owner > manager > worker > viewer.
  Finance and staff pay: manager+. Deletes of animals/land/equipment: manager+. Writes: worker+. Viewer read-only.
- **Every query is scoped by `farm_id`.** Tags are unique per farm.
- **Money has one source of truth:** `transactions`. Sales, purchases, vet costs and equipment costs create
  linked transactions (`source`, `sourceId`) kept in sync by `services/finance.ts`; those are read-only in Finance.
- Dynamic pages use query strings (`/livestock/view?id=1`) because of static export.
- **Orkney Mart:** reports come from the mart's WordPress events API (`/wp-json/tribe/events/v1/events?categories=sales-report`).
  Parsed lots/averages are shared tables (`mart_reports`, `mart_lots`, `mart_averages`); each farm's seller names
  (`farm_integrations` provider `orkney_mart`) produce `mart_matches` to review. A cron (`17 */3 * * *`) fetches the last
  21 days. Importing a match runs the normal exit (sale) path, so withdrawal checks and finance entries apply; undo reverses it.
  Backfill or reload history with `scripts/mart-backfill.ts` (see the file header).
- **ScotEID:** SOAP API (WSDL https://api.scoteid.com/api?wsdl). Needs a vendor `SCOTEID_APP_KEY` from ScotEID
  (support@scoteid.com; test against https://api.test.scoteid.com/api first) plus each keeper's own login, stored
  AES-GCM encrypted (key derived from `JWT_SECRET`). Without the key the UI shows "waiting for approval"; deadlines,
  tag checks and the holding register work regardless. Locally a fake ScotEID is served at `/api/dev/scoteid`
  (password `demo-password`).

## Commands

```bash
pnpm install                      # Node 22+/26; better-sqlite3 is not needed any more
cp apps/worker/.dev.vars.example apps/worker/.dev.vars

# Local
pnpm --filter web build           # static export → apps/web/out (worker serves it)
pnpm --filter worker db:migrate:local
cd apps/worker && npx wrangler d1 execute cattle-management-db --local --file=../../scripts/seed-v2.sql
pnpm --filter worker dev          # http://localhost:8787 (app + API); "Local development sign-in" on /login

# Checks
pnpm --filter worker typecheck
cd apps/web && npx tsc --noEmit
npx playwright test               # resets LOCAL D1, runs e2e/app.spec.ts against wrangler dev
npx playwright test --config=playwright.prod.config.ts   # production smoke (read-only)

# Deploy (from repo root)
pnpm --filter web build
pnpm --filter worker db:migrate   # remote D1 migrations
pnpm --filter worker run deploy
```

## Database

D1 `cattle-management-db` (id `99b323c3-60a4-4fb3-b564-939946c90ce2`, WEUR). Schema changes:
edit `schema.ts` → `pnpm --filter worker db:generate` → `db:migrate:local` → test → `db:migrate`.

The original data (149 cattle, 89 births, 39 services, 6 health events, exported 2026-01-10) is in
`migration-import.sql`; `scripts/transform-v1-data.py` maps it to v2 (normalised sex/breeds, and fixes a v1 bug
where calving/service rows pointed at the cow's latest calf instead of the cow).

## Secrets (wrangler secret put)

`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; later `SCOTEID_APP_KEY` (and optionally `SCOTEID_ENDPOINT`).
Google OAuth redirect URIs (one per domain): `https://hooveswho.andrewskea.com/api/auth/callback/google`,
`https://cattle-management-api.andrewskea-as.workers.dev/api/auth/callback/google`.
GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (both in Bitwarden Secrets Manager).

## Conventions

- Validation with zod in route handlers via `body(c, schema)`; throw `HttpError` for user-facing errors.
- Log notable writes with `logActivity` (feeds the dashboard activity feed).
- Frontend writes go through `useSave(fn, { invalidate: [...] })` which toasts and refreshes queries.
- Forms live in Sheets; render sheets conditionally (`{open && <XSheet/>}`) so state resets per open.
- Never export anything but the default component from a Next.js `page.tsx`.
