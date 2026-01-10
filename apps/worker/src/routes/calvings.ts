/**
 * Calving Events Routes - CRUD operations for calving records
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env } from '../types';
import type { DrizzleD1Database } from '../db/client';

const calvings = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();

// ==================== VALIDATION SCHEMAS ====================

const createCalvingSchema = z.object({
  motherId: z.number().int().positive('Mother ID is required'),
  calfId: z.number().int().positive().optional(),
  calvingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  calvingYear: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  calvingMonth: z.string().optional(),
  calfSex: z.string().optional(),
  sire: z.string().optional(),
  daysSinceLastCalving: z.number().int().optional(),
  notes: z.string().optional(),
});

const updateCalvingSchema = createCalvingSchema.partial();

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate days since last calving for a mother
 */
async function calculateDaysSinceLastCalving(
  db: DrizzleD1Database,
  motherId: number,
  currentCalvingDate: string
): Promise<number | null> {
  const previousCalvings = await db
    .select()
    .from(schema.calvingEvents)
    .where(
      and(
        eq(schema.calvingEvents.motherId, motherId),
        lte(schema.calvingEvents.calvingDate, currentCalvingDate)
      )
    )
    .orderBy(desc(schema.calvingEvents.calvingDate))
    .limit(2); // Get current and previous

  if (previousCalvings.length < 2) {
    return null; // First calving
  }

  const previous = previousCalvings[1];
  const current = new Date(currentCalvingDate);
  const prev = new Date(previous.calvingDate);

  const diffTime = Math.abs(current.getTime() - prev.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Get month name from date
 */
function getMonthName(dateStr: string): string {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()];
}

// ==================== ROUTES ====================

/**
 * GET /api/calvings
 * List all calving events with optional filters
 */
calvings.get('/', async (c) => {
  const db = c.get('db');
  const { motherId, year, month, startDate, endDate } = c.req.query();

  try {
    let query = db.select().from(schema.calvingEvents);

    // Build filter conditions
    const conditions = [];

    if (motherId) {
      conditions.push(eq(schema.calvingEvents.motherId, parseInt(motherId)));
    }

    if (year) {
      conditions.push(eq(schema.calvingEvents.calvingYear, parseInt(year)));
    }

    if (month) {
      conditions.push(eq(schema.calvingEvents.calvingMonth, month));
    }

    if (startDate) {
      conditions.push(gte(schema.calvingEvents.calvingDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(schema.calvingEvents.calvingDate, endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query.orderBy(desc(schema.calvingEvents.calvingDate));

    // Fetch related mother and calf data
    const calvingsWithDetails = await Promise.all(
      results.map(async (calving) => {
        const mother = await db.query.cattle.findFirst({
          where: eq(schema.cattle.id, calving.motherId),
        });

        let calf = null;
        if (calving.calfId) {
          calf = await db.query.cattle.findFirst({
            where: eq(schema.cattle.id, calving.calfId),
          });
        }

        return {
          ...calving,
          mother,
          calf,
        };
      })
    );

    return c.json({
      data: calvingsWithDetails,
      count: results.length,
    });
  } catch (error) {
    console.error('Error fetching calvings:', error);
    return c.json({ error: 'Failed to fetch calving events' }, 500);
  }
});

/**
 * GET /api/calvings/:id
 * Get single calving event with full details
 */
calvings.get('/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const calving = await db.query.calvingEvents.findFirst({
      where: eq(schema.calvingEvents.id, id),
      with: {
        mother: true,
        calf: true,
        services: true, // Related service events
      },
    });

    if (!calving) {
      return c.json({ error: 'Calving event not found' }, 404);
    }

    return c.json({ data: calving });
  } catch (error) {
    console.error('Error fetching calving:', error);
    return c.json({ error: 'Failed to fetch calving event' }, 500);
  }
});

/**
 * POST /api/calvings
 * Create new calving event
 */
calvings.post('/', zValidator('json', createCalvingSchema), async (c) => {
  const db = c.get('db');
  const data = c.req.valid('json');

  try {
    // Verify mother exists
    const mother = await db.query.cattle.findFirst({
      where: eq(schema.cattle.id, data.motherId),
    });

    if (!mother) {
      return c.json({ error: 'Mother not found' }, 404);
    }

    // Verify calf exists if provided
    if (data.calfId) {
      const calf = await db.query.cattle.findFirst({
        where: eq(schema.cattle.id, data.calfId),
      });

      if (!calf) {
        return c.json({ error: 'Calf not found' }, 404);
      }
    }

    // Calculate days since last calving if not provided
    let daysSinceLastCalving = data.daysSinceLastCalving;
    if (!daysSinceLastCalving) {
      daysSinceLastCalving = await calculateDaysSinceLastCalving(
        db,
        data.motherId,
        data.calvingDate
      );
    }

    // Set calving month if not provided
    const calvingMonth = data.calvingMonth || getMonthName(data.calvingDate);

    // Create calving event
    const [newCalving] = await db
      .insert(schema.calvingEvents)
      .values({
        ...data,
        calvingMonth,
        daysSinceLastCalving,
      })
      .returning();

    // Try to link to service event if exists
    const possibleService = await db.query.serviceEvents.findFirst({
      where: and(
        eq(schema.serviceEvents.cowId, data.motherId),
        sql`${schema.serviceEvents.successful} IS NULL`
      ),
      orderBy: desc(schema.serviceEvents.serviceDate),
    });

    if (possibleService) {
      // Update service event to mark as successful and link to calving
      await db
        .update(schema.serviceEvents)
        .set({
          successful: true,
          calvingEventId: newCalving.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.serviceEvents.id, possibleService.id));
    }

    return c.json({ data: newCalving }, 201);
  } catch (error) {
    console.error('Error creating calving:', error);
    return c.json({ error: 'Failed to create calving event' }, 500);
  }
});

/**
 * PUT /api/calvings/:id
 * Update existing calving event
 */
calvings.put('/:id', zValidator('json', updateCalvingSchema), async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    // Verify calving exists
    const existing = await db.query.calvingEvents.findFirst({
      where: eq(schema.calvingEvents.id, id),
    });

    if (!existing) {
      return c.json({ error: 'Calving event not found' }, 404);
    }

    // Verify mother exists if being updated
    if (data.motherId) {
      const mother = await db.query.cattle.findFirst({
        where: eq(schema.cattle.id, data.motherId),
      });

      if (!mother) {
        return c.json({ error: 'Mother not found' }, 404);
      }
    }

    // Verify calf exists if being updated
    if (data.calfId) {
      const calf = await db.query.cattle.findFirst({
        where: eq(schema.cattle.id, data.calfId),
      });

      if (!calf) {
        return c.json({ error: 'Calf not found' }, 404);
      }
    }

    // Recalculate days since last calving if date changed
    let updateData = { ...data };
    if (data.calvingDate && data.calvingDate !== existing.calvingDate) {
      const daysSinceLastCalving = await calculateDaysSinceLastCalving(
        db,
        data.motherId || existing.motherId,
        data.calvingDate
      );
      updateData.daysSinceLastCalving = daysSinceLastCalving || undefined;
      updateData.calvingMonth = getMonthName(data.calvingDate);
    }

    // Update calving event
    const [updated] = await db
      .update(schema.calvingEvents)
      .set({
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.calvingEvents.id, id))
      .returning();

    return c.json({ data: updated });
  } catch (error) {
    console.error('Error updating calving:', error);
    return c.json({ error: 'Failed to update calving event' }, 500);
  }
});

/**
 * DELETE /api/calvings/:id
 * Delete calving event (hard delete)
 */
calvings.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    // Unlink any service events first
    await db
      .update(schema.serviceEvents)
      .set({
        calvingEventId: null,
        successful: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.serviceEvents.calvingEventId, id));

    // Delete the calving event
    const [deleted] = await db
      .delete(schema.calvingEvents)
      .where(eq(schema.calvingEvents.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Calving event not found' }, 404);
    }

    return c.json({ data: deleted });
  } catch (error) {
    console.error('Error deleting calving:', error);
    return c.json({ error: 'Failed to delete calving event' }, 500);
  }
});

export default calvings;
