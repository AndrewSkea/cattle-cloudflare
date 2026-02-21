# Financial Per-Head Insights & Export

**Date:** 2026-02-21
**Status:** Approved

---

## Overview

Add per-head financial tracking to HoovesWho so farmers can see how much each animal costs them and what margin they make on sales. The system works progressively — farmers who only log sales see revenue insights automatically, while those who log supplies and costs get richer per-head breakdowns without any extra effort.

Key UX principle: **never make farmers feel guilty about missing data.** Show what's available, don't highlight what's not.

---

## Tiered Cost Model

### Tier 1 — Automatic (zero effort)
Revenue per head from sale events. Basic P&L from existing supplies/payroll divided evenly across herd size. Works out of the box.

### Tier 2 — Allocated (light effort)
Farmers optionally tag supply purchases to groups: whole herd, all cows, all calves, a specific field, or selected animals. Costs flow through to per-head estimates.

### Tier 3 — Direct (detailed)
Log costs directly against individual animals from the cattle list or detail page. Overrides averaged allocation for that animal.

---

## Cost Allocation UX

### Two entry points:

**1. From Supplies page (and future expense forms):**
When logging a purchase, an optional "Allocate to" dropdown appears:
- None (default — no per-head allocation)
- Whole Herd
- All Cows (females on farm)
- All Calves (born this year)
- By Field (select a field)

The cost splits evenly across matching animals at the time of allocation.

**2. From Cattle list page:**
Select animals via checkboxes → click "Log Cost" in the selection bar (alongside existing Sell and Move to Mart buttons). Opens a modal:
- Amount (total)
- Description
- Date
- Submit → splits evenly across selected animals

---

## Data Model

### New table: `cost_allocations`
| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | Auto-increment |
| farmId | integer FK | Farm scoping |
| sourceType | text | `supply`, `machinery`, `payroll`, `direct` |
| sourceId | integer | FK to source table, null for direct costs |
| cattleId | integer FK | The animal this cost is allocated to |
| amount | real | Split amount (total / animal count) |
| date | text | When cost was incurred |
| description | text | Inherited from source or custom |
| createdAt | text | Timestamp |

### New table: `allocation_groups`
| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | Auto-increment |
| farmId | integer FK | Farm scoping |
| sourceType | text | Matches cost_allocations.sourceType |
| sourceId | integer | Matches cost_allocations.sourceId |
| groupType | text | `all_herd`, `cows`, `calves`, `field`, `custom` |
| groupTarget | integer | Field ID if by field, null otherwise |
| animalCount | integer | How many animals cost was split across |
| totalAmount | real | Original total before split |
| createdAt | text | Timestamp |

No changes to existing tables. Purely additive.

---

## API Endpoints

### New endpoints:
- `POST /api/cattle/allocate-cost` — Bulk allocate cost to animals. Body: `{ amount, description, date, groupType, cattleIds?, fieldId?, sourceType?, sourceId? }`
- `GET /api/cattle/:id/costs` — All cost allocations for an animal, grouped by month
- `GET /api/analytics/profitability` — Herd-level profit per head, margins by breed
- `GET /api/export/sales` — XLSX download of all sales
- `GET /api/export/costs` — XLSX download of all costs with allocations
- `GET /api/export/full` — Multi-sheet XLSX workbook (cattle register, sales, costs, P&L)
- `GET /api/export/cattle` — XLSX of cattle register (respects current filters)
- `GET /api/cattle/:id/report` — PDF single-page summary for one animal

---

## Frontend Changes

### Modified pages:

**Cattle list page:**
- Add "Log Cost" button to selection bar (when animals selected)
- Add "Export" button in header (downloads filtered cattle as XLSX)

**Cattle detail page:**
- New "Financials" tab:
  - Sold animals: sale price, price/kg, total allocated costs, profit margin, expandable cost breakdown
  - On-farm animals: costs to date, break-even price
  - Empty state: "Costs will appear here as you log supplies and expenses" (no guilt)
  - "Download PDF" link for printable per-head summary

**Financials page:**
- New "Per-Head Profitability" section:
  - Table of recently sold animals: tag, sale price, costs, margin
  - Average margin by breed chart
- "Export" dropdown: Sales Report, Cost Report, Full Farm Report (all XLSX)

**Supplies page:**
- Add "Allocate to" dropdown in the purchase form: None, Whole Herd, All Cows, All Calves, By Field

### New modals:

**Log Cost modal** (from cattle list selection bar):
- Amount (total, required)
- Description (required)
- Date (required, defaults to today)
- Submit splits evenly across selected animals

---

## Export Formats

### XLSX (using SheetJS library on worker):
- **Sales Report:** Tag, Date, Weight, Price, Price/kg, Buyer, Notes
- **Cost Report:** Date, Category, Name, Amount, Allocation (group type + animal count), Supplier
- **Full Farm Report (multi-sheet):**
  - Sheet 1: Cattle Register (all animals)
  - Sheet 2: Sales
  - Sheet 3: Costs & Allocations
  - Sheet 4: P&L Summary

### PDF (per-head report):
- Animal info header (tag, breed, sex, DOB)
- Cost breakdown table
- Sale info (if sold)
- Profit margin summary

---

## Out of Scope (v1)

- No recurring cost rules (auto-allocate monthly)
- No cost editing/reallocation after split
- No feed management module (feed is just a supply category)
- No forecasting or projected profit
- No cost editing — delete the source purchase to cascade-remove allocations
