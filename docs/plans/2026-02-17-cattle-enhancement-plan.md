# Cattle Management Enhancement - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the cattle management system with a polished sidebar UI, interactive farm map with drawable fields, visual family tree with statistics, weight tracking, task/reminder system, and movement history.

**Architecture:** Enhancement of existing Next.js 15 static export + Cloudflare Workers + D1 stack. No new frameworks - extend with Leaflet for maps. All pages remain client-side rendered with `useEffect`/`useState` pattern. New DB tables added via Drizzle migrations.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 3, Recharts, Leaflet, Hono, Drizzle ORM, Cloudflare D1, lucide-react (already installed)

---

## Phase 1: UI Overhaul & Bug Fixes

### Task 1.1: Sidebar Navigation Layout

**Files:**
- Modify: `apps/web/app/(auth)/layout.tsx`
- Modify: `apps/web/app/globals.css`

**What to build:**
Replace the top nav bar with a collapsible sidebar. Desktop: 256px fixed sidebar with icons + labels, collapsible to 64px icon-only. Mobile: overlay sidebar triggered by hamburger.

Use `lucide-react` icons (already installed in package.json). Nav items:
- Dashboard (LayoutDashboard)
- Cattle (Beef → use `CircleDot` or custom)
- Fields (Map)
- Breeding (Heart)
- Lineage (GitBranch)
- Health (Activity)
- Financials (PoundSterling)
- Analytics (BarChart3)
- Tasks (CheckSquare)
- Upload (Upload)

Sidebar state: collapsed/expanded stored in localStorage. Main content area shifts with `ml-64` / `ml-16`. Bottom of sidebar: collapse toggle button.

**Step 1:** Rewrite `layout.tsx` with sidebar navigation. Key structure:
```tsx
<div className="flex min-h-screen bg-gray-50">
  {/* Sidebar */}
  <aside className={`fixed inset-y-0 left-0 z-50 bg-white border-r transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
    {/* Logo */}
    {/* Nav links with icons */}
    {/* Collapse toggle at bottom */}
  </aside>
  {/* Mobile overlay */}
  {/* Main content */}
  <main className={`flex-1 transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-64'}`}>
    {children}
  </main>
</div>
```

**Step 2:** Add CSS utilities to `globals.css`:
- Scrollbar hiding for sidebar on mobile
- Transition classes

**Step 3:** Build and verify all pages still render correctly.

**Step 4:** Commit: `feat: replace top nav with collapsible sidebar navigation`

---

### Task 1.2: Fix Dashboard API & Page

**Files:**
- Modify: `apps/worker/src/routes/analytics.ts` (dashboard endpoint, lines 38-123)
- Modify: `apps/web/app/(auth)/dashboard/page.tsx`

**What to fix:**
The dashboard API returns `recentCalvings` as a count (number), but the page expects it as an array of calving objects. The page also expects `herdComposition` and `upcomingPredictions` which the API doesn't return.

**Step 1:** Update the `/api/analytics/dashboard` route to return:
- `recentCalvings`: actual array of recent calvings with mother tag, calving date, calf tag, difficulty (query calvingEvents with mother relation, last 10, ordered by date desc)
- `upcomingPredictions`: array from serviceEvents where successful IS NULL, ordered by expectedCalvingDate, with cow tag (same as breeding predictions endpoint logic)
- `herdComposition`: array of `{ name, value }` by breed (same as herd-statistics byBreed)

**Step 2:** Update dashboard page to use the new data shape. Remove the `DashboardStats` interface duplication and match the API.

**Step 3:** Verify dashboard loads with real data.

**Step 4:** Commit: `fix: dashboard API returns full calving/prediction/composition data`

---

### Task 1.3: Build Health Page

**Files:**
- Modify: `apps/web/app/(auth)/health/page.tsx`
- Modify: `apps/web/lib/api-client.ts` (add missing health methods)

**What to build:**
Replace the placeholder with a functional health records page:
- Summary cards: total records, records this month, most common event type
- Filter bar: animal tag search, event type dropdown, date range
- Health records table: Animal Tag, Date, Event Type, Description, with link to cattle detail
- Add Health Record form (togglable): animal ID selector, date, event type (dropdown: Vaccination, TB Test, Feet Trimming, Dosing, Vet Visit, Other), description, notes

**Step 1:** Add `getHealthRecordsList` and `getHealthSummary` to api-client.ts:
```ts
async getHealthRecordsList(params?: { animalId?: number; eventType?: string }) {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  return this.request(`/api/health${query ? `?${query}` : ''}`);
}

async getHealthSummary() {
  return this.request('/api/health/summary');
}
```

**Step 2:** Rewrite health page with StatCards, filter bar, table, and add form.

**Step 3:** Test with existing health records data.

**Step 4:** Commit: `feat: build functional health records page`

---

### Task 1.4: Fix Lineage Page Links

**Files:**
- Modify: `apps/web/app/(auth)/lineage/page.tsx` (line 50)
- Modify: `apps/web/app/(auth)/cattle/detail/page.tsx` (lines 225-229, 244-246, 275-278)

**What to fix:**
- Lineage page links to `/cattle/${id}` which 404s. Change to `/cattle/detail?id=${id}`
- Cattle detail page also links to `/cattle/${id}` for dam and offspring. Change all to `/cattle/detail?id=${id}`

**Step 1:** In lineage page, change `href={`/cattle/${mother.cattle.id}`}` to `href={`/cattle/detail?id=${mother.cattle.id}`}`

**Step 2:** In cattle detail page, change all `href={`/cattle/${...}`}` to query param format.

**Step 3:** Verify links work.

**Step 4:** Commit: `fix: use query param links for cattle detail (static export compat)`

---

### Task 1.5: Build Breeding Calendar

**Files:**
- Modify: `apps/web/app/(auth)/breeding/page.tsx` (calendar tab, lines 408-418)

**What to build:**
Replace the "coming soon" placeholder with a real month-view calendar showing:
- Services (blue dots/markers) on their dates
- Expected calvings (green dots) on their predicted dates
- Month navigation (prev/next month buttons)
- Click a day to see events on that day

Use a simple CSS grid calendar (no library needed). 7 columns for days of week, rows for weeks. Each cell shows day number and event indicators.

**Step 1:** Build a `CalendarView` component inline in the breeding page. Use `date-fns` (already installed) for date manipulation:
- `startOfMonth`, `endOfMonth`, `eachDayOfInterval`, `startOfWeek`, `endOfWeek`
- Map services and predictions onto calendar days

**Step 2:** Replace the placeholder in the calendar tab.

**Step 3:** Test with existing service/prediction data.

**Step 4:** Commit: `feat: build breeding calendar with services and predictions`

---

### Task 1.6: Polish All Pages UI

**Files:**
- Modify: All page files in `apps/web/app/(auth)/*/page.tsx`
- Modify: `apps/web/components/charts/stat-card.tsx`

**What to do:**
Apply consistent styling improvements across all pages:
1. Remove gradient text headings (replace with solid `text-gray-900` h1s - cleaner)
2. Add subtle `border border-gray-200` to cards (currently `border-0`)
3. Consistent card header pattern: `<div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-gray-900">Title</h2></div>`
4. Status badge consistency: green=Active, amber=Pending, red=Sold/Died, blue=Info
5. Better loading states with skeleton pattern in StatCard (already exists, just ensure used everywhere)
6. Better empty states with icon + message + action button
7. Table styling: remove uppercase headers, use `text-xs font-medium text-gray-500` consistently

**Step 1:** Update StatCard to add `border border-gray-200` and refine styling.

**Step 2:** Update each page to use solid headings and consistent patterns.

**Step 3:** Build and visually verify.

**Step 4:** Commit: `style: polish UI consistency across all pages`

---

## Phase 2: Family Tree & Statistics

### Task 2.1: Enhanced Family Stats API

**Files:**
- Modify: `apps/worker/src/routes/family.ts`
- Modify: `apps/worker/src/services/family.ts`

**What to build:**
Add a new endpoint `GET /api/family/enhanced-stats/:id` that returns:
- Sibling sale prices: for each sibling, return `{ id, managementTag, tagNo, sex, yob, size, salePrice, weightKg, ageMonths, pricePerKg }`
- Offspring size distribution: count of each size (1-4) among offspring
- Average sale price of siblings vs herd average
- Best/worst offspring by sale price
- Calving intervals for this cow's calvings

**Step 1:** Add method `getEnhancedFamilyStats` to FamilyService:
```ts
async getEnhancedFamilyStats(cattleId: number) {
  // Get cattle
  // Get siblings with their sale data (join sale_events)
  // Get offspring with their sale data
  // Calculate stats
  // Get herd average sale price for comparison
}
```

**Step 2:** Add route in family.ts.

**Step 3:** Add api-client method.

**Step 4:** Commit: `feat: add enhanced family stats API with sibling sale prices`

---

### Task 2.2: Visual Family Tree Component

**Files:**
- Create: `apps/web/components/family-tree.tsx`

**What to build:**
A CSS-based family tree visualization that shows:
- **Vertical layout**: ancestors at top, current animal in middle, descendants below
- **Nodes**: rounded cards showing management tag, breed badge, size badge, status indicator
- **Connecting lines**: CSS `::before`/`::after` pseudo-elements for vertical + horizontal lines
- **Clickable nodes**: clicking any animal re-centres the tree on them (updates URL query param)
- **Sold indicator**: if sold, show sale price on the node in green

Structure:
```
         [Great-Grandmother]
              |
         [Grandmother]
              |
           [Dam]
              |
    ========[THIS ANIMAL]========
    |         |         |
  [Calf 1]  [Calf 2]  [Calf 3]
```

**Step 1:** Build the `FamilyTree` component. Accept `ancestors` (from `/api/family/tree/:id`) and `descendants` arrays. Render as a flex column layout with CSS connecting lines.

Each node:
```tsx
<div className="px-4 py-2 bg-white rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer hover:border-green-500">
  <p className="font-semibold text-sm">{tag}</p>
  <p className="text-xs text-gray-500">{breed} • {yob}</p>
  {salePrice && <p className="text-xs text-green-600 font-medium">£{salePrice}</p>}
</div>
```

**Step 2:** Style connecting lines with CSS.

**Step 3:** Test with API data.

**Step 4:** Commit: `feat: build visual family tree component`

---

### Task 2.3: Family Statistics Panel

**Files:**
- Create: `apps/web/components/family-stats.tsx`

**What to build:**
A panel that displays family performance statistics:
- **Sibling Sale Prices table**: tag, sex, weight, sale price, price/kg, age at sale
- **Sibling avg vs herd avg**: comparison bar or simple text
- **Offspring size distribution**: small horizontal bar chart or badges with counts
- **Best offspring**: card highlighting highest sale price offspring
- **Calving history**: list of calving intervals if female

**Step 1:** Build `FamilyStats` component accepting enhanced stats data.

**Step 2:** Test with real data.

**Step 3:** Commit: `feat: build family statistics panel component`

---

### Task 2.4: Enhanced Lineage Page

**Files:**
- Modify: `apps/web/app/(auth)/lineage/page.tsx`

**What to build:**
Replace the simple foundation mothers grid with:
1. **Animal selector**: dropdown/search to select any animal and view their tree
2. **Foundation mothers** grid (existing, but with fixed links and expanded cards)
3. **Family tree view**: when an animal is selected, show the FamilyTree component + FamilyStats panel side by side
4. **Quick stats**: on each foundation mother card, show mini bar of offspring sizes

**Step 1:** Add animal search/select at top of page.

**Step 2:** Integrate FamilyTree and FamilyStats components.

**Step 3:** Update foundation mother cards with correct links and expanded info.

**Step 4:** Commit: `feat: enhance lineage page with interactive tree and stats`

---

### Task 2.5: Family Tab on Cattle Detail Page

**Files:**
- Modify: `apps/web/app/(auth)/cattle/detail/page.tsx`

**What to build:**
Replace the static family tree section with a tabbed layout on the cattle detail page:
- **Info tab**: existing basic info + sale info + notes
- **Family tab**: FamilyTree component + FamilyStats panel
- **Health tab**: health records timeline (move from bottom)
- **History tab**: reproductive history (services + calvings) if female

This replaces the current static 3-column family grid.

**Step 1:** Restructure cattle detail page with tabs.

**Step 2:** Integrate FamilyTree and FamilyStats in the Family tab.

**Step 3:** Test navigation between tabs.

**Step 4:** Commit: `feat: add tabbed layout to cattle detail with family tree`

---

## Phase 3: Farm Map & Field Management

### Task 3.1: Database Schema - Fields & Assignments

**Files:**
- Modify: `apps/worker/src/db/schema.ts`
- Create migration via `pnpm run db:generate`

**What to build:**
Add two new tables:

```ts
export const fields = sqliteTable('fields', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  fieldType: text('field_type').default('grazing'), // grazing/silage/hay/housing
  polygon: text('polygon'), // GeoJSON string
  centerLat: real('center_lat'),
  centerLng: real('center_lng'),
  area: real('area'), // hectares
  capacity: integer('capacity'),
  color: text('color').default('#22c55e'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const fieldAssignments = sqliteTable('field_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cattleId: integer('cattle_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),
  fieldId: integer('field_id').notNull().references(() => fields.id, { onDelete: 'cascade' }),
  assignedDate: text('assigned_date').notNull(),
  removedDate: text('removed_date'), // null = currently in field
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  cattleIdx: index('idx_assignment_cattle').on(table.cattleId),
  fieldIdx: index('idx_assignment_field').on(table.fieldId),
}));
```

Add relations:
```ts
export const fieldsRelations = relations(fields, ({ many }) => ({
  assignments: many(fieldAssignments),
}));

export const fieldAssignmentsRelations = relations(fieldAssignments, ({ one }) => ({
  cattle: one(cattle, { fields: [fieldAssignments.cattleId], references: [cattle.id] }),
  field: one(fields, { fields: [fieldAssignments.fieldId], references: [fields.id] }),
}));
```

**Step 1:** Add schema definitions.
**Step 2:** Run `pnpm run db:generate`.
**Step 3:** Apply migration: `wrangler d1 migrations apply cattle-management-db --remote`.
**Step 4:** Commit: `feat: add fields and field_assignments tables`

---

### Task 3.2: Fields API Routes

**Files:**
- Create: `apps/worker/src/routes/fields.ts`
- Modify: `apps/worker/src/index.ts` (register route)
- Modify: `apps/web/lib/api-client.ts`

**What to build:**
CRUD endpoints for fields and cattle assignment:

```ts
GET    /api/fields              // List all fields with current cattle count
GET    /api/fields/:id          // Single field with cattle list
POST   /api/fields              // Create field (name, type, polygon, etc.)
PUT    /api/fields/:id          // Update field
DELETE /api/fields/:id          // Delete field

POST   /api/fields/:id/assign   // Assign cattle to field { cattleIds, assignedDate }
POST   /api/fields/:id/remove   // Remove cattle from field { cattleIds }

GET    /api/fields/:id/history  // Field assignment history
GET    /api/cattle/:id/movements // Movement history for a specific animal
```

The `GET /api/fields` response should include:
```ts
{
  data: [{
    id, name, fieldType, polygon, area, capacity, color,
    currentCattle: [{ id, managementTag, tagNo, breed }],
    cattleCount: number
  }]
}
```

**Step 1:** Create `fields.ts` route file.
**Step 2:** Register in `index.ts`: `app.route('/api/fields', fieldsRoutes)`.
**Step 3:** Add cattle movements endpoint to cattle routes.
**Step 4:** Add API client methods.
**Step 5:** Commit: `feat: add fields and movement API endpoints`

---

### Task 3.3: Map Page with Leaflet

**Files:**
- Create: `apps/web/app/(auth)/fields/page.tsx`
- Modify: `apps/web/app/(auth)/layout.tsx` (add nav link)

**What to build:**
New `/fields` page with:
1. **Leaflet map** (full width, ~60vh height) with OpenStreetMap tiles
2. **Drawing tools**: polygon draw mode to create field boundaries
3. **Field overlays**: each saved field rendered as a polygon with label (name + cattle count)
4. **Color coding**: by field type (green=grazing, amber=silage, blue=housing, gray=hay)
5. **Sidebar panel** (right side, 320px): field list, click to highlight on map
6. **Field detail panel**: when field clicked, show cattle list, assign/remove controls

**Important:** Leaflet must be dynamically imported (no SSR) since this is a static export:
```tsx
import dynamic from 'next/dynamic'
const MapComponent = dynamic(() => import('@/components/map/farm-map'), { ssr: false })
```

**Step 1:** Install leaflet: `pnpm add leaflet @types/leaflet` in apps/web.

**Step 2:** Create `apps/web/components/map/farm-map.tsx` - the actual map component using `useEffect` to initialise Leaflet (not react-leaflet, direct Leaflet for simplicity with static export).

**Step 3:** Create the fields page with map + sidebar.

**Step 4:** Build and test field creation via drawing.

**Step 5:** Commit: `feat: add interactive farm map with field management`

---

### Task 3.4: Movement History

**Files:**
- Modify: `apps/web/app/(auth)/cattle/detail/page.tsx` (add Movements section)

**What to build:**
On the cattle detail page, add a "Movements" section (or tab) showing:
- Timeline of field assignments: `[Date] Moved to [Field Name]` → `[Date] Removed`
- Current field (if assigned)

**Step 1:** Fetch movement data from `/api/cattle/:id/movements`.

**Step 2:** Render as a timeline with field names and dates.

**Step 3:** Commit: `feat: add movement history to cattle detail page`

---

## Phase 4: Weight Tracking & Tasks/Reminders

### Task 4.1: Database Schema - Weights & Tasks

**Files:**
- Modify: `apps/worker/src/db/schema.ts`

**What to build:**
```ts
export const weightRecords = sqliteTable('weight_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cattleId: integer('cattle_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),
  recordDate: text('record_date').notNull(),
  weightKg: real('weight_kg').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  cattleIdx: index('idx_weight_cattle').on(table.cattleId),
  dateIdx: index('idx_weight_date').on(table.recordDate),
}));

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: text('due_date').notNull(),
  category: text('category').default('general'), // vaccination/tb-test/service/movement/general
  cattleId: integer('cattle_id').references(() => cattle.id),
  fieldId: integer('field_id').references(() => fields.id),
  status: text('status').default('pending'), // pending/completed/overdue
  completedDate: text('completed_date'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  dueDateIdx: index('idx_task_due').on(table.dueDate),
  statusIdx: index('idx_task_status').on(table.status),
  cattleIdx: index('idx_task_cattle').on(table.cattleId),
}));
```

**Step 1:** Add schema. Generate and apply migration.
**Step 2:** Commit: `feat: add weight_records and tasks tables`

---

### Task 4.2: Weight Tracking API & UI

**Files:**
- Create: `apps/worker/src/routes/weights.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/web/lib/api-client.ts`
- Modify: `apps/web/app/(auth)/cattle/detail/page.tsx`

**What to build:**
API:
```
GET  /api/weights/:cattleId  // All weight records for an animal, ordered by date
POST /api/weights/:cattleId  // Add weight record { recordDate, weightKg, notes }
DELETE /api/weights/:id      // Delete weight record
```

UI on cattle detail page:
- Weight chart (Recharts LineChart) showing weight over time
- "Add Weight" button/form (date + weight input)
- Daily weight gain calculation: `(latest weight - earliest weight) / days between`

**Step 1:** Create weights route.
**Step 2:** Add api-client methods.
**Step 3:** Add weight chart + form to cattle detail page.
**Step 4:** Commit: `feat: add weight tracking with growth chart`

---

### Task 4.3: Tasks & Reminders API

**Files:**
- Create: `apps/worker/src/routes/tasks.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/web/lib/api-client.ts`

**What to build:**
```
GET    /api/tasks              // List tasks, filters: status, category, upcoming (7 days)
GET    /api/tasks/upcoming     // Tasks due in next 7 days
GET    /api/tasks/overdue      // Past-due uncompleted tasks
POST   /api/tasks              // Create task
PUT    /api/tasks/:id          // Update task (mark complete, edit)
DELETE /api/tasks/:id          // Delete task
```

Auto-task creation: when a service record is created (breeding POST), auto-create a task with:
- Title: "Expected calving - [cow tag]"
- Due date: expectedCalvingDate
- Category: "calving"
- CattleId: the cow's ID

**Step 1:** Create tasks route.
**Step 2:** Modify breeding service creation to auto-create task.
**Step 3:** Add api-client methods.
**Step 4:** Commit: `feat: add tasks and reminders API with auto-calving tasks`

---

### Task 4.4: Tasks Page

**Files:**
- Create: `apps/web/app/(auth)/tasks/page.tsx`
- Modify: `apps/web/app/(auth)/layout.tsx` (add nav link)

**What to build:**
New `/tasks` page:
- **Overdue alert banner** (red) at top if any overdue tasks
- **Quick add form**: title, due date, category dropdown, optional cattle/field link
- **Task filters**: status tabs (All / Pending / Completed / Overdue), category filter
- **Task list**: cards showing title, due date, category badge, linked animal tag, complete checkbox
- Clicking complete → PATCH updates status + sets completedDate

**Step 1:** Build tasks page.
**Step 2:** Add nav link.
**Step 3:** Test.
**Step 4:** Commit: `feat: add tasks and reminders page`

---

### Task 4.5: Dashboard Tasks Widget

**Files:**
- Modify: `apps/web/app/(auth)/dashboard/page.tsx`

**What to build:**
Add a "Tasks Due This Week" card to the dashboard:
- Shows up to 5 upcoming tasks
- Red badge for overdue count
- Links to /tasks page

**Step 1:** Fetch upcoming tasks in dashboard load.
**Step 2:** Render widget card.
**Step 3:** Commit: `feat: add tasks widget to dashboard`

---

## Execution Order

Execute tasks in order: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 3.1 → 3.2 → 3.3 → 3.4 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5

Commit after each task. Build and verify after each phase.

**Build check after each phase:**
```bash
cd apps/web && pnpm run build
```

**Deploy after all phases:**
```bash
cd apps/worker && pnpm run deploy
cd apps/web && pnpm run build && pnpm run deploy
```
