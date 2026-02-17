# Cattle Management System Enhancement Design

> Date: 2026-02-17
> Status: Approved

## Summary

Comprehensive enhancement of the cattle management system covering: UI overhaul with sidebar navigation, interactive farm map with drawable field boundaries, visual family tree with statistics, weight tracking, task/reminder system, movement history, and fixes to existing broken features.

---

## Phase 1: UI Overhaul & Bug Fixes

### Design System
- Sidebar navigation (collapsible on mobile) replacing top nav bar
- Fix shadow classes (`shadow-soft`, `shadow-medium`) in Tailwind config
- Consistent card design: subtle border + soft shadow, uniform padding
- Unified color system for status badges (green=active, amber=pending, red=sold/died, blue=info)
- Skeleton loading states on every page
- Meaningful empty states

### Bug Fixes
- Fix dashboard API: return actual recent calvings array (not just count), return herd composition data
- Fix lineage page links (point to `/cattle/detail?id=` not `/cattle/[id]`)
- Build health page (currently placeholder)
- Build breeding calendar (currently "coming soon")
- Fix shadow CSS classes in Tailwind config
- Add `/cattle/new` form page (currently 404)

### Pages to Update
- Layout: sidebar nav with icons, collapsible
- Dashboard: cleaner KPI cards, working recent calvings, tasks widget
- Cattle list: better table with proper filters (breed, sex, status dropdowns)
- Cattle detail: tabbed layout (Info, Family, Health, Financial)
- Analytics: refined charts, better spacing
- Breeding: fix calendar, better service record form with cattle dropdown
- Financials: cleaner table, better chart integration
- Lineage: enhanced foundation mother cards
- Health: fully functional health records page
- Upload: better upload experience with drag-drop

---

## Phase 2: Family Tree & Statistics

### Visual Pedigree Tree
- Interactive tree diagram centered on selected animal
- Ancestors going up (maternal line via damTag chain)
- Descendants going down (offspring)
- Each node: management tag, breed, size badge, status, sale price if sold
- Click any node to re-centre tree on that animal
- CSS-based tree layout with connecting lines

### Family Statistics Panel
- Average sale price of siblings vs herd average
- Size distribution of offspring (Large/Medium/Small counts)
- Best/worst performing offspring by sale price and weight
- Calving interval comparison
- Sibling sale prices table: each sibling's price, weight, age at sale, price/kg

### API Enhancements
- `GET /api/family/stats/:id` - enhanced to include sibling sale prices, size distribution
- `GET /api/family/tree/:id` - already exists, ensure it returns sale data

### Frontend
- Enhanced `/lineage` page: foundation mothers + animal selector + tree view + stats
- Cattle detail page "Family" tab: pedigree tree + stats sidebar

---

## Phase 3: Farm Map & Field Management

### Database Schema
```sql
CREATE TABLE fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  fieldType TEXT DEFAULT 'grazing',  -- grazing/silage/hay/housing
  polygon TEXT,  -- GeoJSON stored as text
  area REAL,  -- hectares, auto-calculated
  capacity INTEGER,
  color TEXT DEFAULT '#22c55e',
  notes TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE field_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cattleId INTEGER NOT NULL REFERENCES cattle(id),
  fieldId INTEGER NOT NULL REFERENCES fields(id),
  assignedDate TEXT NOT NULL,
  removedDate TEXT,  -- null = currently in field
  notes TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Map Page (`/fields`)
- Leaflet map with OpenStreetMap tiles
- Polygon drawing tool for field boundaries
- Field label overlays: name + cattle count, color-coded by type
- Click field to see cattle list, assign/remove animals
- Sidebar: field list, field details form

### API Endpoints
- `GET/POST /api/fields` - CRUD for fields
- `GET/PUT/DELETE /api/fields/:id`
- `GET /api/fields/:id/cattle` - cattle currently in field
- `POST /api/fields/:id/assign` - assign cattle to field (creates assignment)
- `POST /api/fields/:id/remove` - remove cattle from field (sets removedDate)
- `GET /api/cattle/:id/movements` - movement history for an animal

### Movement History
- Auto-generated from field_assignments
- Cattle detail page timeline showing field movements
- Field detail view showing what's been in it over time

---

## Phase 4: Weight Tracking & Tasks/Reminders

### Weight Tracking Schema
```sql
CREATE TABLE weight_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cattleId INTEGER NOT NULL REFERENCES cattle(id),
  recordDate TEXT NOT NULL,
  weightKg REAL NOT NULL,
  notes TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Weight Features
- `GET/POST /api/weights/:cattleId` - weight records for an animal
- Cattle detail page: weight growth chart (Recharts line chart)
- Weight recording form on cattle detail page
- Daily weight gain calculation

### Tasks Schema
```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  dueDate TEXT NOT NULL,
  category TEXT DEFAULT 'general',  -- vaccination/tb-test/service/movement/general
  cattleId INTEGER REFERENCES cattle(id),
  fieldId INTEGER REFERENCES fields(id),
  status TEXT DEFAULT 'pending',  -- pending/completed/overdue
  completedDate TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Task Features
- New page `/tasks`: upcoming tasks, overdue alerts, quick-add, filter by category
- Dashboard "Tasks Due This Week" widget
- Auto-generated reminders from service records (expected calving date)
- `GET/POST /api/tasks` - CRUD
- `GET /api/tasks/upcoming` - next 7 days
- `GET /api/tasks/overdue` - past due

---

## Technical Notes

- Static export (`output: 'export'`) is maintained - all pages use query params for IDs
- Leaflet loaded dynamically (client-side only) to work with static export
- No new npm dependencies except `leaflet` and `@types/leaflet` for the map
- All new tables follow existing Drizzle ORM patterns
- D1 migrations via `wrangler d1 migrations`
