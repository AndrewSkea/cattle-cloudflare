# Implementation Plan: Farm Operations (Machinery, Workers, Supplies)

> Step-by-step implementation plan derived from 2026-02-21-farm-operations-design.md

**Date:** 2026-02-21
**Stack:** Cloudflare Workers (Hono) + Drizzle ORM + D1 + Next.js 15 static export

---

## Phase 1: Backend — Schema & Routes

### Task 1: Add new tables to Drizzle schema
**File:** `apps/worker/src/db/schema.ts`

Add 5 new tables after the existing health_records table:
- `machinery` (with indexes on farmId)
- `machinery_events` (with indexes on farmId, machineryId)
- `workers` (with indexes on farmId)
- `payroll_events` (with indexes on farmId, workerId)
- `supply_purchases` (with indexes on farmId, fieldId, category)

Add relations for all new tables.

**Verification:** `cd apps/worker && pnpm run db:generate` — should create a new migration file.

---

### Task 2: Create machinery routes
**File:** `apps/worker/src/routes/machinery.ts`

Implement:
- `GET /` — list all machinery with total spend calculated
- `POST /` — create machine (require manager+ role)
- `GET /:id` — machine detail
- `PUT /:id` — update machine (require manager+)
- `DELETE /:id` — delete machine (require owner)
- `GET /:id/events` — list events for machine
- `POST /:id/events` — log event (require worker+)
- `PUT /:id/events/:eid` — update event (require manager+)
- `DELETE /:id/events/:eid` — delete event (require manager+)

All queries scoped by `user.activeFarmId`.

---

### Task 3: Create workers routes
**File:** `apps/worker/src/routes/workers.ts`

Implement:
- `GET /` — list workers (require manager+ role)
- `POST /` — create worker (require manager+)
- `PUT /:id` — update worker (require manager+)
- `DELETE /:id` — delete worker (require owner)
- `GET /:id/payroll` — list payroll events (require manager+)
- `POST /:id/payroll` — log payment (require manager+)
- `PUT /:id/payroll/:pid` — update payment (require manager+)
- `DELETE /:id/payroll/:pid` — delete payment (require manager+)

All queries scoped by `user.activeFarmId`.

---

### Task 4: Create supplies routes
**File:** `apps/worker/src/routes/supplies.ts`

Implement:
- `GET /` — list all purchases, filterable by `?category=` and `?fieldId=`
- `POST /` — log purchase (require worker+)
- `PUT /:id` — update purchase (require manager+)
- `DELETE /:id` — delete purchase (require manager+)

---

### Task 5: Add field timeline route
**File:** `apps/worker/src/routes/fields.ts`

Add to existing fields router:
- `GET /:id/timeline` — aggregate supply_purchases and machinery_events where fieldId matches, return unified sorted list with type tags

---

### Task 6: Update analytics financial route
**File:** `apps/worker/src/routes/analytics.ts`

Update `GET /api/analytics/financial` to include:
- Sum of `machinery_events.cost` grouped by type (purchase vs running)
- Sum of `payroll_events.amount`
- Sum of `supply_purchases.totalCost` grouped by category
- Respect existing `?start` and `?end` date filters
- Return breakdown object with all categories

---

### Task 7: Register new routes in index.ts
**File:** `apps/worker/src/index.ts`

Add:
```typescript
import machineryRoutes from './routes/machinery'
import workersRoutes from './routes/workers'
import suppliesRoutes from './routes/supplies'

app.route('/api/machinery', machineryRoutes)
app.route('/api/workers', workersRoutes)
app.route('/api/supplies', suppliesRoutes)
```

**Verification:** `cd apps/worker && npx wrangler deploy --dry-run` should succeed.

---

## Phase 2: Frontend — API Client & Pages

### Task 8: Update API client
**File:** `apps/web/lib/api-client.ts`

Add methods for:
- Machinery: `getMachinery`, `createMachinery`, `getMachineryById`, `updateMachinery`, `deleteMachinery`, `getMachineryEvents`, `createMachineryEvent`, `updateMachineryEvent`, `deleteMachineryEvent`
- Workers: `getWorkers`, `createWorker`, `updateWorker`, `deleteWorker`, `getPayroll`, `createPayrollEvent`, `updatePayrollEvent`, `deletePayrollEvent`
- Supplies: `getSupplies`, `createSupply`, `updateSupply`, `deleteSupply`
- Field timeline: `getFieldTimeline(fieldId)`

---

### Task 9: Create Machinery page
**File:** `apps/web/app/(auth)/machinery/page.tsx`

Layout:
- Header with "Machinery" title and "Add Machine" button
- Grid of machine cards (name, type badge, make/model, year, purchase price, total spend)
- Expandable detail section or tabs within same page (since static export)
- Event log table with "Log Event" button (fuel/repair/service form)
- Use query params `?view=detail&id=X` for detail view (static export compatible)

---

### Task 10: Create Workers page
**File:** `apps/web/app/(auth)/workers/page.tsx`

- Redirect non-manager/owner roles to `/dashboard`
- List active workers with role, start date, total payroll cost
- "Add Worker" form (name, role, start date)
- Click worker → show payroll history below
- "Log Payment" form (amount, type, period)

---

### Task 11: Create Supplies page
**File:** `apps/web/app/(auth)/supplies/page.tsx`

- Filter chips: All / Fertiliser / Seed / Medicine / Vaccine / Other
- Table: date, name, category badge, quantity + unit, total cost, field link
- "Log Purchase" button → form with category selector, name, date, qty, unit, unit cost (auto-calculates total), field selector (optional), supplier, notes

---

### Task 12: Update Fields page with Timeline tab
**File:** `apps/web/app/(auth)/fields/page.tsx`

Add a timeline section to the field detail view:
- Vertical timeline component
- Events from supply_purchases (supply icon) and machinery_events (tractor icon)
- Filter chips: All / Supplies / Machinery
- Year selector dropdown

---

### Task 13: Update Financials page
**File:** `apps/web/app/(auth)/financials/page.tsx`

- Read current financials page structure first
- Add new expense rows to existing P&L table: Machinery Purchase, Machinery Running, Payroll, Fertiliser, Seed, Medicine/Vaccine, Other Supplies
- Add expenditure breakdown bar chart (Recharts BarChart, stacked by category)
- Ensure period filter applies to new categories

---

### Task 14: Update navigation
**File:** `apps/web/app/(auth)/layout.tsx`

Add to `navLinks`:
```typescript
{ href: '/machinery', label: 'Machinery', icon: Wrench },
{ href: '/supplies', label: 'Supplies', icon: ShoppingCart },
{ href: '/workers', label: 'Workers', icon: Users },
```

Workers link conditionally shown (activeRole === 'owner' || activeRole === 'manager').

---

## Phase 3: Build & Verify

### Task 15: Build verification
```bash
cd apps/web && npx next build
cd apps/worker && npx wrangler deploy --dry-run
```

Both must succeed with no TypeScript errors.

---

## Implementation Notes

- All new route files follow the same Hono pattern as existing routes
- Use `c.get('user')` for auth, scope all queries with `farmId: user.activeFarmId`
- Role checks: use `requireRole('manager')` middleware pattern from auth middleware
- Static export: no dynamic routes — use query params for detail views
- Drizzle: run `pnpm run db:generate` after schema changes to create migration
