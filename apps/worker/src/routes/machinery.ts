/**
 * Machinery Routes - Asset register and event tracking
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc, sum } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const machinery = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// ==================== VALIDATION SCHEMAS ====================

const createMachinerySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['tractor', 'trailer', 'sprayer', 'harvester', 'ATV', 'other']),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().optional(),
  serialNumber: z.string().optional(),
  notes: z.string().optional(),
});

const updateMachinerySchema = createMachinerySchema.partial().extend({
  status: z.enum(['active', 'sold', 'scrapped']).optional(),
  soldDate: z.string().optional(),
  salePrice: z.number().optional(),
});

const createEventSchema = z.object({
  type: z.enum(['fuel', 'repair', 'service', 'other']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  cost: z.number().optional(),
  description: z.string().optional(),
  hoursOrMileage: z.number().optional(),
  fieldId: z.number().int().optional(),
  notes: z.string().optional(),
});

const updateEventSchema = createEventSchema.partial();

// ==================== ROUTES ====================

/**
 * GET /api/machinery
 * List all machines with total spend
 */
machinery.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  const machines = await db
    .select()
    .from(schema.machinery)
    .where(eq(schema.machinery.farmId, farmId))
    .orderBy(desc(schema.machinery.createdAt));

  // Calculate total spend per machine
  const spends = await db
    .select({
      machineryId: schema.machineryEvents.machineryId,
      totalSpend: sum(schema.machineryEvents.cost),
    })
    .from(schema.machineryEvents)
    .where(eq(schema.machineryEvents.farmId, farmId))
    .groupBy(schema.machineryEvents.machineryId);

  const spendMap = new Map(spends.map(s => [s.machineryId, Number(s.totalSpend) || 0]));

  return c.json({
    data: machines.map(m => ({ ...m, totalSpend: spendMap.get(m.id) || 0 })),
  });
});

/**
 * POST /api/machinery
 * Create a machine
 */
machinery.post('/', zValidator('json', createMachinerySchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const body = c.req.valid('json');

  const [created] = await db
    .insert(schema.machinery)
    .values({ ...body, farmId })
    .returning();

  return c.json({ data: created }, 201);
});

/**
 * GET /api/machinery/:id
 * Get machine detail
 */
machinery.get('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const id = Number(c.req.param('id'));

  const [machine] = await db
    .select()
    .from(schema.machinery)
    .where(and(eq(schema.machinery.id, id), eq(schema.machinery.farmId, farmId)));

  if (!machine) return c.json({ error: 'Not found' }, 404);

  const events = await db
    .select()
    .from(schema.machineryEvents)
    .where(and(eq(schema.machineryEvents.machineryId, id), eq(schema.machineryEvents.farmId, farmId)))
    .orderBy(desc(schema.machineryEvents.date));

  const totalSpend = events.reduce((sum, e) => sum + (e.cost || 0), 0);

  return c.json({ data: { ...machine, events, totalSpend } });
});

/**
 * PUT /api/machinery/:id
 * Update a machine
 */
machinery.put('/:id', zValidator('json', updateMachinerySchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');

  const [updated] = await db
    .update(schema.machinery)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(and(eq(schema.machinery.id, id), eq(schema.machinery.farmId, farmId)))
    .returning();

  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: updated });
});

/**
 * DELETE /api/machinery/:id
 */
machinery.delete('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const id = Number(c.req.param('id'));

  const [deleted] = await db
    .delete(schema.machinery)
    .where(and(eq(schema.machinery.id, id), eq(schema.machinery.farmId, farmId)))
    .returning();

  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

/**
 * GET /api/machinery/:id/events
 */
machinery.get('/:id/events', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const machineryId = Number(c.req.param('id'));

  const events = await db
    .select()
    .from(schema.machineryEvents)
    .where(and(
      eq(schema.machineryEvents.machineryId, machineryId),
      eq(schema.machineryEvents.farmId, farmId),
    ))
    .orderBy(desc(schema.machineryEvents.date));

  return c.json({ data: events });
});

/**
 * POST /api/machinery/:id/events
 */
machinery.post('/:id/events', zValidator('json', createEventSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const machineryId = Number(c.req.param('id'));
  const body = c.req.valid('json');

  // Verify machine belongs to farm
  const [machine] = await db
    .select({ id: schema.machinery.id })
    .from(schema.machinery)
    .where(and(eq(schema.machinery.id, machineryId), eq(schema.machinery.farmId, farmId)));

  if (!machine) return c.json({ error: 'Machine not found' }, 404);

  const [created] = await db
    .insert(schema.machineryEvents)
    .values({ ...body, machineryId, farmId })
    .returning();

  return c.json({ data: created }, 201);
});

/**
 * PUT /api/machinery/:id/events/:eid
 */
machinery.put('/:id/events/:eid', zValidator('json', updateEventSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const eid = Number(c.req.param('eid'));
  const body = c.req.valid('json');

  const [updated] = await db
    .update(schema.machineryEvents)
    .set(body)
    .where(and(eq(schema.machineryEvents.id, eid), eq(schema.machineryEvents.farmId, farmId)))
    .returning();

  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: updated });
});

/**
 * DELETE /api/machinery/:id/events/:eid
 */
machinery.delete('/:id/events/:eid', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const eid = Number(c.req.param('eid'));

  const [deleted] = await db
    .delete(schema.machineryEvents)
    .where(and(eq(schema.machineryEvents.id, eid), eq(schema.machineryEvents.farmId, farmId)))
    .returning();

  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

export default machinery;
