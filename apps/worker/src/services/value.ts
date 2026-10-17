/**
 * An animal's weight and value month by month over its life.
 *
 * Weight starts at 0 kg on the date of birth and runs in straight lines through every weighing (sale weights
 * included). Past the last weighing it is estimated with a typical daily gain for the animal's sex, capped at a
 * mature weight. Each month's value is that weight × the price per kg for the month: the farm's own price when
 * one is set (Mart sales → Prices per month), otherwise the Orkney Mart average for the animal's class that month.
 * A sold animal's last point is what it actually sold for.
 */

import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';
import { daysBetween, type AnimalLite, type FarmGraph } from './livestock';

export type PriceSource = 'yours' | 'mart' | 'yours_carried' | 'mart_nearest';

export interface Prices {
  own: Map<string, number>;
  mart: Map<string, Map<string, number>>; // category → month → p/kg
}

const mkey = (d: string) => d.slice(0, 7);

export async function loadPrices(db: DrizzleD1Database, farmId: number, species = 'cattle'): Promise<Prices> {
  const [own, mart] = await Promise.all([
    db.select({ month: schema.monthlyPrices.month, ppk: schema.monthlyPrices.ppk }).from(schema.monthlyPrices)
      .where(and(eq(schema.monthlyPrices.farmId, farmId), eq(schema.monthlyPrices.species, species))).all(),
    db.all<{ month: string; category: string; ppk: number }>(sql`
      SELECT substr(date, 1, 7) month, category, ROUND(AVG(price_per_kg), 1) ppk FROM mart_lots
      WHERE species = ${species} AND price_per_kg BETWEEN 50 AND 1500
      GROUP BY month, category HAVING COUNT(*) >= 3`),
  ]);
  const m = new Map<string, Map<string, number>>();
  for (const r of mart) {
    if (!m.has(r.category)) m.set(r.category, new Map());
    m.get(r.category)!.set(r.month, r.ppk);
  }
  return { own: new Map(own.map((r) => [r.month, r.ppk])), mart: m };
}

function monthDiff(a: string, b: string) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

function nearest(map: Map<string, number> | undefined, month: string, onlyEarlier = false, within = 12): number | null {
  if (!map?.size) return null;
  let best: { d: number; v: number } | null = null;
  for (const [k, v] of map) {
    const d = monthDiff(k, month); // > 0 when k is earlier
    if (onlyEarlier && d < 0) continue;
    if (Math.abs(d) > within) continue;
    if (!best || Math.abs(d) < Math.abs(best.d) || (Math.abs(d) === Math.abs(best.d) && d > 0)) best = { d, v };
  }
  return best?.v ?? null;
}

/** Mart category an animal sold as at a given age. */
export function martCategory(species: string, sex: string, ageMonths: number, calved: boolean): string[] {
  if (species === 'sheep') return ageMonths < 12 ? ['lambs', 'hoggs'] : ['ewes', 'hoggs'];
  if (ageMonths < 6) return ['calves', sex === 'female' ? 'heifers' : 'steers'];
  if (sex === 'female') return calved ? ['otm', 'cows', 'heifers'] : ['heifers', 'steers'];
  return ['steers', 'bulls', 'heifers'];
}

export function priceFor(p: Prices, month: string, categories: string[]): { ppk: number; source: PriceSource; category?: string } | null {
  const own = p.own.get(month);
  if (own != null) return { ppk: own, source: 'yours' };
  for (const c of categories) {
    const v = p.mart.get(c)?.get(month);
    if (v != null) return { ppk: v, source: 'mart', category: c };
  }
  const carried = nearest(p.own, month, true, 120);
  if (carried != null) return { ppk: carried, source: 'yours_carried' };
  for (const c of categories) {
    const v = nearest(p.mart.get(c), month, false, 18);
    if (v != null) return { ppk: v, source: 'mart_nearest', category: c };
  }
  return null;
}

/** Typical daily gain (kg) and mature weight, from 0 kg at birth. */
function growthModel(a: Pick<AnimalLite, 'species' | 'sex' | 'castrated'>, calved: boolean) {
  if (a.species === 'sheep') return { gain: 0.25, cap: a.sex === 'female' ? 70 : 90 };
  if (a.sex === 'female') return { gain: 0.95, cap: calved ? 650 : 600 };
  return a.castrated ? { gain: 1.1, cap: 700 } : { gain: 1.2, cap: 950 };
}

export interface ValuePoint {
  month: string; date: string; ageMonths: number; weightKg: number; estimated: boolean;
  ppk: number | null; priceSource: PriceSource | null; value: number | null; sold?: boolean;
}

function endOfMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Month-by-month weight and value for one animal, from its birth month to its sale (or today). */
export function animalSeries(a: AnimalLite, g: FarmGraph, prices: Prices, today: string) {
  const dob = a.dob ?? (a.birthYear ? `${a.birthYear}-01-01` : null);
  if (!dob) return null;
  const end = a.status !== 'active' && a.exitDate ? a.exitDate : today;
  if (end < dob) return null;
  const firstCalving = (g.birthsByDam.get(a.id) || []).map((b) => b.date).sort()[0] ?? null;
  const weighings = [...(g.weights.get(a.id) || [])].filter((w) => w.date >= dob && w.date <= end).sort((x, y) => x.date.localeCompare(y.date));
  if (a.saleWeightKg && a.exitDate && a.status !== 'active' && !weighings.some((w) => w.date === a.exitDate)) {
    weighings.push({ date: a.exitDate, weightKg: a.saleWeightKg });
  }
  const points = [{ date: dob, weightKg: 0 }, ...weighings];

  const weightAt = (date: string): { kg: number; estimated: boolean } => {
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (p.date === date) return { kg: p.weightKg, estimated: i === 0 ? false : false };
      if (p.date < date) {
        const next = points[i + 1];
        if (next) {
          const t = daysBetween(p.date, date) / Math.max(1, daysBetween(p.date, next.date));
          return { kg: p.weightKg + (next.weightKg - p.weightKg) * t, estimated: false };
        }
        // Past the last weighing: typical gain from there, capped at mature weight (never below what it weighed).
        const model = growthModel(a, !!firstCalving && firstCalving <= date);
        const kg = Math.max(p.weightKg, Math.min(model.cap, p.weightKg + model.gain * daysBetween(p.date, date)));
        return { kg, estimated: true };
      }
    }
    return { kg: 0, estimated: false };
  };

  const series: ValuePoint[] = [];
  let month = mkey(dob);
  const last = mkey(end);
  for (let guard = 0; guard < 600; guard++) {
    const date = month === last ? end : endOfMonth(month);
    const age = Math.max(0, monthDiff(mkey(dob), month));
    const { kg, estimated } = weightAt(date);
    const calved = !!firstCalving && firstCalving <= date;
    const price = priceFor(prices, month, martCategory(a.species, a.sex, age, calved));
    const sold = month === last && a.status !== 'active' && a.salePrice != null && a.exitDate === end;
    series.push({
      month, date, ageMonths: age, weightKg: Math.round(kg), estimated: estimated && !sold,
      ppk: price?.ppk ?? null, priceSource: price?.source ?? null,
      value: sold ? a.salePrice! : price ? Math.round((kg * price.ppk) / 100) : null,
      ...(sold ? { sold: true } : {}),
    });
    if (month === last) break;
    const [y, m] = month.split('-').map(Number);
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  const lastPoint = series[series.length - 1];
  const months = Math.max(1, daysBetween(dob, end) / 30.44);
  return {
    dob, estimatedDob: !a.dob, end, series,
    weighings: weighings.map((w) => ({ date: w.date, weightKg: w.weightKg })),
    currentValue: lastPoint?.value ?? null,
    currentWeightKg: lastPoint?.weightKg ?? null,
    perMonth: lastPoint?.value != null ? Math.round((lastPoint.value / months) * 100) / 100 : null,
    dailyGainKg: lastPoint ? Math.round((lastPoint.weightKg / Math.max(1, daysBetween(dob, end))) * 100) / 100 : null,
    estimated: lastPoint?.estimated ?? false,
  };
}
