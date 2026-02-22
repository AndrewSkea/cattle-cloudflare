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

  // Create individual cost allocation records (batch insert, max 100 at a time)
  const allocations = cattleIds.map(cattleId => ({
    farmId,
    sourceType: body.sourceType,
    sourceId: body.sourceId ?? null,
    cattleId,
    amount: perHead,
    date: body.date,
    description: body.description,
  }));

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
    const month = alloc.date.substring(0, 7);
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

/**
 * GET /api/costs/report/:id
 * Per-head financial report data for one animal
 */
costs.get('/report/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const cattleId = Number(c.req.param('id'));

  const [animal] = await db.select()
    .from(schema.cattle)
    .where(and(eq(schema.cattle.id, cattleId), eq(schema.cattle.farmId, farmId)));

  if (!animal) return c.json({ error: 'Animal not found' }, 404);

  const [sale] = await db.select()
    .from(schema.saleEvents)
    .where(and(eq(schema.saleEvents.animalId, cattleId), eq(schema.saleEvents.farmId, farmId)));

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

export default costs;
