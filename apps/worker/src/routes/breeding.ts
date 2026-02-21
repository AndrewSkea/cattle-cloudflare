/**
 * Breeding Routes - Breeding management, service events, and calving predictions
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env } from '../types';
import type { AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const breeding = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// ==================== VALIDATION SCHEMAS ====================

const createServiceSchema = z.object({
  cowId: z.number().int().positive('Cow ID is required'),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  sire: z.string().optional(),
  notes: z.string().optional(),
});

const updateServiceSchema = createServiceSchema.partial().omit({ cowId: true });

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate expected calving date (service date + 283 days)
 */
function calculateExpectedCalvingDate(serviceDate: string): string {
  const date = new Date(serviceDate);
  date.setDate(date.getDate() + 283); // Gestation period for cattle
  return date.toISOString().split('T')[0];
}

/**
 * Get calving period (e.g., "Spring 2024", "Autumn 2024")
 */
function getCalvingPeriod(expectedDate: string): string {
  const date = new Date(expectedDate);
  const month = date.getMonth();
  const year = date.getFullYear();

  let season: string;
  if (month >= 2 && month <= 4) {
    season = 'Spring';
  } else if (month >= 5 && month <= 7) {
    season = 'Summer';
  } else if (month >= 8 && month <= 10) {
    season = 'Autumn';
  } else {
    season = 'Winter';
  }

  return `${season} ${year}`;
}

/**
 * Calculate days until expected calving
 */
function daysUntilCalving(expectedDate: string): number {
  const expected = new Date(expectedDate);
  const now = new Date();
  const diffTime = expected.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// ==================== ROUTES ====================

/**
 * GET /api/breeding/calendar
 * Breeding calendar with expected calving dates
 */
breeding.get('/calendar', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { startDate, endDate, status } = c.req.query();

  try {
    let query = db.select().from(schema.serviceEvents);

    // Build filter conditions
    const conditions = [];

    // Always scope to the user's active farm
    conditions.push(eq(schema.serviceEvents.farmId, user.activeFarmId!));

    if (startDate) {
      conditions.push(gte(schema.serviceEvents.expectedCalvingDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(schema.serviceEvents.expectedCalvingDate, endDate));
    }

    // Filter by status (pending/successful/failed)
    if (status === 'pending') {
      conditions.push(sql`${schema.serviceEvents.successful} IS NULL`);
    } else if (status === 'successful') {
      conditions.push(eq(schema.serviceEvents.successful, true));
    } else if (status === 'failed') {
      conditions.push(eq(schema.serviceEvents.successful, false));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const services = await query.orderBy(schema.serviceEvents.expectedCalvingDate);

    // Fetch cow details and add calendar info
    const calendarEvents = await Promise.all(
      services.map(async (service) => {
        const cow = await db.query.cattle.findFirst({
          where: eq(schema.cattle.id, service.cowId),
        });

        let calving = null;
        if (service.calvingEventId) {
          calving = await db.query.calvingEvents.findFirst({
            where: eq(schema.calvingEvents.id, service.calvingEventId),
          });
        }

        const daysUntil = service.expectedCalvingDate
          ? daysUntilCalving(service.expectedCalvingDate)
          : null;

        return {
          ...service,
          cow,
          calving,
          daysUntilCalving: daysUntil,
          isOverdue: daysUntil !== null && daysUntil < 0,
          isDueSoon: daysUntil !== null && daysUntil >= 0 && daysUntil <= 30,
        };
      })
    );

    // Group by calving period
    const byPeriod = calendarEvents.reduce((acc, event) => {
      if (event.expectedCalvingPeriod) {
        if (!acc[event.expectedCalvingPeriod]) {
          acc[event.expectedCalvingPeriod] = [];
        }
        acc[event.expectedCalvingPeriod].push(event);
      }
      return acc;
    }, {} as Record<string, typeof calendarEvents>);

    return c.json({
      data: {
        events: calendarEvents,
        byPeriod,
        count: calendarEvents.length,
      },
    });
  } catch (error) {
    console.error('Error fetching breeding calendar:', error);
    return c.json({ error: 'Failed to fetch breeding calendar' }, 500);
  }
});

/**
 * GET /api/breeding/predictions
 * Calving predictions from service events (service_date + 283 days)
 */
breeding.get('/predictions', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  try {
    // Get all pending services (not yet calved)
    const pendingServices = await db
      .select()
      .from(schema.serviceEvents)
      .where(and(sql`${schema.serviceEvents.successful} IS NULL`, eq(schema.serviceEvents.farmId, user.activeFarmId!)))
      .orderBy(schema.serviceEvents.expectedCalvingDate);

    // Fetch cow details and calculate prediction info
    const predictions = await Promise.all(
      pendingServices.map(async (service) => {
        const cow = await db.query.cattle.findFirst({
          where: eq(schema.cattle.id, service.cowId),
        });

        // Get cow's calving history
        const calvingHistory = await db
          .select()
          .from(schema.calvingEvents)
          .where(eq(schema.calvingEvents.motherId, service.cowId))
          .orderBy(desc(schema.calvingEvents.calvingDate));

        const daysUntil = service.expectedCalvingDate
          ? daysUntilCalving(service.expectedCalvingDate)
          : null;

        // Calculate confidence based on historical accuracy
        const lastCalving = calvingHistory[0];
        let confidence = 'Medium';

        if (calvingHistory.length >= 3) {
          confidence = 'High'; // Experienced cow with good history
        } else if (calvingHistory.length === 0) {
          confidence = 'Low'; // First-time mother
        }

        return {
          service,
          cow,
          prediction: {
            expectedDate: service.expectedCalvingDate,
            expectedPeriod: service.expectedCalvingPeriod,
            daysUntil,
            isOverdue: daysUntil !== null && daysUntil < 0,
            isDueSoon: daysUntil !== null && daysUntil >= 0 && daysUntil <= 30,
            confidence,
          },
          history: {
            totalCalvings: calvingHistory.length,
            lastCalvingDate: lastCalving?.calvingDate,
            avgInterval: calvingHistory.length > 0
              ? calvingHistory.reduce((sum, c) => sum + (c.daysSinceLastCalving || 0), 0) / calvingHistory.length
              : null,
          },
        };
      })
    );

    // Group predictions by time period
    const dueSoon = predictions.filter(p => p.prediction.isDueSoon);
    const overdue = predictions.filter(p => p.prediction.isOverdue);
    const upcoming = predictions.filter(
      p => !p.prediction.isDueSoon && !p.prediction.isOverdue && p.prediction.daysUntil && p.prediction.daysUntil <= 90
    );

    return c.json({
      data: {
        all: predictions,
        dueSoon,
        overdue,
        upcoming,
        counts: {
          total: predictions.length,
          dueSoon: dueSoon.length,
          overdue: overdue.length,
          upcoming: upcoming.length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching calving predictions:', error);
    return c.json({ error: 'Failed to fetch calving predictions' }, 500);
  }
});

/**
 * GET /api/breeding/performance
 * Breeding success rates and metrics
 */
breeding.get('/performance', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { year } = c.req.query();

  try {
    let query = db.select().from(schema.serviceEvents);

    const conditions = [];

    // Always scope to the user's active farm
    conditions.push(eq(schema.serviceEvents.farmId, user.activeFarmId!));

    if (year) {
      const yearNum = parseInt(year);
      conditions.push(gte(schema.serviceEvents.serviceDate, `${yearNum}-01-01`));
      conditions.push(lte(schema.serviceEvents.serviceDate, `${yearNum}-12-31`));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const allServices = await query;

    // Calculate success rate
    const successful = allServices.filter(s => s.successful === true).length;
    const failed = allServices.filter(s => s.successful === false).length;
    const pending = allServices.filter(s => s.successful === null).length;

    const successRate = allServices.length > 0
      ? (successful / (successful + failed)) * 100
      : 0;

    // Services by sire
    const bySire = allServices.reduce((acc, service) => {
      const sire = service.sire || 'Unknown';
      if (!acc[sire]) {
        acc[sire] = { total: 0, successful: 0, failed: 0, pending: 0 };
      }
      acc[sire].total++;
      if (service.successful === true) acc[sire].successful++;
      else if (service.successful === false) acc[sire].failed++;
      else acc[sire].pending++;
      return acc;
    }, {} as Record<string, { total: number; successful: number; failed: number; pending: number }>);

    // Calculate sire success rates
    const sirePerformance = Object.entries(bySire).map(([sire, stats]) => ({
      sire,
      ...stats,
      successRate: stats.successful + stats.failed > 0
        ? (stats.successful / (stats.successful + stats.failed)) * 100
        : 0,
    })).sort((a, b) => b.successRate - a.successRate);

    // Services by month
    const servicesByMonth: Record<string, number> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    months.forEach(month => {
      servicesByMonth[month] = 0;
    });

    allServices.forEach(service => {
      const serviceDate = new Date(service.serviceDate);
      const month = months[serviceDate.getMonth()];
      servicesByMonth[month]++;
    });

    // Expected calvings by period
    const calvingsByPeriod = allServices.reduce((acc, service) => {
      if (service.expectedCalvingPeriod) {
        acc[service.expectedCalvingPeriod] = (acc[service.expectedCalvingPeriod] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return c.json({
      data: {
        totalServices: allServices.length,
        successful,
        failed,
        pending,
        successRate: parseFloat(successRate.toFixed(2)),
        sirePerformance,
        servicesByMonth,
        expectedCalvingsByPeriod: calvingsByPeriod,
      },
    });
  } catch (error) {
    console.error('Error fetching breeding performance:', error);
    return c.json({ error: 'Failed to fetch breeding performance' }, 500);
  }
});

/**
 * GET /api/breeding/services
 * List all service events
 */
breeding.get('/services', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { cowId, startDate, endDate } = c.req.query();

  try {
    let query = db.select().from(schema.serviceEvents);

    const conditions = [];

    // Always scope to the user's active farm
    conditions.push(eq(schema.serviceEvents.farmId, user.activeFarmId!));

    if (cowId) {
      conditions.push(eq(schema.serviceEvents.cowId, parseInt(cowId)));
    }

    if (startDate) {
      conditions.push(gte(schema.serviceEvents.serviceDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(schema.serviceEvents.serviceDate, endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const services = await query.orderBy(desc(schema.serviceEvents.serviceDate));

    // Fetch cow details
    const servicesWithDetails = await Promise.all(
      services.map(async (service) => {
        const cow = await db.query.cattle.findFirst({
          where: eq(schema.cattle.id, service.cowId),
        });

        let calving = null;
        if (service.calvingEventId) {
          calving = await db.query.calvingEvents.findFirst({
            where: eq(schema.calvingEvents.id, service.calvingEventId),
          });
        }

        return {
          ...service,
          cow,
          calving,
        };
      })
    );

    return c.json({
      data: servicesWithDetails,
      count: services.length,
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    return c.json({ error: 'Failed to fetch service events' }, 500);
  }
});

/**
 * POST /api/breeding/services
 * Create service event
 */
breeding.post('/services', zValidator('json', createServiceSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const data = c.req.valid('json');

  try {
    // Verify cow exists and is female
    const cow = await db.query.cattle.findFirst({
      where: eq(schema.cattle.id, data.cowId),
    });

    if (!cow) {
      return c.json({ error: 'Cow not found' }, 404);
    }

    if (cow.sex !== 'fem') {
      return c.json({ error: 'Only female cattle can have service events' }, 400);
    }

    // Calculate expected calving date and period
    const expectedCalvingDate = calculateExpectedCalvingDate(data.serviceDate);
    const expectedCalvingPeriod = getCalvingPeriod(expectedCalvingDate);

    // Create service event
    const [newService] = await db
      .insert(schema.serviceEvents)
      .values({
        ...data,
        farmId: user.activeFarmId!,
        expectedCalvingDate,
        expectedCalvingPeriod,
      })
      .returning();

    return c.json({ data: newService }, 201);
  } catch (error) {
    console.error('Error creating service:', error);
    return c.json({ error: 'Failed to create service event' }, 500);
  }
});

/**
 * PUT /api/breeding/services/:id
 * Update service event
 */
breeding.put('/services/:id', zValidator('json', updateServiceSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    // Verify service exists
    const existing = await db.query.serviceEvents.findFirst({
      where: eq(schema.serviceEvents.id, id),
    });

    if (!existing) {
      return c.json({ error: 'Service event not found' }, 404);
    }

    // Recalculate expected calving if service date changed
    let updateData = { ...data };
    if (data.serviceDate && data.serviceDate !== existing.serviceDate) {
      updateData.expectedCalvingDate = calculateExpectedCalvingDate(data.serviceDate);
      updateData.expectedCalvingPeriod = getCalvingPeriod(updateData.expectedCalvingDate);
    }

    // Update service event
    const [updated] = await db
      .update(schema.serviceEvents)
      .set({
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(schema.serviceEvents.id, id), eq(schema.serviceEvents.farmId, user.activeFarmId!)))
      .returning();

    return c.json({ data: updated });
  } catch (error) {
    console.error('Error updating service:', error);
    return c.json({ error: 'Failed to update service event' }, 500);
  }
});

/**
 * DELETE /api/breeding/services/:id
 * Delete service event
 */
breeding.delete('/services/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const [deleted] = await db
      .delete(schema.serviceEvents)
      .where(and(eq(schema.serviceEvents.id, id), eq(schema.serviceEvents.farmId, user.activeFarmId!)))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Service event not found' }, 404);
    }

    return c.json({ data: deleted });
  } catch (error) {
    console.error('Error deleting service:', error);
    return c.json({ error: 'Failed to delete service event' }, 500);
  }
});

export default breeding;
