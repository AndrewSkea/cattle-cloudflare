/**
 * Analytics Routes - Dashboard metrics and business intelligence
 */

import { Hono } from 'hono';
import { eq, and, sql, gte, lte, isNotNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const analytics = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate age in months from date of birth
 */
function calculateAgeMonths(dob: string): number {
  const birthDate = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - birthDate.getFullYear()) * 12 + (now.getMonth() - birthDate.getMonth());
  return months;
}

/**
 * Get current year for filtering
 */
function getCurrentYear(): number {
  return new Date().getFullYear();
}

// ==================== ROUTES ====================

/**
 * GET /api/analytics/dashboard
 * Dashboard metrics - total cattle, breeding females, upcoming calvings, revenue YTD
 */
analytics.get('/dashboard', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  try {
    // Total cattle on farm
    const totalCattleResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cattle)
      .where(
        and(
          eq(schema.cattle.onFarm, true),
          eq(schema.cattle.farmId, user.activeFarmId!)
        )
      );
    const totalCattle = totalCattleResult[0]?.count || 0;

    // Breeding females (females on farm)
    const breedingFemalesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cattle)
      .where(
        and(
          eq(schema.cattle.onFarm, true),
          eq(schema.cattle.sex, 'fem'),
          eq(schema.cattle.farmId, user.activeFarmId!)
        )
      );
    const breedingFemales = breedingFemalesResult[0]?.count || 0;

    // Upcoming calvings (expected calving dates in next 60 days)
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    const upcomingCalvingsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.serviceEvents)
      .where(
        and(
          isNotNull(schema.serviceEvents.expectedCalvingDate),
          lte(schema.serviceEvents.expectedCalvingDate, sixtyDaysFromNow.toISOString().split('T')[0]),
          gte(schema.serviceEvents.expectedCalvingDate, new Date().toISOString().split('T')[0]),
          sql`${schema.serviceEvents.successful} IS NULL`, // Not yet calved
          eq(schema.serviceEvents.farmId, user.activeFarmId!)
        )
      );
    const upcomingCalvings = upcomingCalvingsResult[0]?.count || 0;

    // Revenue YTD (sales this year)
    const currentYear = getCurrentYear();
    const ytdStartDate = `${currentYear}-01-01`;

    const revenueResult = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${schema.saleEvents.salePrice}), 0)`,
        totalSales: sql<number>`count(*)`
      })
      .from(schema.saleEvents)
      .where(
        and(
          gte(schema.saleEvents.eventDate, ytdStartDate),
          eq(schema.saleEvents.eventType, 'Sold'),
          eq(schema.saleEvents.farmId, user.activeFarmId!)
        )
      );

    const revenueYTD = revenueResult[0]?.totalRevenue || 0;
    const salesCountYTD = revenueResult[0]?.totalSales || 0;

    // Recent calvings (last 90 days) - return actual array with details
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentCalvingsData = await db.query.calvingEvents.findMany({
      where: and(
        gte(schema.calvingEvents.calvingDate, ninetyDaysAgo.toISOString().split('T')[0]),
        eq(schema.calvingEvents.farmId, user.activeFarmId!)
      ),
      with: {
        mother: true,
        calf: true,
      },
      orderBy: (calvingEvents, { desc }) => [desc(calvingEvents.calvingDate)],
      limit: 10,
    });

    const recentCalvings = recentCalvingsData.map(c => ({
      id: c.id,
      cattleId: c.motherId,
      cattleTag: c.mother?.managementTag || c.mother?.tagNo || 'Unknown',
      calvingDate: c.calvingDate,
      calfTag: c.calf?.managementTag || c.calf?.tagNo || null,
      difficulty: c.notes || null,
    }));

    // Upcoming calving predictions - return actual array
    const upcomingPredictionsData = await db.query.serviceEvents.findMany({
      where: and(
        isNotNull(schema.serviceEvents.expectedCalvingDate),
        gte(schema.serviceEvents.expectedCalvingDate, new Date().toISOString().split('T')[0]),
        sql`${schema.serviceEvents.successful} IS NULL`,
        eq(schema.serviceEvents.farmId, user.activeFarmId!)
      ),
      with: {
        cow: true,
      },
      orderBy: (serviceEvents, { asc }) => [asc(serviceEvents.expectedCalvingDate)],
      limit: 10,
    });

    const upcomingPredictions = upcomingPredictionsData.map(s => {
      const daysUntil = Math.ceil(
        (new Date(s.expectedCalvingDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return {
        cattleId: s.cowId,
        cattleTag: s.cow?.managementTag || s.cow?.tagNo || 'Unknown',
        expectedDate: s.expectedCalvingDate,
        daysUntil,
        serviceDate: s.serviceDate,
      };
    });

    // Herd composition by breed
    const allCattleForComposition = await db
      .select({ breed: schema.cattle.breed })
      .from(schema.cattle)
      .where(
        and(
          eq(schema.cattle.onFarm, true),
          eq(schema.cattle.farmId, user.activeFarmId!)
        )
      );

    const breedCounts: Record<string, number> = {};
    allCattleForComposition.forEach(c => {
      const breed = c.breed || 'Unknown';
      breedCounts[breed] = (breedCounts[breed] || 0) + 1;
    });
    const herdComposition = Object.entries(breedCounts).map(([name, value]) => ({ name, value }));

    return c.json({
      data: {
        totalCattle,
        breedingFemales,
        upcomingCalvings,
        revenueYTD,
        salesCountYTD,
        recentCalvings,
        upcomingPredictions,
        herdComposition,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return c.json({ error: 'Failed to fetch dashboard metrics' }, 500);
  }
});

/**
 * GET /api/analytics/herd-statistics
 * Herd statistics - breakdown by breed, sex, age, on-farm status
 */
analytics.get('/herd-statistics', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  try {
    // Get all cattle for processing
    const allCattle = await db.select().from(schema.cattle)
      .where(eq(schema.cattle.farmId, user.activeFarmId!));

    // Breakdown by breed
    const breedStats = allCattle.reduce((acc, animal) => {
      const breed = animal.breed || 'Unknown';
      acc[breed] = (acc[breed] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Breakdown by sex
    const sexStats = allCattle.reduce((acc, animal) => {
      const sex = animal.sex || 'Unknown';
      acc[sex] = (acc[sex] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Breakdown by age group
    const ageStats = {
      '0-12 months': 0,
      '13-24 months': 0,
      '25-36 months': 0,
      '37-60 months': 0,
      '60+ months': 0,
    };

    allCattle.forEach((animal) => {
      const ageMonths = calculateAgeMonths(animal.dob);
      if (ageMonths <= 12) ageStats['0-12 months']++;
      else if (ageMonths <= 24) ageStats['13-24 months']++;
      else if (ageMonths <= 36) ageStats['25-36 months']++;
      else if (ageMonths <= 60) ageStats['37-60 months']++;
      else ageStats['60+ months']++;
    });

    // On-farm status
    const onFarmCount = allCattle.filter(a => a.onFarm).length;
    const offFarmCount = allCattle.filter(a => !a.onFarm).length;

    // Size breakdown
    const sizeStats = allCattle.reduce((acc, animal) => {
      if (animal.size) {
        const sizeKey = `Size ${animal.size}`;
        acc[sizeKey] = (acc[sizeKey] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Convert to array format for charts
    const byBreedArray = Object.entries(breedStats).map(([name, value]) => ({ name, value }));
    const bySexArray = Object.entries(sexStats).map(([name, value]) => ({ name, value }));
    const byAgeArray = Object.entries(ageStats).map(([name, value]) => ({ name, value }));

    return c.json({
      data: {
        totalCount: allCattle.length,
        byBreed: byBreedArray,
        bySex: bySexArray,
        byAgeGroup: byAgeArray,
        onFarm: onFarmCount,
        offFarm: offFarmCount,
      },
    });
  } catch (error) {
    console.error('Error fetching herd stats:', error);
    return c.json({ error: 'Failed to fetch herd statistics' }, 500);
  }
});

/**
 * GET /api/analytics/breeding-metrics
 * Breeding performance - calving rate, avg interval, success rate
 */
analytics.get('/breeding-metrics', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  try {
    // Get all breeding females
    const breedingFemales = await db
      .select()
      .from(schema.cattle)
      .where(
        and(
          eq(schema.cattle.onFarm, true),
          eq(schema.cattle.sex, 'fem'),
          eq(schema.cattle.farmId, user.activeFarmId!)
        )
      );

    // Get all calving events
    const allCalvings = await db.select().from(schema.calvingEvents)
      .where(eq(schema.calvingEvents.farmId, user.activeFarmId!));

    // Get all service events
    const allServices = await db.select().from(schema.serviceEvents)
      .where(eq(schema.serviceEvents.farmId, user.activeFarmId!));

    // Calculate calving rate (calvings per year)
    const calvingsThisYear = allCalvings.filter(c =>
      c.calvingYear === getCurrentYear()
    ).length;
    const calvingRate = breedingFemales.length > 0
      ? (calvingsThisYear / breedingFemales.length) * 100
      : 0;

    // Calculate average calving interval
    const calvingsWithInterval = allCalvings.filter(c => c.daysSinceLastCalving);
    const avgCalvingInterval = calvingsWithInterval.length > 0
      ? calvingsWithInterval.reduce((sum, c) => sum + (c.daysSinceLastCalving || 0), 0) / calvingsWithInterval.length
      : 0;

    // Calculate breeding success rate (services that resulted in calving)
    const successfulServices = allServices.filter(s => s.successful === true).length;
    const successRate = allServices.length > 0
      ? (successfulServices / allServices.length) * 100
      : 0;

    // Services awaiting outcome
    const pendingServices = allServices.filter(s => s.successful === null).length;

    // Calving difficulty/ease stats (based on notes)
    const calvingsByYear = allCalvings.reduce((acc, c) => {
      acc[c.calvingYear] = (acc[c.calvingYear] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Sex distribution of calves
    const calfSexStats = allCalvings.reduce((acc, c) => {
      if (c.calfSex) {
        acc[c.calfSex] = (acc[c.calfSex] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return c.json({
      data: {
        calvingRate: parseFloat(calvingRate.toFixed(2)),
        avgCalvingInterval: parseFloat(avgCalvingInterval.toFixed(0)),
        successRate: parseFloat(successRate.toFixed(2)),
        totalServices: allServices.length,
        pregnantCows: pendingServices, // Cows with pending service outcomes
        breedingFemales: breedingFemales.length,
        totalCalvings: allCalvings.length,
        calvingsThisYear,
        successfulServices,
        calvingsByYear,
        calfSexDistribution: calfSexStats,
      },
    });
  } catch (error) {
    console.error('Error fetching breeding metrics:', error);
    return c.json({ error: 'Failed to fetch breeding metrics' }, 500);
  }
});

/**
 * GET /api/analytics/financial-summary
 * Financial metrics - total sales, avg price, profitability
 */
analytics.get('/financial-summary', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { year } = c.req.query();

  try {
    // Build query with optional year filter and farmId scoping
    let query = db.select().from(schema.saleEvents);

    if (year) {
      const yearNum = parseInt(year);
      query = query.where(
        and(
          gte(schema.saleEvents.eventDate, `${yearNum}-01-01`),
          lte(schema.saleEvents.eventDate, `${yearNum}-12-31`),
          eq(schema.saleEvents.farmId, user.activeFarmId!)
        )
      );
    } else {
      query = query.where(
        eq(schema.saleEvents.farmId, user.activeFarmId!)
      );
    }

    const saleEvents = await query;

    // Filter sold vs died
    const soldEvents = saleEvents.filter(s => s.eventType === 'Sold');
    const diedEvents = saleEvents.filter(s => s.eventType === 'Died');

    // Total sales revenue
    const totalRevenue = soldEvents.reduce((sum, s) => sum + (s.salePrice || 0), 0);

    // Average sale price
    const avgSalePrice = soldEvents.length > 0
      ? totalRevenue / soldEvents.length
      : 0;

    // Average weight and growth rate
    const totalWeight = soldEvents.reduce((sum, s) => sum + (s.weightKg || 0), 0);
    const avgWeight = soldEvents.length > 0 ? totalWeight / soldEvents.length : 0;

    const animalsWithKgPerMonth = soldEvents.filter(s => s.kgPerMonth);
    const avgGrowthRate = animalsWithKgPerMonth.length > 0
      ? animalsWithKgPerMonth.reduce((sum, s) => sum + (s.kgPerMonth || 0), 0) / animalsWithKgPerMonth.length
      : 0;

    // Price per kg
    const pricePerKg = avgWeight > 0 ? avgSalePrice / avgWeight : 0;

    // Average age at sale
    const totalAge = soldEvents.reduce((sum, s) => sum + (s.ageMonths || 0), 0);
    const avgAgeAtSale = soldEvents.length > 0 ? totalAge / soldEvents.length : 0;

    // Sales by year
    const salesByYear = saleEvents.reduce((acc, s) => {
      const saleYear = new Date(s.eventDate).getFullYear();
      if (!acc[saleYear]) {
        acc[saleYear] = { count: 0, revenue: 0 };
      }
      acc[saleYear].count++;
      acc[saleYear].revenue += (s.salePrice || 0);
      return acc;
    }, {} as Record<number, { count: number; revenue: number }>);

    // Calculate YTD metrics
    const currentYear = getCurrentYear();
    const ytdStartDate = `${currentYear}-01-01`;
    const ytdSales = soldEvents.filter(s => s.eventDate >= ytdStartDate);
    const ytdRevenue = ytdSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);

    return c.json({
      data: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalSales: soldEvents.length,
        avgPricePerHead: parseFloat(avgSalePrice.toFixed(2)),
        avgWeight: parseFloat(avgWeight.toFixed(2)),
        ytdRevenue: parseFloat(ytdRevenue.toFixed(2)),
        ytdSales: ytdSales.length,
        avgGrowthRate: parseFloat(avgGrowthRate.toFixed(2)),
        pricePerKg: parseFloat(pricePerKg.toFixed(2)),
        avgAgeAtSale: parseFloat(avgAgeAtSale.toFixed(1)),
        deathCount: diedEvents.length,
        salesByYear,
      },
    });
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    return c.json({ error: 'Failed to fetch financial summary' }, 500);
  }
});

/**
 * GET /api/analytics/trends
 * Historical trends - herd size over time, births/deaths
 */
analytics.get('/trends', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { startYear, endYear } = c.req.query();

  try {
    // Get all cattle and events
    const allCattle = await db.select().from(schema.cattle)
      .where(eq(schema.cattle.farmId, user.activeFarmId!));
    const allCalvings = await db.select().from(schema.calvingEvents)
      .where(eq(schema.calvingEvents.farmId, user.activeFarmId!));
    const allSales = await db.select().from(schema.saleEvents)
      .where(eq(schema.saleEvents.farmId, user.activeFarmId!));

    // Determine year range
    const currentYear = getCurrentYear();
    const start = startYear ? parseInt(startYear) : currentYear - 5;
    const end = endYear ? parseInt(endYear) : currentYear;

    // Build yearly trends
    const yearlyTrends: Record<number, {
      year: number;
      herdSize: number;
      births: number;
      deaths: number;
      sales: number;
      additions: number;
      revenue: number;
    }> = {};

    for (let year = start; year <= end; year++) {
      // Count births (calvings)
      const births = allCalvings.filter(c => c.calvingYear === year).length;

      // Count deaths
      const deaths = allSales.filter(s =>
        s.eventType === 'Died' && new Date(s.eventDate).getFullYear() === year
      ).length;

      // Count sales
      const sales = allSales.filter(s =>
        s.eventType === 'Sold' && new Date(s.eventDate).getFullYear() === year
      );

      // Calculate revenue
      const revenue = sales.reduce((sum, s) => sum + (s.salePrice || 0), 0);

      // Estimate herd size (cattle born on or before this year, not sold/died before year end)
      const endOfYear = `${year}-12-31`;
      const herdSize = allCattle.filter(animal => {
        const birthYear = new Date(animal.dob).getFullYear();
        if (birthYear > year) return false;

        // Check if sold or died before year end
        const saleEvent = allSales.find(s => s.animalId === animal.id);
        if (saleEvent && saleEvent.eventDate <= endOfYear) return false;

        return true;
      }).length;

      // Additions (cattle born in this year)
      const additions = allCattle.filter(a => new Date(a.dob).getFullYear() === year).length;

      yearlyTrends[year] = {
        year,
        herdSize,
        births,
        deaths,
        sales: sales.length,
        additions,
        revenue: parseFloat(revenue.toFixed(2)),
      };
    }

    // Monthly trends for current year
    const monthlyTrends: Record<string, {
      month: string;
      births: number;
      sales: number;
      deaths: number;
    }> = {};

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i < 12; i++) {
      const monthNum = i + 1;
      const monthStr = monthNum.toString().padStart(2, '0');

      const births = allCalvings.filter(c =>
        c.calvingYear === currentYear && c.calvingMonth === months[i]
      ).length;

      const monthSales = allSales.filter(s => {
        const date = new Date(s.eventDate);
        return date.getFullYear() === currentYear && date.getMonth() === i;
      });

      monthlyTrends[months[i]] = {
        month: months[i],
        births,
        sales: monthSales.filter(s => s.eventType === 'Sold').length,
        deaths: monthSales.filter(s => s.eventType === 'Died').length,
      };
    }

    // Calculate herd size over last 12 months
    const herdSizeData = [];
    const birthsVsSalesData = [];

    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthNum = date.getMonth();
      const year = date.getFullYear();
      const monthName = months[monthNum];
      const monthKey = `${year}-${(monthNum + 1).toString().padStart(2, '0')}`;

      // Count herd size (approximate - cattle born by end of month, not sold/died by end of month)
      const endOfMonth = new Date(year, monthNum + 1, 0);
      const herdSize = allCattle.filter(animal => {
        const birthDate = new Date(animal.dob);
        if (birthDate > endOfMonth) return false;

        // Check if sold or died before month end
        const saleEvent = allSales.find(s => s.animalId === animal.id);
        if (saleEvent && new Date(saleEvent.eventDate) <= endOfMonth) return false;

        return true;
      }).length;

      // Count births and sales in this month
      const births = allCalvings.filter(c => {
        const calvingDate = new Date(c.calvingDate);
        return calvingDate.getMonth() === monthNum && calvingDate.getFullYear() === year;
      }).length;

      const sales = allSales.filter(s => {
        const saleDate = new Date(s.eventDate);
        return s.eventType === 'Sold' && saleDate.getMonth() === monthNum && saleDate.getFullYear() === year;
      }).length;

      herdSizeData.push({ month: monthName, count: herdSize });
      birthsVsSalesData.push({ month: monthName, births, sales });
    }

    return c.json({
      data: {
        herdSize: herdSizeData,
        birthsVsSales: birthsVsSalesData,
        yearlyTrends: Object.values(yearlyTrends),
        monthlyTrends: Object.values(monthlyTrends),
        currentYear,
        yearRange: { start, end },
      },
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    return c.json({ error: 'Failed to fetch trends' }, 500);
  }
});

export default analytics;
