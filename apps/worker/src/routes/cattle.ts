/**
 * Cattle Routes - CRUD operations for cattle records
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, like, or, and } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env } from '../types';
import type { DrizzleD1Database } from '../db/client';

const cattle = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();

// ==================== VALIDATION SCHEMAS ====================

const createCattleSchema = z.object({
  tagNo: z.string().min(1, 'Tag number is required'),
  managementTag: z.string().optional(),
  yob: z.number().int().min(1900).max(new Date().getFullYear()),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  breed: z.string().optional(),
  sex: z.string().optional(),
  size: z.number().int().min(1).max(4).optional(),
  damTag: z.number().int().optional(),
  notes: z.string().optional(),
});

const updateCattleSchema = createCattleSchema.partial();

// ==================== ROUTES ====================

/**
 * GET /api/cattle
 * List all cattle with optional filters
 */
cattle.get('/', async (c) => {
  const db = c.get('db');
  const { search, breed, sex, onFarm } = c.req.query();

  try {
    let query = db.select().from(schema.cattle);

    // Apply filters
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(schema.cattle.tagNo, `%${search}%`),
          like(schema.cattle.managementTag, `%${search}%`)
        )
      );
    }

    if (breed) {
      conditions.push(eq(schema.cattle.breed, breed));
    }

    if (sex) {
      conditions.push(eq(schema.cattle.sex, sex));
    }

    if (onFarm !== undefined) {
      conditions.push(eq(schema.cattle.onFarm, onFarm === 'true'));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query.orderBy(schema.cattle.managementTag);

    return c.json({
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error fetching cattle:', error);
    return c.json({ error: 'Failed to fetch cattle' }, 500);
  }
});

/**
 * GET /api/cattle/:id
 * Get single cattle with all relationships
 */
cattle.get('/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const cattleRecord = await db.query.cattle.findFirst({
      where: eq(schema.cattle.id, id),
      with: {
        dam: true,
        offspring: true,
        calvings: {
          with: {
            calf: true,
          },
        },
        services: true,
        sale: true,
        healthEvents: true,
      },
    });

    if (!cattleRecord) {
      return c.json({ error: 'Cattle not found' }, 404);
    }

    return c.json({ data: cattleRecord });
  } catch (error) {
    console.error('Error fetching cattle:', error);
    return c.json({ error: 'Failed to fetch cattle' }, 500);
  }
});

/**
 * POST /api/cattle
 * Create new cattle record
 */
cattle.post('/', zValidator('json', createCattleSchema), async (c) => {
  const db = c.get('db');
  const data = c.req.valid('json');

  try {
    // Check for duplicate tag_no
    const existing = await db.query.cattle.findFirst({
      where: eq(schema.cattle.tagNo, data.tagNo),
    });

    if (existing) {
      return c.json({ error: 'Tag number already exists' }, 400);
    }

    // Create cattle record
    const [newCattle] = await db.insert(schema.cattle).values({
      ...data,
      onFarm: true,
      currentStatus: 'Active',
    }).returning();

    return c.json({ data: newCattle }, 201);
  } catch (error) {
    console.error('Error creating cattle:', error);
    return c.json({ error: 'Failed to create cattle' }, 500);
  }
});

/**
 * PUT /api/cattle/:id
 * Update existing cattle record
 */
cattle.put('/:id', zValidator('json', updateCattleSchema), async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const [updated] = await db.update(schema.cattle)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.cattle.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: 'Cattle not found' }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error('Error updating cattle:', error);
    return c.json({ error: 'Failed to update cattle' }, 500);
  }
});

/**
 * DELETE /api/cattle/:id
 * Soft delete cattle (set on_farm = false)
 */
cattle.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const [deleted] = await db.update(schema.cattle)
      .set({
        onFarm: false,
        currentStatus: 'Deleted',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.cattle.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Cattle not found' }, 404);
    }

    return c.json({ data: deleted });
  } catch (error) {
    console.error('Error deleting cattle:', error);
    return c.json({ error: 'Failed to delete cattle' }, 500);
  }
});

export default cattle;
