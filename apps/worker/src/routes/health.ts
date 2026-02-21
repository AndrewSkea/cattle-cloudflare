/**
 * Health Events Routes - Animal health tracking and history
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const health = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// ==================== VALIDATION SCHEMAS ====================

const createHealthEventSchema = z.object({
  animalId: z.number().int().positive('Animal ID is required'),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  eventType: z.string().min(1, 'Event type is required'),
  description: z.string().optional(),
  numericValue: z.number().optional(),
});

const updateHealthEventSchema = createHealthEventSchema.partial().omit({ animalId: true });

// ==================== ROUTES ====================

/**
 * GET /api/health
 * List all health events with optional filters
 */
health.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { animalId, eventType, startDate, endDate } = c.req.query();

  try {
    let query = db.select().from(schema.healthEvents);

    // Build filter conditions
    const conditions = [];

    // Always filter by farm
    conditions.push(eq(schema.healthEvents.farmId, user.activeFarmId!));

    if (animalId) {
      conditions.push(eq(schema.healthEvents.animalId, parseInt(animalId)));
    }

    if (eventType) {
      conditions.push(eq(schema.healthEvents.eventType, eventType));
    }

    if (startDate) {
      conditions.push(gte(schema.healthEvents.eventDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(schema.healthEvents.eventDate, endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query.orderBy(desc(schema.healthEvents.eventDate));

    // Fetch related animal data
    const healthEventsWithDetails = await Promise.all(
      results.map(async (event) => {
        const animal = await db.query.cattle.findFirst({
          where: eq(schema.cattle.id, event.animalId),
        });

        return {
          ...event,
          animal,
        };
      })
    );

    return c.json({
      data: healthEventsWithDetails,
      count: results.length,
    });
  } catch (error) {
    console.error('Error fetching health events:', error);
    return c.json({ error: 'Failed to fetch health events' }, 500);
  }
});

/**
 * GET /api/health/animal/:id
 * Get health history for specific animal
 */
health.get('/animal/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    // Verify animal exists
    const animal = await db.query.cattle.findFirst({
      where: eq(schema.cattle.id, id),
    });

    if (!animal) {
      return c.json({ error: 'Animal not found' }, 404);
    }

    // Get all health events for this animal
    const healthHistory = await db
      .select()
      .from(schema.healthEvents)
      .where(
        and(
          eq(schema.healthEvents.animalId, id),
          eq(schema.healthEvents.farmId, user.activeFarmId!)
        )
      )
      .orderBy(desc(schema.healthEvents.eventDate));

    // Group events by type
    const eventsByType = healthHistory.reduce((acc, event) => {
      const type = event.eventType || 'Other';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(event);
      return acc;
    }, {} as Record<string, typeof healthHistory>);

    // Get event type counts
    const eventTypeCounts = Object.entries(eventsByType).map(([type, events]) => ({
      type,
      count: events.length,
      lastDate: events[0]?.eventDate,
    }));

    // Calculate health metrics
    const totalEvents = healthHistory.length;
    const firstEvent = healthHistory[healthHistory.length - 1];
    const lastEvent = healthHistory[0];

    return c.json({
      data: {
        animal,
        healthHistory,
        eventsByType,
        summary: {
          totalEvents,
          eventTypes: eventTypeCounts,
          firstEventDate: firstEvent?.eventDate,
          lastEventDate: lastEvent?.eventDate,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching animal health history:', error);
    return c.json({ error: 'Failed to fetch animal health history' }, 500);
  }
});

/**
 * GET /api/health/types
 * Get all unique health event types
 */
health.get('/types', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  try {
    const eventTypes = await db
      .selectDistinct({ eventType: schema.healthEvents.eventType })
      .from(schema.healthEvents)
      .where(eq(schema.healthEvents.farmId, user.activeFarmId!))
      .orderBy(schema.healthEvents.eventType);

    const types = eventTypes.map(e => e.eventType).filter(t => t !== null);

    return c.json({
      data: types,
      count: types.length,
    });
  } catch (error) {
    console.error('Error fetching event types:', error);
    return c.json({ error: 'Failed to fetch event types' }, 500);
  }
});

/**
 * GET /api/health/summary
 * Get health event summary statistics
 */
health.get('/summary', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { year } = c.req.query();

  try {
    let query = db.select().from(schema.healthEvents);

    const conditions = [eq(schema.healthEvents.farmId, user.activeFarmId!)];

    if (year) {
      const yearNum = parseInt(year);
      conditions.push(gte(schema.healthEvents.eventDate, `${yearNum}-01-01`));
      conditions.push(lte(schema.healthEvents.eventDate, `${yearNum}-12-31`));
    }

    query = query.where(and(...conditions));

    const allEvents = await query;

    // Group by event type
    const eventsByType = allEvents.reduce((acc, event) => {
      const type = event.eventType || 'Other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count animals with health events
    const uniqueAnimals = new Set(allEvents.map(e => e.animalId)).size;

    // Events by month (current year or specified year)
    const eventsByMonth: Record<string, number> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    months.forEach(month => {
      eventsByMonth[month] = 0;
    });

    allEvents.forEach(event => {
      const eventDate = new Date(event.eventDate);
      const month = months[eventDate.getMonth()];
      eventsByMonth[month]++;
    });

    // Most common event types
    const sortedTypes = Object.entries(eventsByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    return c.json({
      data: {
        totalEvents: allEvents.length,
        uniqueAnimals,
        eventsByType,
        eventsByMonth,
        topEventTypes: sortedTypes,
      },
    });
  } catch (error) {
    console.error('Error fetching health summary:', error);
    return c.json({ error: 'Failed to fetch health summary' }, 500);
  }
});

/**
 * GET /api/health/animal/:id/weights
 * Get weight history for a specific animal (sorted by date)
 */
health.get('/animal/:id/weights', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const weights = await db
      .select()
      .from(schema.healthEvents)
      .where(
        and(
          eq(schema.healthEvents.animalId, id),
          eq(schema.healthEvents.eventType, 'Weight'),
          eq(schema.healthEvents.farmId, user.activeFarmId!)
        )
      )
      .orderBy(schema.healthEvents.eventDate);

    return c.json({
      data: weights.map((w) => ({
        id: w.id,
        date: w.eventDate,
        weight: w.numericValue,
        notes: w.description,
      })),
      count: weights.length,
    });
  } catch (error) {
    console.error('Error fetching weight history:', error);
    return c.json({ error: 'Failed to fetch weight history' }, 500);
  }
});

/**
 * GET /api/health/:id
 * Get single health event with full details
 */
health.get('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const healthEvent = await db.query.healthEvents.findFirst({
      where: and(
        eq(schema.healthEvents.id, id),
        eq(schema.healthEvents.farmId, user.activeFarmId!)
      ),
      with: {
        animal: true,
      },
    });

    if (!healthEvent) {
      return c.json({ error: 'Health event not found' }, 404);
    }

    return c.json({ data: healthEvent });
  } catch (error) {
    console.error('Error fetching health event:', error);
    return c.json({ error: 'Failed to fetch health event' }, 500);
  }
});

/**
 * POST /api/health
 * Create health event
 */
health.post('/', zValidator('json', createHealthEventSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const data = c.req.valid('json');

  try {
    // Verify animal exists
    const animal = await db.query.cattle.findFirst({
      where: eq(schema.cattle.id, data.animalId),
    });

    if (!animal) {
      return c.json({ error: 'Animal not found' }, 404);
    }

    // Create health event
    const [newHealthEvent] = await db
      .insert(schema.healthEvents)
      .values({
        ...data,
        farmId: user.activeFarmId!,
      })
      .returning();

    return c.json({ data: newHealthEvent }, 201);
  } catch (error) {
    console.error('Error creating health event:', error);
    return c.json({ error: 'Failed to create health event' }, 500);
  }
});

/**
 * PUT /api/health/:id
 * Update health event
 */
health.put('/:id', zValidator('json', updateHealthEventSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    // Verify health event exists
    const existing = await db.query.healthEvents.findFirst({
      where: and(
        eq(schema.healthEvents.id, id),
        eq(schema.healthEvents.farmId, user.activeFarmId!)
      ),
    });

    if (!existing) {
      return c.json({ error: 'Health event not found' }, 404);
    }

    // Update health event
    const [updated] = await db
      .update(schema.healthEvents)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.healthEvents.id, id),
          eq(schema.healthEvents.farmId, user.activeFarmId!)
        )
      )
      .returning();

    return c.json({ data: updated });
  } catch (error) {
    console.error('Error updating health event:', error);
    return c.json({ error: 'Failed to update health event' }, 500);
  }
});

/**
 * DELETE /api/health/:id
 * Delete health event
 */
health.delete('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const [deleted] = await db
      .delete(schema.healthEvents)
      .where(
        and(
          eq(schema.healthEvents.id, id),
          eq(schema.healthEvents.farmId, user.activeFarmId!)
        )
      )
      .returning();

    if (!deleted) {
      return c.json({ error: 'Health event not found' }, 404);
    }

    return c.json({ data: deleted });
  } catch (error) {
    console.error('Error deleting health event:', error);
    return c.json({ error: 'Failed to delete health event' }, 500);
  }
});

export default health;
