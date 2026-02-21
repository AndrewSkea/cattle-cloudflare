/**
 * Sales Events Routes - Sales and death event management
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const sales = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// ==================== VALIDATION SCHEMAS ====================

const createSaleSchema = z.object({
  animalId: z.number().int().positive('Animal ID is required'),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  eventType: z.enum(['Sold', 'Died']),
  ageMonths: z.number().int().optional(),
  weightKg: z.number().positive().optional(),
  salePrice: z.number().positive().optional(),
  kgPerMonth: z.number().positive().optional(),
  pricePerMonth: z.number().positive().optional(),
  notes: z.string().optional(),
});

const updateSaleSchema = createSaleSchema.partial().omit({ animalId: true });

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate age in months from date of birth to event date
 */
function calculateAgeMonths(dob: string, eventDate: string): number {
  const birthDate = new Date(dob);
  const event = new Date(eventDate);
  const months = (event.getFullYear() - birthDate.getFullYear()) * 12 + (event.getMonth() - birthDate.getMonth());
  return months;
}

/**
 * Calculate derived metrics (kg/month, price/month)
 */
function calculateDerivedMetrics(data: {
  weightKg?: number;
  salePrice?: number;
  ageMonths?: number;
}): { kgPerMonth?: number; pricePerMonth?: number } {
  const result: { kgPerMonth?: number; pricePerMonth?: number } = {};

  if (data.weightKg && data.ageMonths && data.ageMonths > 0) {
    result.kgPerMonth = data.weightKg / data.ageMonths;
  }

  if (data.salePrice && data.ageMonths && data.ageMonths > 0) {
    result.pricePerMonth = data.salePrice / data.ageMonths;
  }

  return result;
}

// ==================== ROUTES ====================

/**
 * GET /api/sales
 * List sale events with optional filters
 */
sales.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { eventType, startDate, endDate, minPrice, maxPrice } = c.req.query();

  try {
    let query = db.select().from(schema.saleEvents);

    // Build filter conditions
    const conditions = [];

    // Always filter by farmId
    conditions.push(eq(schema.saleEvents.farmId, user.activeFarmId!));

    if (eventType) {
      conditions.push(eq(schema.saleEvents.eventType, eventType));
    }

    if (startDate) {
      conditions.push(gte(schema.saleEvents.eventDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(schema.saleEvents.eventDate, endDate));
    }

    if (minPrice) {
      conditions.push(gte(schema.saleEvents.salePrice, parseFloat(minPrice)));
    }

    if (maxPrice) {
      conditions.push(lte(schema.saleEvents.salePrice, parseFloat(maxPrice)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query.orderBy(desc(schema.saleEvents.eventDate));

    // Fetch related animal data
    const salesWithDetails = await Promise.all(
      results.map(async (sale) => {
        const animal = await db.query.cattle.findFirst({
          where: eq(schema.cattle.id, sale.animalId),
        });

        return {
          id: sale.id,
          cattleId: sale.animalId,
          cattleTag: animal?.tagNo || 'Unknown',
          saleDate: sale.eventDate,
          salePrice: sale.salePrice || 0,
          weight: sale.weightKg,
          buyer: sale.notes, // Using notes as buyer field for now
          notes: sale.notes,
          ...sale,
          animal,
        };
      })
    );

    return c.json({
      data: salesWithDetails,
      count: results.length,
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    return c.json({ error: 'Failed to fetch sale events' }, 500);
  }
});

/**
 * GET /api/sales/metrics
 * Sales metrics for the financials page
 */
sales.get('/metrics', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { period } = c.req.query();

  try {
    // Get all sales for this farm
    const allSales = await db.select().from(schema.saleEvents)
      .where(eq(schema.saleEvents.farmId, user.activeFarmId!));
    const sold = allSales.filter(s => s.eventType === 'Sold');

    // Calculate totals
    const totalRevenue = sold.reduce((sum, s) => sum + (s.salePrice || 0), 0);
    const totalWeight = sold.reduce((sum, s) => sum + (s.weightKg || 0), 0);
    const avgWeight = sold.length > 0 ? totalWeight / sold.length : 0;
    const avgPrice = sold.length > 0 ? totalRevenue / sold.length : 0;
    const avgPricePerKg = avgWeight > 0 ? avgPrice / avgWeight : 0;

    // Calculate YTD metrics
    const currentYear = new Date().getFullYear();
    const ytdStartDate = `${currentYear}-01-01`;
    const ytdSales = sold.filter(s => s.eventDate >= ytdStartDate);
    const ytdRevenue = ytdSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);

    // Monthly revenue for last 12 months
    const monthlyRevenue = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthNum = date.getMonth();
      const year = date.getFullYear();
      const monthName = months[monthNum];

      const monthSales = sold.filter(s => {
        const saleDate = new Date(s.eventDate);
        return saleDate.getMonth() === monthNum && saleDate.getFullYear() === year;
      });

      const revenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);

      monthlyRevenue.push({
        month: monthName,
        revenue: parseFloat(revenue.toFixed(2)),
        count: monthSales.length,
      });
    }

    return c.json({
      data: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalSales: sold.length,
        avgPrice: parseFloat(avgPrice.toFixed(2)),
        avgWeight: parseFloat(avgWeight.toFixed(2)),
        totalWeight: parseFloat(totalWeight.toFixed(2)),
        avgPricePerKg: parseFloat(avgPricePerKg.toFixed(2)),
        ytdRevenue: parseFloat(ytdRevenue.toFixed(2)),
        ytdSales: ytdSales.length,
        monthlyRevenue,
      },
    });
  } catch (error) {
    console.error('Error fetching sales metrics:', error);
    return c.json({ error: 'Failed to fetch sales metrics' }, 500);
  }
});

/**
 * GET /api/sales/summary
 * Sales summary statistics
 */
sales.get('/summary', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { year } = c.req.query();

  try {
    let query = db.select().from(schema.saleEvents);

    // Build conditions - always include farmId
    const conditions = [eq(schema.saleEvents.farmId, user.activeFarmId!)];

    if (year) {
      const yearNum = parseInt(year);
      conditions.push(gte(schema.saleEvents.eventDate, `${yearNum}-01-01`));
      conditions.push(lte(schema.saleEvents.eventDate, `${yearNum}-12-31`));
    }

    query = query.where(and(...conditions));

    const allSales = await query;

    // Separate sold vs died
    const sold = allSales.filter(s => s.eventType === 'Sold');
    const died = allSales.filter(s => s.eventType === 'Died');

    // Total revenue
    const totalRevenue = sold.reduce((sum, s) => sum + (s.salePrice || 0), 0);

    // Average price
    const avgPrice = sold.length > 0
      ? totalRevenue / sold.length
      : 0;

    // Total weight
    const totalWeight = sold.reduce((sum, s) => sum + (s.weightKg || 0), 0);
    const avgWeight = sold.length > 0
      ? totalWeight / sold.length
      : 0;

    // Average age at sale
    const totalAge = sold.reduce((sum, s) => sum + (s.ageMonths || 0), 0);
    const avgAge = sold.length > 0
      ? totalAge / sold.length
      : 0;

    // Growth rate (kg/month)
    const salesWithGrowth = sold.filter(s => s.kgPerMonth);
    const avgGrowthRate = salesWithGrowth.length > 0
      ? salesWithGrowth.reduce((sum, s) => sum + (s.kgPerMonth || 0), 0) / salesWithGrowth.length
      : 0;

    // Price per kg
    const pricePerKg = avgWeight > 0 ? avgPrice / avgWeight : 0;

    // Top sales (highest price)
    const topSales = sold
      .filter(s => s.salePrice)
      .sort((a, b) => (b.salePrice || 0) - (a.salePrice || 0))
      .slice(0, 5);

    // Sales by month (for current year or specified year)
    const salesByMonth: Record<string, { count: number; revenue: number }> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    months.forEach(month => {
      salesByMonth[month] = { count: 0, revenue: 0 };
    });

    sold.forEach(sale => {
      const saleDate = new Date(sale.eventDate);
      const month = months[saleDate.getMonth()];
      salesByMonth[month].count++;
      salesByMonth[month].revenue += (sale.salePrice || 0);
    });

    return c.json({
      data: {
        totalSales: sold.length,
        totalDeaths: died.length,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        avgPrice: parseFloat(avgPrice.toFixed(2)),
        avgWeight: parseFloat(avgWeight.toFixed(2)),
        avgAge: parseFloat(avgAge.toFixed(1)),
        avgGrowthRate: parseFloat(avgGrowthRate.toFixed(2)),
        pricePerKg: parseFloat(pricePerKg.toFixed(2)),
        topSales,
        salesByMonth,
      },
    });
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    return c.json({ error: 'Failed to fetch sales summary' }, 500);
  }
});

/**
 * GET /api/sales/:id
 * Get single sale event with full details
 */
sales.get('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const sale = await db.query.saleEvents.findFirst({
      where: and(
        eq(schema.saleEvents.id, id),
        eq(schema.saleEvents.farmId, user.activeFarmId!)
      ),
      with: {
        animal: true,
      },
    });

    if (!sale) {
      return c.json({ error: 'Sale event not found' }, 404);
    }

    return c.json({ data: sale });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return c.json({ error: 'Failed to fetch sale event' }, 500);
  }
});

/**
 * POST /api/sales
 * Create sale event
 */
sales.post('/', zValidator('json', createSaleSchema), async (c) => {
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

    // Check if animal already has a sale event (one-to-one relationship)
    const existingSale = await db.query.saleEvents.findFirst({
      where: eq(schema.saleEvents.animalId, data.animalId),
    });

    if (existingSale) {
      return c.json({ error: 'Animal already has a sale/death event' }, 400);
    }

    // Calculate age if not provided
    let ageMonths = data.ageMonths;
    if (!ageMonths) {
      ageMonths = calculateAgeMonths(animal.dob, data.eventDate);
    }

    // Calculate derived metrics
    const derivedMetrics = calculateDerivedMetrics({
      weightKg: data.weightKg,
      salePrice: data.salePrice,
      ageMonths,
    });

    // Create sale event
    const [newSale] = await db
      .insert(schema.saleEvents)
      .values({
        ...data,
        farmId: user.activeFarmId!,
        ageMonths,
        kgPerMonth: data.kgPerMonth || derivedMetrics.kgPerMonth,
        pricePerMonth: data.pricePerMonth || derivedMetrics.pricePerMonth,
      })
      .returning();

    // Update animal status
    await db
      .update(schema.cattle)
      .set({
        onFarm: false,
        currentStatus: data.eventType,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.cattle.id, data.animalId));

    return c.json({ data: newSale }, 201);
  } catch (error) {
    console.error('Error creating sale:', error);
    return c.json({ error: 'Failed to create sale event' }, 500);
  }
});

/**
 * PUT /api/sales/:id
 * Update sale event
 */
sales.put('/:id', zValidator('json', updateSaleSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    // Verify sale exists
    const existing = await db.query.saleEvents.findFirst({
      where: and(
        eq(schema.saleEvents.id, id),
        eq(schema.saleEvents.farmId, user.activeFarmId!)
      ),
      with: {
        animal: true,
      },
    });

    if (!existing) {
      return c.json({ error: 'Sale event not found' }, 404);
    }

    // Recalculate age if event date changed
    let updateData = { ...data };
    if (data.eventDate && data.eventDate !== existing.eventDate && existing.animal) {
      const ageMonths = calculateAgeMonths(existing.animal.dob, data.eventDate);
      updateData.ageMonths = ageMonths;
    }

    // Recalculate derived metrics if relevant fields changed
    const derivedMetrics = calculateDerivedMetrics({
      weightKg: data.weightKg ?? existing.weightKg ?? undefined,
      salePrice: data.salePrice ?? existing.salePrice ?? undefined,
      ageMonths: updateData.ageMonths ?? existing.ageMonths ?? undefined,
    });

    if (derivedMetrics.kgPerMonth !== undefined) {
      updateData.kgPerMonth = derivedMetrics.kgPerMonth;
    }
    if (derivedMetrics.pricePerMonth !== undefined) {
      updateData.pricePerMonth = derivedMetrics.pricePerMonth;
    }

    // Update sale event
    const [updated] = await db
      .update(schema.saleEvents)
      .set({
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(schema.saleEvents.id, id),
        eq(schema.saleEvents.farmId, user.activeFarmId!)
      ))
      .returning();

    // Update animal status if event type changed
    if (data.eventType && data.eventType !== existing.eventType) {
      await db
        .update(schema.cattle)
        .set({
          currentStatus: data.eventType,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.cattle.id, existing.animalId));
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error('Error updating sale:', error);
    return c.json({ error: 'Failed to update sale event' }, 500);
  }
});

/**
 * DELETE /api/sales/:id
 * Delete sale event and restore animal to active status
 */
sales.delete('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const existing = await db.query.saleEvents.findFirst({
      where: and(
        eq(schema.saleEvents.id, id),
        eq(schema.saleEvents.farmId, user.activeFarmId!)
      ),
    });

    if (!existing) {
      return c.json({ error: 'Sale event not found' }, 404);
    }

    // Delete sale event
    const [deleted] = await db
      .delete(schema.saleEvents)
      .where(and(
        eq(schema.saleEvents.id, id),
        eq(schema.saleEvents.farmId, user.activeFarmId!)
      ))
      .returning();

    // Restore animal to active status
    await db
      .update(schema.cattle)
      .set({
        onFarm: true,
        currentStatus: 'Active',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.cattle.id, existing.animalId));

    return c.json({ data: deleted });
  } catch (error) {
    console.error('Error deleting sale:', error);
    return c.json({ error: 'Failed to delete sale event' }, 500);
  }
});

/**
 * POST /api/sales/batch
 * Create sale events for multiple animals at once
 */
const batchSaleSchema = z.object({
  sales: z.array(z.object({
    animalId: z.number().int().positive(),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weightKg: z.number().positive().optional(),
    salePrice: z.number().positive().optional(),
    notes: z.string().optional(),
  })).min(1),
});

sales.post('/batch', zValidator('json', batchSaleSchema), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { sales: saleItems } = c.req.valid('json');

  try {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of saleItems) {
      // Verify animal exists
      const animal = await db.query.cattle.findFirst({
        where: eq(schema.cattle.id, item.animalId),
      });

      if (!animal) {
        errors.push(`Animal ${item.animalId} not found`);
        skipped++;
        continue;
      }

      // Skip if already has a sale event
      const existingSale = await db.query.saleEvents.findFirst({
        where: eq(schema.saleEvents.animalId, item.animalId),
      });

      if (existingSale) {
        skipped++;
        continue;
      }

      // Calculate age and derived metrics
      const ageMonths = calculateAgeMonths(animal.dob, item.eventDate);
      const derivedMetrics = calculateDerivedMetrics({
        weightKg: item.weightKg,
        salePrice: item.salePrice,
        ageMonths,
      });

      // Create sale event
      await db.insert(schema.saleEvents).values({
        animalId: item.animalId,
        farmId: user.activeFarmId!,
        eventDate: item.eventDate,
        eventType: 'Sold',
        ageMonths,
        weightKg: item.weightKg,
        salePrice: item.salePrice,
        kgPerMonth: derivedMetrics.kgPerMonth,
        pricePerMonth: derivedMetrics.pricePerMonth,
        notes: item.notes,
      });

      // Update animal status
      await db.update(schema.cattle)
        .set({
          onFarm: false,
          currentStatus: 'Sold',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.cattle.id, item.animalId));

      created++;
    }

    return c.json({ data: { created, skipped, errors } }, 201);
  } catch (error) {
    console.error('Error batch creating sales:', error);
    return c.json({ error: 'Failed to batch create sales' }, 500);
  }
});

export default sales;
