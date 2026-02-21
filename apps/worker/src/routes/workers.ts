/**
 * Workers Routes - Employee register and payroll tracking (manager/owner only)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc, sum, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const workers = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// Role guard — manager and owner only
workers.use('*', async (c, next) => {
  const user = c.get('user');
  if (!['manager', 'owner'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return next();
});

// ==================== VALIDATION SCHEMAS ====================

const createWorkerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().optional(),
  startDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateWorkerSchema = createWorkerSchema.partial().extend({
  endDate: z.string().optional(),
});

const createPayrollSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  amount: z.number().positive('Amount must be positive'),
  type: z.enum(['salary', 'bonus', 'overtime', 'other']),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().optional(),
});

const updatePayrollSchema = createPayrollSchema.partial();

// ==================== ROUTES ====================

/**
 * GET /api/workers
 */
workers.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  const allWorkers = await db
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.farmId, farmId))
    .orderBy(schema.workers.name);

  // Total payroll per worker
  const totals = await db
    .select({
      workerId: schema.payrollEvents.workerId,
      totalPaid: sum(schema.payrollEvents.amount),
    })
    .from(schema.payrollEvents)
    .where(eq(schema.payrollEvents.farmId, farmId))
    .groupBy(schema.payrollEvents.workerId);

  const totalMap = new Map(totals.map(t => [t.workerId, Number(t.totalPaid) || 0]));

  return c.json({
    data: allWorkers.map(w => ({ ...w, totalPaid: totalMap.get(w.id) || 0 })),
  });
});

/**
 * POST /api/workers
 */
workers.post('/', zValidator('json', createWorkerSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const body = c.req.valid('json');

  const [created] = await db
    .insert(schema.workers)
    .values({ ...body, farmId })
    .returning();

  return c.json({ data: created }, 201);
});

/**
 * PUT /api/workers/:id
 */
workers.put('/:id', zValidator('json', updateWorkerSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');

  const [updated] = await db
    .update(schema.workers)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(and(eq(schema.workers.id, id), eq(schema.workers.farmId, farmId)))
    .returning();

  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: updated });
});

/**
 * DELETE /api/workers/:id
 */
workers.delete('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const id = Number(c.req.param('id'));

  if (user.role !== 'owner') return c.json({ error: 'Forbidden — owner only' }, 403);

  const [deleted] = await db
    .delete(schema.workers)
    .where(and(eq(schema.workers.id, id), eq(schema.workers.farmId, farmId)))
    .returning();

  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

/**
 * GET /api/workers/:id/payroll
 */
workers.get('/:id/payroll', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const workerId = Number(c.req.param('id'));

  const events = await db
    .select()
    .from(schema.payrollEvents)
    .where(and(
      eq(schema.payrollEvents.workerId, workerId),
      eq(schema.payrollEvents.farmId, farmId),
    ))
    .orderBy(desc(schema.payrollEvents.date));

  return c.json({ data: events });
});

/**
 * POST /api/workers/:id/payroll
 */
workers.post('/:id/payroll', zValidator('json', createPayrollSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const workerId = Number(c.req.param('id'));
  const body = c.req.valid('json');

  const [worker] = await db
    .select({ id: schema.workers.id })
    .from(schema.workers)
    .where(and(eq(schema.workers.id, workerId), eq(schema.workers.farmId, farmId)));

  if (!worker) return c.json({ error: 'Worker not found' }, 404);

  const [created] = await db
    .insert(schema.payrollEvents)
    .values({ ...body, workerId, farmId })
    .returning();

  return c.json({ data: created }, 201);
});

/**
 * PUT /api/workers/:id/payroll/:pid
 */
workers.put('/:id/payroll/:pid', zValidator('json', updatePayrollSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const pid = Number(c.req.param('pid'));
  const body = c.req.valid('json');

  const [updated] = await db
    .update(schema.payrollEvents)
    .set(body)
    .where(and(eq(schema.payrollEvents.id, pid), eq(schema.payrollEvents.farmId, farmId)))
    .returning();

  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: updated });
});

/**
 * DELETE /api/workers/:id/payroll/:pid
 */
workers.delete('/:id/payroll/:pid', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const pid = Number(c.req.param('pid'));

  const [deleted] = await db
    .delete(schema.payrollEvents)
    .where(and(eq(schema.payrollEvents.id, pid), eq(schema.payrollEvents.farmId, farmId)))
    .returning();

  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

export default workers;
