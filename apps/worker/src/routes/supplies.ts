/**
 * Supplies Routes - Purchase event log for fertiliser, seed, medicine, vaccine, etc.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const supplies = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// ==================== VALIDATION SCHEMAS ====================

const createSupplySchema = z.object({
  category: z.enum(['fertiliser', 'seed', 'medicine', 'vaccine', 'fuel', 'other']),
  name: z.string().min(1, 'Name is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitCost: z.number().optional(),
  totalCost: z.number().nonnegative('Total cost must be non-negative'),
  supplier: z.string().optional(),
  fieldId: z.number().int().optional(),
  notes: z.string().optional(),
});

const updateSupplySchema = createSupplySchema.partial();

// ==================== ROUTES ====================

/**
 * GET /api/supplies
 * List purchases, optionally filtered by category or fieldId
 */
supplies.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const category = c.req.query('category');
  const fieldId = c.req.query('fieldId');

  let query = db
    .select()
    .from(schema.supplyPurchases)
    .where(eq(schema.supplyPurchases.farmId, farmId))
    .$dynamic();

  if (category) {
    query = query.where(and(
      eq(schema.supplyPurchases.farmId, farmId),
      eq(schema.supplyPurchases.category, category),
    ));
  }

  if (fieldId) {
    query = query.where(and(
      eq(schema.supplyPurchases.farmId, farmId),
      eq(schema.supplyPurchases.fieldId, Number(fieldId)),
    ));
  }

  const results = await query.orderBy(desc(schema.supplyPurchases.date));
  return c.json({ data: results });
});

/**
 * POST /api/supplies
 */
supplies.post('/', zValidator('json', createSupplySchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const body = c.req.valid('json');

  const [created] = await db
    .insert(schema.supplyPurchases)
    .values({ ...body, farmId })
    .returning();

  return c.json({ data: created }, 201);
});

/**
 * PUT /api/supplies/:id
 */
supplies.put('/:id', zValidator('json', updateSupplySchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');

  const [updated] = await db
    .update(schema.supplyPurchases)
    .set(body)
    .where(and(eq(schema.supplyPurchases.id, id), eq(schema.supplyPurchases.farmId, farmId)))
    .returning();

  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: updated });
});

/**
 * DELETE /api/supplies/:id
 */
supplies.delete('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const id = Number(c.req.param('id'));

  const [deleted] = await db
    .delete(schema.supplyPurchases)
    .where(and(eq(schema.supplyPurchases.id, id), eq(schema.supplyPurchases.farmId, farmId)))
    .returning();

  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

export default supplies;
