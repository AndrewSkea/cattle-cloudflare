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

// ==================== HELPER FUNCTIONS ====================

/**
 * Convert size integer to human-readable label
 * 1 = Large, 2 = Med-Large, 3 = Med-Small, 4 = Small
 */
function getSizeLabel(size: number | null): string | null {
  if (size === null) return null;
  const sizeMap: Record<number, string> = {
    1: 'Large',
    2: 'Med-Large',
    3: 'Med-Small',
    4: 'Small',
  };
  return sizeMap[size] || null;
}

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
 * List all cattle with optional filters and sorting
 */
cattle.get('/', async (c) => {
  const db = c.get('db');
  const { search, breed, sex, onFarm, sortBy, order } = c.req.query();

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

    // Apply sorting
    let results = await query;

    // Sort in memory if sortBy is specified
    if (sortBy) {
      results.sort((a, b) => {
        let aVal: any = a[sortBy as keyof typeof a];
        let bVal: any = b[sortBy as keyof typeof b];

        // Handle null values
        if (aVal === null) return 1;
        if (bVal === null) return -1;

        // For size, reverse the comparison (1=large, 4=small)
        if (sortBy === 'size') {
          const comparison = (aVal as number) - (bVal as number);
          return order === 'desc' ? comparison : -comparison;
        }

        // For other fields
        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        return order === 'desc' ? -comparison : comparison;
      });
    } else {
      // Default sort by management tag
      results.sort((a, b) => {
        const aTag = a.managementTag || a.tagNo;
        const bTag = b.managementTag || b.tagNo;
        return aTag.localeCompare(bTag);
      });
    }

    // Add size labels to results
    const resultsWithLabels = results.map(cattle => ({
      ...cattle,
      sizeLabel: getSizeLabel(cattle.size),
    }));

    return c.json({
      data: resultsWithLabels,
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

    // Add size label
    const recordWithLabel = {
      ...cattleRecord,
      sizeLabel: getSizeLabel(cattleRecord.size),
    };

    return c.json({ data: recordWithLabel });
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
