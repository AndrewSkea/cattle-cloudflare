# CLAUDE.md — HoovesWho (farm management)

Full-stack farm management: livestock (multi-species) with family trees, health, breeding, land & map,
equipment servicing, inventory, tasks, finances, multi-user farms with roles, Orkney Mart sale import and
cattle traceability (ScotEID reporting deadlines, ear tag checks, holding register, ScotEID reconciliation).

**Production:** https://hooveswho.andrewskea.com (Worker custom domain only — workers.dev and preview URLs are off).
One Worker serves the app and `/api`. `https://cattle-management.pages.dev` redirects there.
**Family only:** the domain is behind Cloudflare Access using the same policy as the ayrenergy site
(`scripts/access-setup.py` sets it up, plus a "HoovesWho CI" service token for the smoke tests). Google sign-in in the
app still decides which farm and role a person gets.
CI (`.github/workflows/ci.yml`): every push/PR typechecks, builds and runs the e2e suite; pushes to `main` then run
`deploy.yml` (migrate remote D1, deploy, production smoke tests through Access).
**Feedback → Claude → live:** the app's Feedback button (`routes/feedback.ts`) opens a GitHub issue labelled `feedback`.
`.github/workflows/claude-feedback.yml` has Claude Code (on the owner's subscription) implement it and run the tests,
`scripts/feedback/check.sh` blocks risky changes (workflow files, edited or destructive migrations), CI runs, then it is
pushed to `main` and deployed with no human approval. Progress is commented on the issue and shown in the app.

## Architecture

```
apps/
  worker/   Cloudflare Worker — Hono API + serves apps/web/out via Workers Static Assets
    src/index.ts            routing, CSRF origin check, auth gate, error handler
    src/lib/                context (roles, HttpError, validation), auth (JWT cookie), crud helper, invites, validators
    src/routes/             auth, farm, animals, records (health/weights/breeding/births/movements),
                            resources (land/structures/equipment/staff/tasks/inventory), finance, dashboard,
                            mart (Orkney Mart matches/import/prices), compliance (+ scoteid, + dev ScotEID mock),
                            fields (crops, field timeline, readings, season overview)
    src/services/           livestock (classes, family graph & stats), finance (auto transactions), exit (sale/death),
                            mart/parse (report parser, pure), mart/orkney (fetch, store, match, candidates),
                            mart/insights (herd value at mart prices, best months to sell), push (Web Push, VAPID,
                            aes128gcm), reminders (the 8am notification),
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
- **Installable app (PWA):** `public/manifest.webmanifest`, icons in `public/icons/` (rendered from `app/icon.svg`),
  `public/sw.js` (cache-first for `/_next/static` and icons, network-first for pages with `/offline` fallback; never
  caches `/api`). `lib/install.ts` registers it and keeps Chrome's install prompt for the sidebar "Install app" button;
  Safari users get Add to Home Screen / Add to Dock instructions. Bump `VERSION` in `sw.js` to drop old caches.
- Dynamic pages use query strings (`/livestock/view?id=1`) because of static export.
- **Phones:** below `lg` the shell shows a bottom bar (Home, Animals, Quick add, Breeding, Tasks); `main` has bottom
  padding for it. Summary cards are two per row (`grid-cols-2 … lg:grid-cols-4`). Quick add menu + sheets:
  `components/quick-add.tsx` (shared with the dashboard).
- **Hidden sections:** `farms.hidden_sections` (JSON) hides menu sections a farm doesn't use (Farm settings);
  `useSession().shows('inventory')`. Hideable list: `HIDEABLE_SECTIONS` in `lib/validators.ts` and `lib/constants.ts`.
- **Breeding:** the Calving tab groups pregnancies (past due, this week, next week, by month) with a "Calved" button
  that pre-fills the sire; new calves show their ScotEID tag/register deadlines. "Scan results" saves a batch
  (`POST /api/breeding/scans`): in-calf keeps the service's sire and due date, empty closes the service.
  The cull list (`lib/cull.ts`) weighs reasons: scanned empty, long intervals, no calf lately, age, losses, hard
  calvings, notes saying farrow/cull.
- **Reminders (Web Push):** devices subscribe on Profile (`/api/push`); the `0 7 * * *` cron sends one notification
  per device when something is due (`services/reminders.ts`). Payloads are encrypted so the service worker doesn't
  fetch (Access cookies expire). Keys: `VAPID_PUBLIC_KEY` var in wrangler.toml, `VAPID_PRIVATE_KEY` secret; local
  dev keys are in `.dev.vars.example`. iPhones need the app on the Home Screen first.
- **Fields (crops & records):** `/land/field?id=` per field; `routes/fields.ts`. `field_crops` (what's growing, incl.
  permanent grass; planned → growing → finished), `field_events` (sowing, fertiliser, lime, slurry, minerals, spray,
  field work, harvest, grazing, soil test, readings, note; `done` or `planned`), `field_readings` (value per kind,
  optionally at a lat/lng — tap the map or use GPS). Forms work out N/P₂O₅/K₂O/SO₃ kg/ha from a fertiliser analysis or
  typical RB209 manure values. Sprays set `no_graze_until` (warned on the field, Land list and Move sheet). Costs of done
  records become `field_event` transactions. Rest days come from animal moves (`movements`) plus manual grazing records.
  Planned work shows in the Calendar and the 8am reminder; Land shows a season chart (`components/season-chart.tsx`).
  Leaflet: `leaflet-base.ts` patches zoom-end after a map is removed (closing a sheet mid-zoom threw `_leaflet_pos`).
- **Bank import:** Finances → Add → Import bank statement parses a CSV in the browser (`lib/bank-csv.ts`, guesses
  categories); `POST /api/finance/import` skips lines matching an existing date + amount + description.
- **Orkney Mart:** reports come from the mart's WordPress events API (`/wp-json/tribe/events/v1/events?categories=sales-report`).
  Parsed lots/averages are shared tables (`mart_reports`, `mart_lots`, `mart_averages`); each farm's seller names
  (`farm_integrations` provider `orkney_mart`) produce `mart_matches` to review. A cron (`17 */3 * * *`) fetches the last
  21 days. Reports uses the shared lots to value the herd and show which months pay best (`/api/mart/insights`).
  Importing a match runs the normal exit (sale) path, so withdrawal checks and finance entries apply; undo reverses it.
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

**Farm spreadsheet updates:** the farm keeps its herd in a workbook (dated sheets "cattle <date>" plus
"cattle sold or died"). `scripts/import-cattle-xlsx.py` turns it into SQL that upserts animals by tag (ids kept),
rebuilds calvings, services, health checks, sale weights and sale transactions, and links exactly-matching mart lots
(usage in the file header; needs openpyxl). Keep the workbook in `seed_data/`, which is gitignored: the repo is public.
Management numbers: cows own a number (97), 2024 heifers "N.24", calves "<dam>/<yy>" (twins -A/-B); renumbering keeps
the old number in `management_tag_history`.

## Secrets (wrangler secret put)

`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_KEY` (reminders; pairs with `VAPID_PUBLIC_KEY`
in wrangler.toml); later `SCOTEID_APP_KEY` (and optionally `SCOTEID_ENDPOINT`).
Google OAuth redirect URI: `https://hooveswho.andrewskea.com/api/auth/callback/google`.
Worker secret `GITHUB_FEEDBACK_TOKEN`: fine-grained GitHub token, this repo only, Issues read/write (without it feedback
is only stored in D1).
GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (both in Bitwarden Secrets Manager),
`CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (set by
`scripts/access-setup.py`).

## Conventions

- Validation with zod in route handlers via `body(c, schema)`; throw `HttpError` for user-facing errors.
- Log notable writes with `logActivity` (feeds the dashboard activity feed).
- Frontend writes go through `useSave(fn, { invalidate: [...] })` which toasts and refreshes queries.
- Forms live in Sheets; render sheets conditionally (`{open && <XSheet/>}`) so state resets per open.
- Never export anything but the default component from a Next.js `page.tsx`.
