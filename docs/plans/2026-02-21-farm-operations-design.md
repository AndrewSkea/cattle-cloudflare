# Farm Operations Design: Machinery, Workers & Supplies

> Design document for machinery asset tracking, worker payroll, supplies purchasing,
> field timelines, and financials integration.

**Date:** 2026-02-21
**Status:** Approved — ready for implementation

---

## Overview

Three new operational domains added to the farm management system:

1. **Machinery** — asset register with per-machine event history (fuel, repairs, servicing, sale)
2. **Workers** — named employee register with payroll event log (admin/owner only)
3. **Supplies** — purchase event log for fertiliser, seed, medicine, and vaccine

All costs flow into an expanded **Financials** P&L view. Supply purchases optionally tag a field, powering a new **Field Timeline** showing seasonal activity.

---

## Accounting Model

**Option C (chosen):** Categorised expense/income ledger with P&L summary.

- Record costs/revenues with date, category, and amount
- No double-entry, no VAT tracking, no depreciation calculations
- Simple enough to maintain; rich enough to hand to an accountant
- Period filter (month/quarter/year) across all categories

---

## Data Model

### 5 New Tables

#### `machinery`
Asset register — one record per physical machine.

```sql
id              INTEGER PRIMARY KEY
farmId          INTEGER NOT NULL (FK → farms)
name            TEXT NOT NULL        -- "Main Tractor"
type            TEXT NOT NULL        -- tractor|trailer|sprayer|harvester|ATV|other
make            TEXT                 -- "John Deere"
model           TEXT                 -- "6155R"
year            INTEGER
purchaseDate    TEXT                 -- ISO date
purchasePrice   REAL
serialNumber    TEXT
status          TEXT DEFAULT 'active' -- active|sold|scrapped
soldDate        TEXT
salePrice       REAL
notes           TEXT
createdAt       TEXT DEFAULT CURRENT_TIMESTAMP
updatedAt       TEXT DEFAULT CURRENT_TIMESTAMP
```

#### `machinery_events`
All activity logged against a machine.

```sql
id              INTEGER PRIMARY KEY
farmId          INTEGER NOT NULL (FK → farms)
machineryId     INTEGER NOT NULL (FK → machinery)
fieldId         INTEGER (FK → fields, nullable) -- for work done on a field
type            TEXT NOT NULL  -- fuel|repair|service|purchase|sale|other
date            TEXT NOT NULL  -- ISO date
cost            REAL
description     TEXT
hoursOrMileage  REAL           -- optional odometer/hours reading
notes           TEXT
createdAt       TEXT DEFAULT CURRENT_TIMESTAMP
```

#### `workers`
Employee register — admin/owner only.

```sql
id              INTEGER PRIMARY KEY
farmId          INTEGER NOT NULL (FK → farms)
name            TEXT NOT NULL
role            TEXT           -- "Farm Hand", "Manager", etc.
startDate       TEXT           -- ISO date
endDate         TEXT           -- null = currently employed
notes           TEXT
createdAt       TEXT DEFAULT CURRENT_TIMESTAMP
updatedAt       TEXT DEFAULT CURRENT_TIMESTAMP
```

#### `payroll_events`
Individual salary/bonus payments.

```sql
id              INTEGER PRIMARY KEY
farmId          INTEGER NOT NULL (FK → farms)
workerId        INTEGER NOT NULL (FK → workers)
date            TEXT NOT NULL  -- payment date
amount          REAL NOT NULL
type            TEXT NOT NULL  -- salary|bonus|overtime|other
periodStart     TEXT           -- ISO date (pay period start)
periodEnd       TEXT           -- ISO date (pay period end)
notes           TEXT
createdAt       TEXT DEFAULT CURRENT_TIMESTAMP
```

#### `supply_purchases`
Purchase event log — no inventory tracking.

```sql
id              INTEGER PRIMARY KEY
farmId          INTEGER NOT NULL (FK → farms)
fieldId         INTEGER (FK → fields, nullable) -- links to field timeline
category        TEXT NOT NULL  -- fertiliser|seed|medicine|vaccine|fuel|other
name            TEXT NOT NULL  -- "NPK 20-10-10", "Ryegrass Seed Mix"
date            TEXT NOT NULL  -- ISO date
quantity        REAL
unit            TEXT           -- kg|L|units|bags|tonnes
unitCost        REAL
totalCost       REAL NOT NULL
supplier        TEXT
notes           TEXT
createdAt       TEXT DEFAULT CURRENT_TIMESTAMP
```

---

## New API Routes

### Machinery
```
GET    /api/machinery                    List all machines (summary + total spend)
POST   /api/machinery                    Create machine
GET    /api/machinery/:id                Machine detail + event timeline
PUT    /api/machinery/:id                Update machine
DELETE /api/machinery/:id                Delete machine

GET    /api/machinery/:id/events         Events for a machine
POST   /api/machinery/:id/events         Log event (fuel/repair/service/sale)
PUT    /api/machinery/:id/events/:eid    Update event
DELETE /api/machinery/:id/events/:eid    Delete event
```

### Workers (owner/manager only)
```
GET    /api/workers                      List workers
POST   /api/workers                      Create worker
PUT    /api/workers/:id                  Update worker (incl. endDate for leaving)
DELETE /api/workers/:id                  Delete worker

GET    /api/workers/:id/payroll          Payroll events for a worker
POST   /api/workers/:id/payroll          Log payment
PUT    /api/workers/:id/payroll/:pid     Update payment
DELETE /api/workers/:id/payroll/:pid     Delete payment
```

### Supplies
```
GET    /api/supplies                     List all purchases (filterable by category)
POST   /api/supplies                     Log a purchase
PUT    /api/supplies/:id                 Update purchase
DELETE /api/supplies/:id                 Delete purchase
```

### Field Timeline
```
GET    /api/fields/:id/timeline          All events for a field (multi-source)
```

### Financials (updated)
```
GET    /api/analytics/financial          Updated to include all new cost categories
```

---

## New Frontend Pages

### `/machinery`
- List of machines as cards: name, type badge, make/model, purchase price, total spend
- "Add Machine" button → inline form or modal
- Click card → machine detail page

### `/machinery` detail (query param: `/machinery?id=X` for static export)
- Two tabs: Overview (specs) | Timeline (events)
- "Log Event" button: type selector → fuel/repair/service/other form
- Total cost-of-ownership shown prominently

### `/workers` (owner/manager only)
- List of active workers with role and start date
- Click worker → payroll history, total cost
- "Add Worker" and "Log Payment" buttons

### `/supplies`
- Filter chips: All / Fertiliser / Seed / Medicine / Vaccine / Other
- Table: date, name, category badge, quantity, total cost, field link
- "Log Purchase" button → category-aware form

### Field detail timeline tab (update to `/fields` page)
- Vertical timeline: supply applications + machinery work tagged to this field
- Filter chips: All / Supplies / Machinery
- Year selector

### Financials page updates
- New expense category rows: Machinery Purchase, Machinery Running, Payroll, Fertiliser, Seed, Medicine/Vaccine, Other Supplies
- Expenditure breakdown chart (stacked bar by category)
- Period filter applies to all categories

---

## Navigation

Add to sidebar:
- `Machinery` (Wrench icon) — all roles
- `Supplies` (ShoppingCart icon) — all roles
- `Workers` (Users icon) — owner/manager only (hidden for worker/viewer)

---

## Field Timeline Event Sources

The field timeline endpoint aggregates:

| Source table | Event type | Trigger |
|---|---|---|
| `supply_purchases` | Supply application | `fieldId` is set |
| `machinery_events` | Machinery work | `fieldId` is set |

Future sources (not in this phase):
- Cattle grazing movements
- Calving location

---

## Financials Category Mapping

| Category | Source table | Amount field |
|---|---|---|
| Machinery Purchase | `machinery_events` where type='purchase' | `cost` |
| Machinery Running | `machinery_events` where type IN (fuel, repair, service) | `cost` |
| Payroll | `payroll_events` | `amount` |
| Fertiliser | `supply_purchases` where category='fertiliser' | `totalCost` |
| Seed | `supply_purchases` where category='seed' | `totalCost` |
| Medicine/Vaccine | `supply_purchases` where category IN (medicine, vaccine) | `totalCost` |
| Other Supplies | `supply_purchases` where category='other' | `totalCost` |
| Revenue (existing) | `sale_events` | `price` |

---

## Role-Based Access

| Feature | Viewer | Worker | Manager | Owner |
|---|---|---|---|---|
| View machinery | ✓ | ✓ | ✓ | ✓ |
| Log machinery events | | ✓ | ✓ | ✓ |
| Add/edit machines | | | ✓ | ✓ |
| View supplies | ✓ | ✓ | ✓ | ✓ |
| Log supplies | | ✓ | ✓ | ✓ |
| View workers | | | ✓ | ✓ |
| Manage workers/payroll | | | ✓ | ✓ |
