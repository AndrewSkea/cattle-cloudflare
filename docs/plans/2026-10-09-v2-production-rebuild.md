# v2 Production Rebuild — Plan

Date: 2026-10-09

## Why

Audit of v1 found:

- **Login unreliable**: frontend (`pages.dev`) and API (`workers.dev`) are different sites, so the
  auth cookie is a third-party cookie (blocked by Safari, restricted by Chrome). OAuth `state` was
  never verified. Turnstile added a second failure point in front of Google sign-in.
- **Security**: CORS reflected any origin *with credentials* (any website could read a logged-in
  user's farm data). Role checks only on some routes. Internal error messages returned to clients.
- **Data model**: cattle-only; `tag_no` globally unique (two farms can't share a tag); imported data
  has 6 spellings of sex, `Sim`/`Simm` breeds, calvings never linked to calves.
- **Frontend**: inconsistent pages, failing type-check, no tasks, inventory, structures, weights,
  equipment service scheduling, or vaccination tracking.
- **Ops**: production D1 database had been deleted; `out/` build committed to git.

## Architecture

- **One Worker serves everything** (Workers Static Assets for the Next.js export + Hono API under
  `/api`). Same origin → first-party `SameSite=Lax` HttpOnly cookie, no CORS needed.
  URL: `https://cattle-management-api.andrewskea-as.workers.dev` (keeps the Google OAuth redirect
  URI that is already registered). `cattle-management.pages.dev` redirects there.
- Google OAuth with signed `state` cookie and verified-email check. Turnstile removed.
- Every API mutation: Origin check (CSRF), zod validation, farm scoping, role check.
- Roles: **owner** (everything, members, delete farm) · **manager** (all data incl. finance, invite
  workers/viewers) · **worker** (livestock, health, land, equipment, tasks, inventory — no finance,
  no team admin) · **viewer** (read-only, no finance).

## Data model (fresh schema, imported data transformed)

| Area | Tables |
| --- | --- |
| Identity | users, farms (location, boundary, holding no., currency), farm_members, farm_invites |
| Livestock | animals (species, sex, castrated, breed, dam/sire link or external sire, status, location, purchase + exit details) |
| Animal records | health_records (treatment/vaccination/test/procedure/vet visit/observation, product, dose, batch, withdrawal, next due, cost), weight_records, breeding_records (service/scan), birth_records, movements |
| Land | land_parcels (polygon, area, use, tenure, rent), structures (barns, sheds, yards, troughs, gates — pinned on map) |
| Equipment | equipment (status, hours, service interval by hours/days, MOT/insurance), equipment_logs (service/repair/fuel/inspection/hours) |
| Money | transactions (income/expense, category, links to animal/equipment/parcel/staff) |
| People | staff (job title, pay, optional link to login), tasks (assignee, due, priority, links) |
| Stock | inventory_items (feed, medicine, vaccine, fertiliser, fuel, seed; reorder level, expiry) |
| Audit | activity_log |

Import of 2026-01-10 data: normalise sex (female/male, heifer→female), breeds (Char→Charolais,
Lim→Limousin, Sim/Simm→Simmental, AA→Aberdeen Angus), link births to calves by dam + DOB,
feet-trimming → health observations, Johne's note preserved.

## Product surface

- **Landing / Login / Onboarding** (create farm: name, location on map, species) or join by invite.
- **Dashboard**: KPIs, weather (Open-Meteo), alerts (vaccines due, services due, calvings due,
  withdrawal periods, low stock, overdue tasks), herd composition, money snapshot, activity.
- **Livestock**: species tabs, class categories (cow/heifer/bull/steer/calf, ewe/ram/lamb, …),
  search/filter/sort, CSV export; animal page with Overview, Family (pedigree + descendants +
  statistics), Health, Weights, Breeding, Movements, Finance; record sale/death.
- **Breeding**: services, pregnancy scans, due-date calendar, births.
- **Health**: herd-wide records, vaccinations due, active withdrawals.
- **Land & map**: satellite/OSM map, draw fields, pin barns/structures, tenure + rent.
- **Equipment**: service status (OK / due soon / overdue), logs, hours, MOT/insurance.
- **Finances**: P&L, monthly chart, by category, per-head figures, transactions CRUD, CSV export.
- **Tasks**, **Inventory**, **Team** (members, roles, invites, staff details), **Profile**, **Farm settings**.

## Verification

1. Worker type-check clean, web build clean.
2. Local Playwright suite (dev-login) exercising every page and CRUD flow, multi-role permissions.
3. Deploy, then production smoke tests (public pages, OAuth redirect accepted by Google, API auth
   enforced, assets served) and visual review via screenshots.
