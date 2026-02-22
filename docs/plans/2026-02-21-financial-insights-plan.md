# Financial Per-Head Insights Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-head cost tracking, profitability analytics, and XLSX/PDF export to the cattle management system.

**Architecture:** Two new DB tables (`cost_allocations`, `allocation_groups`) with additive-only schema changes. New cost allocation routes, profitability analytics endpoint, and export endpoints on the worker. Frontend gets a Log Cost modal on the cattle selection bar, an "Allocate to" dropdown on the supplies form, a Financials tab on cattle detail, a profitability section on the financials page, and export buttons throughout.

**Tech Stack:** Drizzle ORM (schema + migration), Hono (routes + Zod validation), SheetJS/xlsx (XLSX export — already in deps), jsPDF or HTML-to-string (PDF), React (frontend components)

---

### Task 1: Add cost_allocations and allocation_groups tables to schema

**Files:**
- Modify: `apps/worker/src/db/schema.ts`

**Step 1: Add the two new tables after supplyPurchases (line ~379)**

Add to `apps/worker/src/db/schema.ts` after the `supplyPurchases` table and before the RELATIONS section:

```typescript
// ==================== COST ALLOCATIONS TABLE ====================

export const costAllocations = sqliteTable('cost_allocations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  sourceType: text('source_type').notNull(), // 'supply' | 'machinery' | 'payroll' | 'direct'
  sourceId: integer('source_id'), // FK to source table, null for direct costs
  cattleId: integer('cattle_id').notNull().references(() => cattle.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  date: text('date').notNull(),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  farmIdx: index('idx_cost_alloc_farm').on(table.farmId),
  cattleIdx: index('idx_cost_alloc_cattle').on(table.cattleId),
  sourceIdx: index('idx_cost_alloc_source').on(table.sourceType, table.sourceId),
}));

// ==================== ALLOCATION GROUPS TABLE ====================

export const allocationGroups = sqliteTable('allocation_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  sourceType: text('source_type').notNull(),
  sourceId: integer('source_id'),
  groupType: text('group_type').notNull(), // 'all_herd' | 'cows' | 'calves' | 'field' | 'custom'
  groupTarget: integer('group_target'), // field ID if by field, null otherwise
  animalCount: integer('animal_count').notNull(),
  totalAmount: real('total_amount').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  farmIdx: index('idx_alloc_group_farm').on(table.farmId),
}));
```

**Step 2: Add relations after existing relations**

```typescript
export const costAllocationsRelations = relations(costAllocations, ({ one }) => ({
  farm: one(farms, { fields: [costAllocations.farmId], references: [farms.id] }),
  animal: one(cattle, { fields: [costAllocations.cattleId], references: [cattle.id] }),
}));

export const allocationGroupsRelations = relations(allocationGroups, ({ one }) => ({
  farm: one(farms, { fields: [allocationGroups.farmId], references: [farms.id] }),
}));
```

**Step 3: Add costAllocations to cattleRelations**

In the existing `cattleRelations`, add:
```typescript
costAllocations: many(costAllocations),
```

**Step 4: Add type exports at bottom**

```typescript
export type CostAllocation = typeof costAllocations.$inferSelect;
export type NewCostAllocation = typeof costAllocations.$inferInsert;

export type AllocationGroup = typeof allocationGroups.$inferSelect;
export type NewAllocationGroup = typeof allocationGroups.$inferInsert;
```

**Step 5: Commit**

```bash
cd apps/worker && git add src/db/schema.ts && git commit -m "feat: add cost_allocations and allocation_groups schema tables"
```

---

### Task 2: Generate and apply database migration

**Files:**
- Generated: `apps/worker/src/db/migrations/0004_*.sql`
- Generated: `apps/worker/src/db/migrations/meta/0004_snapshot.json`
- Modified: `apps/worker/src/db/migrations/meta/_journal.json`

**Step 1: Generate migration**

```bash
cd apps/worker && pnpm run db:generate
```

Expected: New migration file `0004_*.sql` created with CREATE TABLE statements for `cost_allocations` and `allocation_groups`.

**Step 2: Verify migration SQL**

Read the generated `.sql` file and check it creates both tables with correct columns and indexes.

**Step 3: Apply migration to remote D1**

```bash
cd apps/worker && wrangler d1 migrations apply cattle-management-db --remote
```

**Step 4: Commit**

```bash
cd apps/worker && git add src/db/migrations/ && git commit -m "feat: add migration for cost allocation tables"
```

---

### Task 3: Create cost allocation API route

**Files:**
- Create: `apps/worker/src/routes/costs.ts`
- Modify: `apps/worker/src/index.ts`

**Step 1: Create the cost routes file**

Create `apps/worker/src/routes/costs.ts`:

```typescript
/**
 * Cost Allocation Routes - Per-head cost tracking and allocation
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const costs = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// ==================== VALIDATION SCHEMAS ====================

const allocateCostSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  groupType: z.enum(['all_herd', 'cows', 'calves', 'field', 'custom']),
  cattleIds: z.array(z.number().int()).optional(),
  fieldId: z.number().int().optional(),
  sourceType: z.enum(['supply', 'machinery', 'payroll', 'direct']).default('direct'),
  sourceId: z.number().int().optional(),
});

// ==================== ROUTES ====================

/**
 * POST /api/costs/allocate
 * Bulk allocate a cost across a group of animals
 */
costs.post('/allocate', zValidator('json', allocateCostSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const body = c.req.valid('json');

  // Determine which animals to allocate to
  let cattleIds: number[] = [];

  if (body.groupType === 'custom' && body.cattleIds?.length) {
    cattleIds = body.cattleIds;
  } else if (body.groupType === 'all_herd') {
    const animals = await db.select({ id: schema.cattle.id })
      .from(schema.cattle)
      .where(and(
        eq(schema.cattle.farmId, farmId),
        eq(schema.cattle.onFarm, true),
      ));
    cattleIds = animals.map(a => a.id);
  } else if (body.groupType === 'cows') {
    const animals = await db.select({ id: schema.cattle.id })
      .from(schema.cattle)
      .where(and(
        eq(schema.cattle.farmId, farmId),
        eq(schema.cattle.onFarm, true),
        inArray(schema.cattle.sex, ['fem', 'hief']),
      ));
    cattleIds = animals.map(a => a.id);
  } else if (body.groupType === 'calves') {
    const currentYear = new Date().getFullYear();
    const animals = await db.select({ id: schema.cattle.id })
      .from(schema.cattle)
      .where(and(
        eq(schema.cattle.farmId, farmId),
        eq(schema.cattle.onFarm, true),
        eq(schema.cattle.yob, currentYear),
      ));
    cattleIds = animals.map(a => a.id);
  } else if (body.groupType === 'field' && body.fieldId) {
    const assignments = await db.select({ cattleId: schema.fieldAssignments.cattleId })
      .from(schema.fieldAssignments)
      .where(and(
        eq(schema.fieldAssignments.farmId, farmId),
        eq(schema.fieldAssignments.fieldId, body.fieldId),
        sql`${schema.fieldAssignments.removedDate} IS NULL`,
      ));
    cattleIds = assignments.map(a => a.cattleId);
  }

  if (cattleIds.length === 0) {
    return c.json({ error: 'No animals found for this group' }, 400);
  }

  const perHead = body.amount / cattleIds.length;

  // Create allocation group record
  const [group] = await db.insert(schema.allocationGroups).values({
    farmId,
    sourceType: body.sourceType,
    sourceId: body.sourceId ?? null,
    groupType: body.groupType,
    groupTarget: body.fieldId ?? null,
    animalCount: cattleIds.length,
    totalAmount: body.amount,
  }).returning();

  // Create individual cost allocation records
  const allocations = cattleIds.map(cattleId => ({
    farmId,
    sourceType: body.sourceType,
    sourceId: body.sourceId ?? null,
    cattleId,
    amount: perHead,
    date: body.date,
    description: body.description,
  }));

  // D1 batch insert (max 100 at a time)
  const batchSize = 100;
  for (let i = 0; i < allocations.length; i += batchSize) {
    const batch = allocations.slice(i, i + batchSize);
    await db.insert(schema.costAllocations).values(batch);
  }

  return c.json({
    data: {
      groupId: group.id,
      animalCount: cattleIds.length,
      perHead: Math.round(perHead * 100) / 100,
      totalAmount: body.amount,
    }
  }, 201);
});

/**
 * GET /api/costs/animal/:id
 * Get all cost allocations for a specific animal
 */
costs.get('/animal/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const cattleId = Number(c.req.param('id'));

  const allocations = await db.select()
    .from(schema.costAllocations)
    .where(and(
      eq(schema.costAllocations.farmId, farmId),
      eq(schema.costAllocations.cattleId, cattleId),
    ))
    .orderBy(desc(schema.costAllocations.date));

  // Group by month
  const byMonth: Record<string, { month: string; items: typeof allocations; total: number }> = {};
  for (const alloc of allocations) {
    const month = alloc.date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) {
      byMonth[month] = { month, items: [], total: 0 };
    }
    byMonth[month].items.push(alloc);
    byMonth[month].total += alloc.amount;
  }

  const totalCosts = allocations.reduce((sum, a) => sum + a.amount, 0);

  return c.json({
    data: {
      allocations,
      byMonth: Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)),
      totalCosts: Math.round(totalCosts * 100) / 100,
    }
  });
});

/**
 * GET /api/costs/profitability
 * Herd-level profitability stats
 */
costs.get('/profitability', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  // Get all sold animals with their sale data
  const soldAnimals = await db.select({
    id: schema.cattle.id,
    tagNo: schema.cattle.tagNo,
    managementTag: schema.cattle.managementTag,
    breed: schema.cattle.breed,
    sex: schema.cattle.sex,
    salePrice: schema.saleEvents.salePrice,
    saleDate: schema.saleEvents.eventDate,
    weightKg: schema.saleEvents.weightKg,
  })
  .from(schema.cattle)
  .innerJoin(schema.saleEvents, eq(schema.cattle.id, schema.saleEvents.animalId))
  .where(eq(schema.cattle.farmId, farmId));

  // Get cost allocations grouped by cattle
  const costsByCattle = await db.select({
    cattleId: schema.costAllocations.cattleId,
    totalCost: sql<number>`SUM(${schema.costAllocations.amount})`,
  })
  .from(schema.costAllocations)
  .where(eq(schema.costAllocations.farmId, farmId))
  .groupBy(schema.costAllocations.cattleId);

  const costMap = new Map(costsByCattle.map(c => [c.cattleId, c.totalCost]));

  // Calculate per-head profitability for sold animals
  const perHead = soldAnimals.map(animal => {
    const costs = costMap.get(animal.id) || 0;
    const revenue = animal.salePrice || 0;
    const profit = revenue - costs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      id: animal.id,
      tagNo: animal.tagNo,
      managementTag: animal.managementTag,
      breed: animal.breed,
      sex: animal.sex,
      salePrice: revenue,
      saleDate: animal.saleDate,
      weightKg: animal.weightKg,
      totalCosts: Math.round(costs * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin: Math.round(margin * 10) / 10,
    };
  });

  // Average margin by breed
  const breedMap: Record<string, { totalProfit: number; totalRevenue: number; count: number }> = {};
  for (const animal of perHead) {
    const breed = animal.breed || 'Unknown';
    if (!breedMap[breed]) breedMap[breed] = { totalProfit: 0, totalRevenue: 0, count: 0 };
    breedMap[breed].totalProfit += animal.profit;
    breedMap[breed].totalRevenue += animal.salePrice;
    breedMap[breed].count++;
  }

  const byBreed = Object.entries(breedMap).map(([breed, data]) => ({
    breed,
    count: data.count,
    avgProfit: Math.round(data.totalProfit / data.count * 100) / 100,
    avgMargin: data.totalRevenue > 0
      ? Math.round((data.totalProfit / data.totalRevenue) * 100 * 10) / 10
      : 0,
  }));

  // On-farm animals with costs
  const onFarmWithCosts = await db.select({
    id: schema.cattle.id,
    tagNo: schema.cattle.tagNo,
    managementTag: schema.cattle.managementTag,
    breed: schema.cattle.breed,
  })
  .from(schema.cattle)
  .where(and(
    eq(schema.cattle.farmId, farmId),
    eq(schema.cattle.onFarm, true),
  ));

  const onFarmCosts = onFarmWithCosts
    .filter(a => costMap.has(a.id))
    .map(a => ({
      ...a,
      costsToDate: Math.round((costMap.get(a.id) || 0) * 100) / 100,
    }));

  return c.json({
    data: {
      soldAnimals: perHead.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || '')),
      byBreed,
      onFarmCosts,
      summary: {
        totalSold: perHead.length,
        totalRevenue: Math.round(perHead.reduce((s, a) => s + a.salePrice, 0) * 100) / 100,
        totalCosts: Math.round(perHead.reduce((s, a) => s + a.totalCosts, 0) * 100) / 100,
        avgMargin: perHead.length > 0
          ? Math.round(perHead.reduce((s, a) => s + a.margin, 0) / perHead.length * 10) / 10
          : 0,
      },
    }
  });
});

export default costs;
```

**Step 2: Register route in index.ts**

In `apps/worker/src/index.ts`:

Add import:
```typescript
import costsRoutes from './routes/costs';
```

Add auth middleware (after existing auth lines ~line 70):
```typescript
app.use('/api/costs/*', authMiddleware);
```

Add route registration (after existing routes ~line 105):
```typescript
app.route('/api/costs', costsRoutes);
```

**Step 3: Commit**

```bash
cd apps/worker && git add src/routes/costs.ts src/index.ts && git commit -m "feat: add cost allocation and profitability API routes"
```

---

### Task 4: Create XLSX export routes

**Files:**
- Create: `apps/worker/src/routes/export.ts`
- Modify: `apps/worker/src/index.ts`

**Step 1: Create the export routes file**

Create `apps/worker/src/routes/export.ts`:

```typescript
/**
 * Export Routes - XLSX downloads for sales, costs, cattle register, and full reports
 */

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const exportRoutes = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

function sendXlsx(c: any, workbook: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/**
 * GET /api/export/sales
 * Download all sales as XLSX
 */
exportRoutes.get('/sales', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  const sales = await db.select({
    tagNo: schema.cattle.tagNo,
    managementTag: schema.cattle.managementTag,
    breed: schema.cattle.breed,
    sex: schema.cattle.sex,
    saleDate: schema.saleEvents.eventDate,
    weightKg: schema.saleEvents.weightKg,
    salePrice: schema.saleEvents.salePrice,
    pricePerKg: sql<number>`CASE WHEN ${schema.saleEvents.weightKg} > 0 THEN ROUND(${schema.saleEvents.salePrice} / ${schema.saleEvents.weightKg}, 2) ELSE NULL END`,
    notes: schema.saleEvents.notes,
  })
  .from(schema.saleEvents)
  .innerJoin(schema.cattle, eq(schema.saleEvents.animalId, schema.cattle.id))
  .where(eq(schema.saleEvents.farmId, farmId))
  .orderBy(desc(schema.saleEvents.eventDate));

  const rows = sales.map(s => ({
    'Tag': s.tagNo,
    'Mgmt Tag': s.managementTag || '',
    'Breed': s.breed || '',
    'Sex': s.sex || '',
    'Sale Date': s.saleDate,
    'Weight (kg)': s.weightKg || '',
    'Price (£)': s.salePrice || '',
    'Price/kg (£)': s.pricePerKg || '',
    'Notes': s.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  return sendXlsx(c, wb, `sales-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

/**
 * GET /api/export/costs
 * Download all cost allocations as XLSX
 */
exportRoutes.get('/costs', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  const allocations = await db.select({
    tagNo: schema.cattle.tagNo,
    managementTag: schema.cattle.managementTag,
    date: schema.costAllocations.date,
    sourceType: schema.costAllocations.sourceType,
    description: schema.costAllocations.description,
    amount: schema.costAllocations.amount,
  })
  .from(schema.costAllocations)
  .innerJoin(schema.cattle, eq(schema.costAllocations.cattleId, schema.cattle.id))
  .where(eq(schema.costAllocations.farmId, farmId))
  .orderBy(desc(schema.costAllocations.date));

  const rows = allocations.map(a => ({
    'Tag': a.tagNo,
    'Mgmt Tag': a.managementTag || '',
    'Date': a.date,
    'Category': a.sourceType,
    'Description': a.description || '',
    'Amount (£)': a.amount,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Costs');
  return sendXlsx(c, wb, `costs-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

/**
 * GET /api/export/cattle
 * Download cattle register as XLSX
 */
exportRoutes.get('/cattle', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const status = c.req.query('status'); // 'on_farm', 'sold', 'all'

  let query = db.select()
    .from(schema.cattle)
    .where(eq(schema.cattle.farmId, farmId))
    .$dynamic();

  if (status === 'on_farm') {
    query = query.where(and(eq(schema.cattle.farmId, farmId), eq(schema.cattle.onFarm, true)));
  } else if (status === 'sold') {
    query = query.where(and(eq(schema.cattle.farmId, farmId), eq(schema.cattle.onFarm, false)));
  }

  const animals = await query.orderBy(schema.cattle.tagNo);

  const rows = animals.map(a => ({
    'Tag': a.tagNo,
    'Mgmt Tag': a.managementTag || '',
    'Breed': a.breed || '',
    'Sex': a.sex || '',
    'DOB': a.dob,
    'YOB': a.yob,
    'Status': a.currentStatus || (a.onFarm ? 'On Farm' : 'Off Farm'),
    'Notes': a.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Cattle Register');
  return sendXlsx(c, wb, `cattle-register-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

/**
 * GET /api/export/full
 * Multi-sheet XLSX workbook: Cattle Register, Sales, Costs, P&L Summary
 */
exportRoutes.get('/full', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  // Sheet 1: Cattle Register
  const animals = await db.select()
    .from(schema.cattle)
    .where(eq(schema.cattle.farmId, farmId))
    .orderBy(schema.cattle.tagNo);

  const cattleRows = animals.map(a => ({
    'Tag': a.tagNo,
    'Mgmt Tag': a.managementTag || '',
    'Breed': a.breed || '',
    'Sex': a.sex || '',
    'DOB': a.dob,
    'YOB': a.yob,
    'On Farm': a.onFarm ? 'Yes' : 'No',
    'Status': a.currentStatus || '',
  }));

  // Sheet 2: Sales
  const sales = await db.select({
    tagNo: schema.cattle.tagNo,
    saleDate: schema.saleEvents.eventDate,
    weightKg: schema.saleEvents.weightKg,
    salePrice: schema.saleEvents.salePrice,
    notes: schema.saleEvents.notes,
  })
  .from(schema.saleEvents)
  .innerJoin(schema.cattle, eq(schema.saleEvents.animalId, schema.cattle.id))
  .where(eq(schema.saleEvents.farmId, farmId))
  .orderBy(desc(schema.saleEvents.eventDate));

  const salesRows = sales.map(s => ({
    'Tag': s.tagNo,
    'Sale Date': s.saleDate,
    'Weight (kg)': s.weightKg || '',
    'Price (£)': s.salePrice || '',
    'Notes': s.notes || '',
  }));

  // Sheet 3: Costs & Allocations
  const allocations = await db.select({
    tagNo: schema.cattle.tagNo,
    date: schema.costAllocations.date,
    sourceType: schema.costAllocations.sourceType,
    description: schema.costAllocations.description,
    amount: schema.costAllocations.amount,
  })
  .from(schema.costAllocations)
  .innerJoin(schema.cattle, eq(schema.costAllocations.cattleId, schema.cattle.id))
  .where(eq(schema.costAllocations.farmId, farmId))
  .orderBy(desc(schema.costAllocations.date));

  const costRows = allocations.map(a => ({
    'Tag': a.tagNo,
    'Date': a.date,
    'Category': a.sourceType,
    'Description': a.description || '',
    'Amount (£)': a.amount,
  }));

  // Sheet 4: P&L Summary
  const totalRevenue = sales.reduce((s, sale) => s + (sale.salePrice || 0), 0);
  const totalCosts = allocations.reduce((s, a) => s + a.amount, 0);

  // Get supply totals
  const supplyTotal = await db.select({
    total: sql<number>`COALESCE(SUM(${schema.supplyPurchases.totalCost}), 0)`,
  })
  .from(schema.supplyPurchases)
  .where(eq(schema.supplyPurchases.farmId, farmId));

  // Get machinery costs
  const machineryTotal = await db.select({
    total: sql<number>`COALESCE(SUM(${schema.machineryEvents.cost}), 0)`,
  })
  .from(schema.machineryEvents)
  .where(eq(schema.machineryEvents.farmId, farmId));

  // Get payroll total
  const payrollTotal = await db.select({
    total: sql<number>`COALESCE(SUM(${schema.payrollEvents.amount}), 0)`,
  })
  .from(schema.payrollEvents)
  .where(eq(schema.payrollEvents.farmId, farmId));

  const plRows = [
    { 'Category': 'INCOME', 'Amount (£)': '' },
    { 'Category': 'Cattle Sales', 'Amount (£)': totalRevenue },
    { 'Category': '', 'Amount (£)': '' },
    { 'Category': 'EXPENDITURE', 'Amount (£)': '' },
    { 'Category': 'Supplies', 'Amount (£)': supplyTotal[0]?.total || 0 },
    { 'Category': 'Machinery', 'Amount (£)': machineryTotal[0]?.total || 0 },
    { 'Category': 'Payroll', 'Amount (£)': payrollTotal[0]?.total || 0 },
    { 'Category': 'Allocated Costs', 'Amount (£)': totalCosts },
    { 'Category': '', 'Amount (£)': '' },
    { 'Category': 'NET MARGIN', 'Amount (£)': totalRevenue - (supplyTotal[0]?.total || 0) - (machineryTotal[0]?.total || 0) - (payrollTotal[0]?.total || 0) },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cattleRows), 'Cattle Register');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'Sales');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(costRows), 'Costs');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plRows), 'P&L Summary');
  return sendXlsx(c, wb, `farm-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

export default exportRoutes;
```

**Step 2: Register export route in index.ts**

Add import:
```typescript
import exportRoutes from './routes/export';
```

Add auth middleware:
```typescript
app.use('/api/export/*', authMiddleware);
```

Add route:
```typescript
app.route('/api/export', exportRoutes);
```

**Step 3: Commit**

```bash
cd apps/worker && git add src/routes/export.ts src/index.ts && git commit -m "feat: add XLSX export routes for sales, costs, cattle, and full report"
```

---

### Task 5: Create per-head PDF report route

**Files:**
- Modify: `apps/worker/src/routes/costs.ts`

**Step 1: Add PDF report endpoint to costs.ts**

Add this route at the end of the costs router (before `export default costs`):

```typescript
/**
 * GET /api/costs/report/:id
 * Generate a simple text-based PDF summary for one animal
 * Returns HTML that the frontend can print via window.print()
 */
costs.get('/report/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const cattleId = Number(c.req.param('id'));

  // Get animal info
  const [animal] = await db.select()
    .from(schema.cattle)
    .where(and(eq(schema.cattle.id, cattleId), eq(schema.cattle.farmId, farmId)));

  if (!animal) return c.json({ error: 'Animal not found' }, 404);

  // Get sale info
  const [sale] = await db.select()
    .from(schema.saleEvents)
    .where(and(eq(schema.saleEvents.animalId, cattleId), eq(schema.saleEvents.farmId, farmId)));

  // Get cost allocations
  const allocations = await db.select()
    .from(schema.costAllocations)
    .where(and(eq(schema.costAllocations.cattleId, cattleId), eq(schema.costAllocations.farmId, farmId)))
    .orderBy(desc(schema.costAllocations.date));

  const totalCosts = allocations.reduce((s, a) => s + a.amount, 0);
  const revenue = sale?.salePrice || 0;
  const profit = revenue - totalCosts;

  return c.json({
    data: {
      animal: {
        tagNo: animal.tagNo,
        managementTag: animal.managementTag,
        breed: animal.breed,
        sex: animal.sex,
        dob: animal.dob,
        yob: animal.yob,
        onFarm: animal.onFarm,
        currentStatus: animal.currentStatus,
      },
      sale: sale ? {
        date: sale.eventDate,
        price: sale.salePrice,
        weightKg: sale.weightKg,
        pricePerKg: sale.weightKg && sale.salePrice ? Math.round(sale.salePrice / sale.weightKg * 100) / 100 : null,
      } : null,
      costs: allocations.map(a => ({
        date: a.date,
        description: a.description,
        sourceType: a.sourceType,
        amount: a.amount,
      })),
      summary: {
        totalCosts: Math.round(totalCosts * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: revenue > 0 ? Math.round((profit / revenue) * 100 * 10) / 10 : null,
      },
    },
  });
});
```

**Step 2: Commit**

```bash
cd apps/worker && git add src/routes/costs.ts && git commit -m "feat: add per-head report API endpoint"
```

---

### Task 6: Add API client methods for costs, profitability, and export

**Files:**
- Modify: `apps/web/lib/api-client.ts`

**Step 1: Add new methods to ApiClient class**

Add these methods at the end of the `ApiClient` class (before the closing brace), after the existing `getFinancialPL` method:

```typescript
  // ==================== Cost Allocation ====================

  async allocateCost(data: {
    amount: number;
    description: string;
    date: string;
    groupType: 'all_herd' | 'cows' | 'calves' | 'field' | 'custom';
    cattleIds?: number[];
    fieldId?: number;
    sourceType?: string;
    sourceId?: number;
  }) {
    return this.request('/api/costs/allocate', { method: 'POST', body: data });
  }

  async getAnimalCosts(cattleId: number) {
    return this.request(`/api/costs/animal/${cattleId}`);
  }

  async getProfitability() {
    return this.request('/api/costs/profitability');
  }

  async getAnimalReport(cattleId: number) {
    return this.request(`/api/costs/report/${cattleId}`);
  }

  // ==================== Export ====================

  async downloadExport(type: 'sales' | 'costs' | 'cattle' | 'full', params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = `${this.baseUrl}/api/export/${type}${query}`;
    const response = await fetch(url, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `${type}-export.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }
```

**Step 2: Commit**

```bash
cd apps/web && git add lib/api-client.ts && git commit -m "feat: add API client methods for costs, profitability, and export"
```

---

### Task 7: Create Log Cost modal component

**Files:**
- Create: `apps/web/components/cattle-actions/log-cost-modal.tsx`
- Modify: `apps/web/components/cattle-actions/index.ts`

**Step 1: Create the Log Cost modal**

Create `apps/web/components/cattle-actions/log-cost-modal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface LogCostModalProps {
  open: boolean;
  onClose: () => void;
  animals: Array<{ id: number; tagNo: string; managementTag?: string | null }>;
  onSuccess: () => void;
}

export function LogCostModal({ open, onClose, animals, onSuccess }: LogCostModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const perHead = amount && animals.length > 0
    ? (parseFloat(amount) / animals.length).toFixed(2)
    : '0.00';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !description || !date) return;

    setSaving(true);
    setError('');
    try {
      await apiClient.allocateCost({
        amount: parseFloat(amount),
        description,
        date,
        groupType: 'custom',
        cattleIds: animals.map(a => a.id),
      });
      onSuccess();
      onClose();
      setAmount('');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
    } catch (err: any) {
      setError(err.message || 'Failed to allocate cost');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Log Cost</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Split cost evenly across {animals.length} animal{animals.length !== 1 ? 's' : ''} ({'\u00A3'}{perHead} per head)
        </p>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount ({'\u00A3'})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. Winter feed supplement"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              required
            />
          </div>

          {animals.length <= 10 && (
            <div className="text-xs text-gray-400">
              {animals.map(a => a.managementTag || a.tagNo).join(', ')}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !amount || !description}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Allocate Cost'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Export from index.ts**

In `apps/web/components/cattle-actions/index.ts`, add:

```typescript
export { LogCostModal } from './log-cost-modal'
```

**Step 3: Commit**

```bash
cd apps/web && git add components/cattle-actions/log-cost-modal.tsx components/cattle-actions/index.ts && git commit -m "feat: add Log Cost modal component"
```

---

### Task 8: Add "Log Cost" button to cattle list selection bar

**Files:**
- Modify: `apps/web/app/(auth)/cattle/page.tsx`

**Step 1: Import LogCostModal**

Add `LogCostModal` to the existing imports from `@/components/cattle-actions`:

```typescript
import {
  useCattleActions,
  // ... existing imports ...
  LogCostModal,
} from '@/components/cattle-actions';
```

**Step 2: Add costModalOpen state**

Add alongside existing `sellModalOpen` and `martModalOpen` states:

```typescript
const [costModalOpen, setCostModalOpen] = useState(false);
```

**Step 3: Add "Log Cost" button to the selection bar**

Find the selection bar section (the green bar that shows when `selectedCount > 0`). Between the existing "Sell" and "Move to Mart" buttons, add:

```tsx
<button
  onClick={() => setCostModalOpen(true)}
  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 text-gray-700 rounded text-sm font-medium hover:bg-white"
>
  Log Cost
</button>
```

**Step 4: Add LogCostModal render**

Add alongside the existing SellModal and MoveToMartModal renders at the bottom of the component:

```tsx
<LogCostModal
  open={costModalOpen}
  onClose={() => setCostModalOpen(false)}
  animals={cattle.filter(c => selectedIds.has(c.id)).map(c => ({ id: c.id, tagNo: c.tagNo, managementTag: c.managementTag }))}
  onSuccess={() => { setCostModalOpen(false); clearSelection(); }}
/>
```

**Step 5: Add "Export" button in the header area**

Find the page header area (near the "Add Cattle" button). Add an export button:

```tsx
<button
  onClick={() => apiClient.downloadExport('cattle', { status: statusFilter === 'On Farm' ? 'on_farm' : statusFilter === 'Sold' ? 'sold' : 'all' })}
  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50"
>
  Export
</button>
```

**Step 6: Commit**

```bash
cd apps/web && git add app/\(auth\)/cattle/page.tsx && git commit -m "feat: add Log Cost button and Export to cattle list page"
```

---

### Task 9: Add "Allocate to" dropdown to supplies form

**Files:**
- Modify: `apps/web/app/(auth)/supplies/page.tsx`

**Step 1: Add allocateTo state**

Add a new state variable alongside existing form states:

```typescript
const [fAllocateTo, setFAllocateTo] = useState('none');
```

**Step 2: Add the dropdown to the form**

In the supplies form, after the existing fields (after fNotes or fFieldId), add:

```tsx
<div>
  <label className="block text-xs font-medium text-gray-600 mb-1">Allocate to</label>
  <select
    value={fAllocateTo}
    onChange={(e) => setFAllocateTo(e.target.value)}
    className="w-full border rounded px-2 py-1.5 text-sm"
  >
    <option value="none">None</option>
    <option value="all_herd">Whole Herd</option>
    <option value="cows">All Cows</option>
    <option value="calves">All Calves (born this year)</option>
    <option value="field">By Field</option>
  </select>
</div>
```

**Step 3: Modify form submission**

After the supply is created successfully (in the submit handler), add the allocation call if `fAllocateTo !== 'none'`:

```typescript
// After: const result = await apiClient.createSupply(...)
if (fAllocateTo !== 'none') {
  await apiClient.allocateCost({
    amount: parseFloat(fTotalCost),
    description: fName,
    date: fDate,
    groupType: fAllocateTo as any,
    fieldId: fAllocateTo === 'field' && fFieldId ? parseInt(fFieldId) : undefined,
    sourceType: 'supply',
    sourceId: result.data?.id,
  });
}
```

**Step 4: Reset allocateTo on form clear**

Add `setFAllocateTo('none')` to the form reset logic.

**Step 5: Commit**

```bash
cd apps/web && git add app/\(auth\)/supplies/page.tsx && git commit -m "feat: add Allocate To dropdown on supplies form"
```

---

### Task 10: Add Financials tab to cattle detail page

**Files:**
- Modify: `apps/web/app/(auth)/cattle/detail/page.tsx`

**Step 1: Add 'financials' to TabId type**

Change the tab type:
```typescript
type TabId = 'info' | 'family' | 'health' | 'history' | 'financials'
```

**Step 2: Add Financials tab to the tabs array**

After the existing tabs (before the history tab), add:
```typescript
{ id: 'financials' as TabId, label: 'Financials' },
```

**Step 3: Add state for costs data**

```typescript
const [animalCosts, setAnimalCosts] = useState<any>(null);
const [costsLoading, setCostsLoading] = useState(false);
```

**Step 4: Load costs when Financials tab is selected**

Add a useEffect or handler that loads costs when the tab is clicked:

```typescript
useEffect(() => {
  if (activeTab === 'financials' && !animalCosts && cattleDetail?.id) {
    setCostsLoading(true);
    apiClient.getAnimalCosts(cattleDetail.id)
      .then(res => setAnimalCosts(res.data))
      .catch(() => {})
      .finally(() => setCostsLoading(false));
  }
}, [activeTab, cattleDetail?.id]);
```

**Step 5: Add Financials tab content**

Add the tab panel content alongside the existing tab panels:

```tsx
{activeTab === 'financials' && (
  <div className="space-y-4">
    {costsLoading ? (
      <div className="text-center py-8 text-gray-400">Loading costs...</div>
    ) : !animalCosts || animalCosts.allocations.length === 0 ? (
      <div className="bg-white rounded-lg border p-6 text-center">
        <p className="text-gray-500 text-sm">Costs will appear here as you log supplies and expenses.</p>
      </div>
    ) : (
      <>
        {/* Summary card */}
        <div className="bg-white rounded-lg border p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Cost Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Total Costs</p>
              <p className="text-lg font-bold text-gray-900">{'\u00A3'}{animalCosts.totalCosts.toFixed(2)}</p>
            </div>
            {cattleDetail?.sale && (
              <>
                <div>
                  <p className="text-xs text-gray-500">Sale Price</p>
                  <p className="text-lg font-bold text-gray-900">{'\u00A3'}{cattleDetail.sale.salePrice?.toFixed(2) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Profit</p>
                  <p className={`text-lg font-bold ${(cattleDetail.sale.salePrice || 0) - animalCosts.totalCosts >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {'\u00A3'}{((cattleDetail.sale.salePrice || 0) - animalCosts.totalCosts).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Margin</p>
                  <p className="text-lg font-bold text-gray-900">
                    {cattleDetail.sale.salePrice
                      ? (((cattleDetail.sale.salePrice - animalCosts.totalCosts) / cattleDetail.sale.salePrice) * 100).toFixed(1) + '%'
                      : '—'}
                  </p>
                </div>
              </>
            )}
            {!cattleDetail?.sale && cattleDetail?.onFarm && (
              <div>
                <p className="text-xs text-gray-500">Costs to Date</p>
                <p className="text-lg font-bold text-orange-600">{'\u00A3'}{animalCosts.totalCosts.toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Cost breakdown by month */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Cost Breakdown</h4>
            <button
              onClick={() => window.open(`/cattle/report/${cattleDetail?.id}`, '_blank')}
              className="text-xs text-green-600 hover:text-green-700"
            >
              Download PDF
            </button>
          </div>
          <div className="space-y-3">
            {animalCosts.byMonth.map((month: any) => (
              <div key={month.month}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="font-medium text-gray-700">{month.month}</span>
                  <span className="text-gray-500">{'\u00A3'}{month.total.toFixed(2)}</span>
                </div>
                <div className="space-y-1 pl-3">
                  {month.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-xs text-gray-500">
                      <span>{item.description || item.sourceType}</span>
                      <span>{'\u00A3'}{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )}
  </div>
)}
```

**Step 6: Commit**

```bash
cd apps/web && git add app/\(auth\)/cattle/detail/page.tsx && git commit -m "feat: add Financials tab to cattle detail page"
```

---

### Task 11: Add profitability section to financials page

**Files:**
- Modify: `apps/web/app/(auth)/financials/page.tsx`

**Step 1: Add profitability state**

```typescript
const [profitability, setProfitability] = useState<any>(null);
```

**Step 2: Load profitability data**

In the `loadFinancialData` function, add the profitability call to the existing Promise.all:

```typescript
const [salesRes, metricsRes, plRes, profitRes] = await Promise.all([
  apiClient.getSales({ sortBy, order: sortOrder }),
  apiClient.getSalesMetrics({ period: '12months' }),
  apiClient.getFinancialPL(),
  apiClient.getProfitability(),
]);
// ... existing handlers ...
setProfitability(profitRes.data || null);
```

**Step 3: Add profitability section**

After the P&L Breakdown section and before the Sales Table, add:

```tsx
{/* Per-Head Profitability */}
{profitability && profitability.soldAnimals.length > 0 && (
  <div className="bg-white rounded-lg border p-4">
    <h3 className="text-sm font-semibold text-gray-700 mb-3">Per-Head Profitability</h3>

    {/* Summary row */}
    <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded">
      <div>
        <p className="text-xs text-gray-500">Animals Sold</p>
        <p className="text-lg font-bold">{profitability.summary.totalSold}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Total Revenue</p>
        <p className="text-lg font-bold">{'\u00A3'}{profitability.summary.totalRevenue.toLocaleString()}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Allocated Costs</p>
        <p className="text-lg font-bold">{'\u00A3'}{profitability.summary.totalCosts.toLocaleString()}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Avg Margin</p>
        <p className={`text-lg font-bold ${profitability.summary.avgMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {profitability.summary.avgMargin}%
        </p>
      </div>
    </div>

    {/* Breed breakdown */}
    {profitability.byBreed.length > 0 && (
      <div className="mb-4">
        <h4 className="text-xs font-medium text-gray-500 mb-2">By Breed</h4>
        <div className="flex gap-3 flex-wrap">
          {profitability.byBreed.map((b: any) => (
            <div key={b.breed} className="bg-gray-50 rounded px-3 py-2 text-sm">
              <span className="font-medium">{b.breed}</span>
              <span className="text-gray-400 mx-1">·</span>
              <span className={b.avgMargin >= 0 ? 'text-green-600' : 'text-red-600'}>{b.avgMargin}%</span>
              <span className="text-gray-400 text-xs ml-1">({b.count})</span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Recent sold animals table */}
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="pb-2 pr-3">Tag</th>
            <th className="pb-2 pr-3">Breed</th>
            <th className="pb-2 pr-3">Sale Date</th>
            <th className="pb-2 pr-3 text-right">Sale Price</th>
            <th className="pb-2 pr-3 text-right">Costs</th>
            <th className="pb-2 text-right">Margin</th>
          </tr>
        </thead>
        <tbody>
          {profitability.soldAnimals.slice(0, 20).map((a: any) => (
            <tr key={a.id} className="border-b border-gray-100">
              <td className="py-2 pr-3 font-medium">{a.managementTag || a.tagNo}</td>
              <td className="py-2 pr-3 text-gray-500">{a.breed || '—'}</td>
              <td className="py-2 pr-3 text-gray-500">{a.saleDate}</td>
              <td className="py-2 pr-3 text-right">{'\u00A3'}{a.salePrice.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right text-gray-500">{'\u00A3'}{a.totalCosts.toLocaleString()}</td>
              <td className={`py-2 text-right font-medium ${a.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {a.margin}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

**Step 4: Replace CSV export with XLSX export dropdown**

Replace the existing "Export CSV" button with:

```tsx
<div className="relative group">
  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50">
    Export
  </button>
  <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg z-10 py-1 min-w-[180px]">
    <button onClick={() => apiClient.downloadExport('sales')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
      Sales Report
    </button>
    <button onClick={() => apiClient.downloadExport('costs')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
      Cost Report
    </button>
    <button onClick={() => apiClient.downloadExport('full')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
      Full Farm Report
    </button>
  </div>
</div>
```

**Step 5: Commit**

```bash
cd apps/web && git add app/\(auth\)/financials/page.tsx && git commit -m "feat: add profitability section and XLSX export to financials page"
```

---

### Task 12: Create printable per-head report page

**Files:**
- Create: `apps/web/app/(auth)/cattle/report/page.tsx`

**Step 1: Create the report page**

Create `apps/web/app/(auth)/cattle/report/page.tsx`:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { apiClient } from '@/lib/api-client';

function ReportContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiClient.getAnimalReport(Number(id))
      .then(res => setReport(res.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading report...</div>;
  if (!report) return <div className="p-8 text-center text-red-500">Report not found</div>;

  const { animal, sale, costs, summary } = report;

  return (
    <div className="max-w-2xl mx-auto p-8 print:p-4">
      <div className="flex justify-between items-start mb-6 print:mb-4">
        <div>
          <h1 className="text-2xl font-bold">{animal.managementTag || animal.tagNo}</h1>
          <p className="text-gray-500">{animal.tagNo}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Animal Info */}
      <div className="border rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Animal Information</h2>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div><span className="text-gray-500">Breed:</span> {animal.breed || '—'}</div>
          <div><span className="text-gray-500">Sex:</span> {animal.sex || '—'}</div>
          <div><span className="text-gray-500">DOB:</span> {animal.dob}</div>
          <div><span className="text-gray-500">Status:</span> {animal.currentStatus || (animal.onFarm ? 'On Farm' : 'Off Farm')}</div>
        </div>
      </div>

      {/* Sale Info */}
      {sale && (
        <div className="border rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Sale Information</h2>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">Date:</span> {sale.date}</div>
            <div><span className="text-gray-500">Price:</span> {'\u00A3'}{sale.price?.toFixed(2) || '—'}</div>
            <div><span className="text-gray-500">Weight:</span> {sale.weightKg ? `${sale.weightKg} kg` : '—'}</div>
            <div><span className="text-gray-500">{'\u00A3'}/kg:</span> {sale.pricePerKg?.toFixed(2) || '—'}</div>
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      <div className="border rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Cost Breakdown</h2>
        {costs.length === 0 ? (
          <p className="text-sm text-gray-400">No costs recorded</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-1">Date</th>
                <th className="pb-1">Description</th>
                <th className="pb-1">Category</th>
                <th className="pb-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{c.date}</td>
                  <td className="py-1">{c.description || '—'}</td>
                  <td className="py-1 text-gray-500">{c.sourceType}</td>
                  <td className="py-1 text-right">{'\u00A3'}{c.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Profit Summary */}
      <div className="border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Profit Summary</h2>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Revenue</p>
            <p className="font-bold">{'\u00A3'}{summary.revenue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Total Costs</p>
            <p className="font-bold">{'\u00A3'}{summary.totalCosts.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Profit</p>
            <p className={`font-bold ${summary.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {'\u00A3'}{summary.profit.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Margin</p>
            <p className={`font-bold ${(summary.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.margin !== null ? `${summary.margin}%` : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      <ReportContent />
    </Suspense>
  );
}
```

**Step 2: Commit**

```bash
cd apps/web && git add app/\(auth\)/cattle/report/page.tsx && git commit -m "feat: add printable per-head report page"
```

---

### Task 13: Deploy and verify

**Step 1: Build and fix any TypeScript errors**

```bash
cd apps/web && pnpm run build
```

Fix any build errors.

**Step 2: Deploy worker**

```bash
cd apps/worker && pnpm run deploy
```

**Step 3: Deploy frontend**

```bash
cd apps/web && pnpm run pages:deploy
```

**Step 4: Run E2E tests**

Start local servers and run the comprehensive test to verify nothing is broken. Then test the new features manually:
- Create a supply with "Allocate to" set to Whole Herd
- Select animals on cattle list → Log Cost
- Check Financials tab on cattle detail
- Check profitability section on financials page
- Test all export buttons

**Step 5: Final commit**

```bash
git add -A && git commit -m "feat: complete financial per-head insights and export feature"
```

---

## Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Schema tables | `schema.ts` |
| 2 | DB migration | Generated migration files |
| 3 | Cost allocation + profitability routes | `routes/costs.ts`, `index.ts` |
| 4 | XLSX export routes | `routes/export.ts`, `index.ts` |
| 5 | Per-head report endpoint | `routes/costs.ts` |
| 6 | API client methods | `api-client.ts` |
| 7 | Log Cost modal | `log-cost-modal.tsx`, `index.ts` |
| 8 | Cattle list changes | `cattle/page.tsx` |
| 9 | Supplies form dropdown | `supplies/page.tsx` |
| 10 | Cattle detail Financials tab | `cattle/detail/page.tsx` |
| 11 | Financials profitability section | `financials/page.tsx` |
| 12 | Printable report page | `cattle/report/page.tsx` |
| 13 | Deploy and verify | All |
