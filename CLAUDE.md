# CLAUDE.md — Steading (farm management)

Full-stack farm management: livestock (multi-species) with family trees, health, breeding, land & map,
equipment servicing, inventory, tasks, finances and multi-user farms with roles.

**Production:** https://cattle-management-api.andrewskea-as.workers.dev (one Worker serves the app and `/api`).
`https://cattle-management.pages.dev` redirects there.

## Architecture

```
apps/
  worker/   Cloudflare Worker — Hono API + serves apps/web/out via Workers Static Assets
    src/index.ts            routing, CSRF origin check, auth gate, error handler
    src/lib/                context (roles, HttpError, validation), auth (JWT cookie), crud helper, invites, validators
    src/routes/             auth, farm, animals, records (health/weights/breeding/births/movements),
                            resources (land/structures/equipment/staff/tasks/inventory), finance, dashboard
    src/services/           livestock (classes, family graph & stats), finance (auto transactions)
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

`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Google OAuth redirect URI:
`https://cattle-management-api.andrewskea-as.workers.dev/api/auth/callback/google`.

## Conventions

- Validation with zod in route handlers via `body(c, schema)`; throw `HttpError` for user-facing errors.
- Log notable writes with `logActivity` (feeds the dashboard activity feed).
- Frontend writes go through `useSave(fn, { invalidate: [...] })` which toasts and refreshes queries.
- Forms live in Sheets; render sheets conditionally (`{open && <XSheet/>}`) so state resets per open.
- Never export anything but the default component from a Next.js `page.tsx`.
