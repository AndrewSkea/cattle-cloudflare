/**
 * What the herd is worth at today's Orkney Mart prices, and which months have paid best.
 * Both come from the shared mart lots, so they work without any of the farm's own sales.
 */

import type { DrizzleD1Database } from '../../db/client';
import { sql } from 'drizzle-orm';
import { ageMonths, classify, type FarmGraph } from '../livestock';

/** Rough liveweight when an animal has never been weighed: birth weight plus a typical daily gain, capped at a mature weight. */
export function estimateWeightKg(cls: string, sex: string, castrated: boolean, age: number | null): number | null {
  if (cls === 'cow') return 650;
  if (cls === 'bull' && (age ?? 0) >= 24) return 900;
  if (age == null) return null;
  const days = age * 30.44;
  const female = sex === 'female';
  const gain = female ? 0.9 : castrated ? 1.05 : 1.15;
  const cap = female ? 580 : castrated ? 680 : 900;
  return Math.round(Math.min(cap, 45 + days * gain));
}

interface CategoryPrice { ppk: number | null; perHead: number | null; n: number }

/** Average p/kg and £/head per mart category over the window, widening to a year when a category is thin. */
async function recentPrices(db: DrizzleD1Database, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.all<{ category: string; ppk: number | null; perHead: number | null; nk: number; nh: number }>(sql`
    SELECT category,
      AVG(CASE WHEN basis = 'kg' AND price_per_kg BETWEEN 50 AND 1500 THEN price_per_kg END) ppk,
      AVG(CASE WHEN basis = 'head' AND price BETWEEN 100 AND 20000 THEN price END) perHead,
      SUM(CASE WHEN basis = 'kg' AND price_per_kg BETWEEN 50 AND 1500 THEN 1 ELSE 0 END) nk,
      SUM(CASE WHEN basis = 'head' AND price BETWEEN 100 AND 20000 THEN 1 ELSE 0 END) nh
    FROM mart_lots WHERE species = 'cattle' AND date >= ${since} GROUP BY category`);
  const out = new Map<string, CategoryPrice>();
  for (const r of rows) {
    out.set(r.category, { ppk: r.nk >= 3 ? r.ppk : null, perHead: r.nh >= 3 ? r.perHead : null, n: r.nk + r.nh });
  }
  return { since, prices: out };
}

const CLASS_ORDER = ['calf', 'heifer', 'steer', 'cow', 'bull'];
const CLASS_LABEL: Record<string, string> = { calf: 'Calves', heifer: 'Heifers', steer: 'Steers', cow: 'Cows', bull: 'Bulls' };

export async function herdValuation(db: DrizzleD1Database, g: FarmGraph) {
  let window = await recentPrices(db, 90);
  const thin = ['steers', 'heifers'].some((k) => !window.prices.get(k)?.ppk);
  if (thin) window = await recentPrices(db, 365);
  const p = window.prices;
  const ppk = (k: string) => p.get(k)?.ppk ?? null;
  const head = (k: string) => p.get(k)?.perHead ?? null;

  const classes = new Map<string, { count: number; weighed: number; weightKg: number; value: number; priced: number; basis: string }>();
  for (const a of g.animals.values()) {
    if (a.status !== 'active' || a.species !== 'cattle') continue;
    const age = ageMonths(a.dob, a.birthYear);
    const calved = (g.birthsByDam.get(a.id)?.length || 0) > 0 || (a.sex === 'female' && (g.childrenOf.get(a.id)?.length || 0) > 0);
    const cls = classify(a, age, calved);
    const w = g.weights.get(a.id);
    const latest = w?.length ? w[w.length - 1].weightKg : null;
    const kg = latest ?? estimateWeightKg(cls, a.sex, a.castrated, age);

    // Store cattle sell by weight; cows go as cull (OTM) cows by weight or per head; bulls per head.
    let value: number | null = null;
    let basis = '';
    if (cls === 'calf') {
      const r = ppk('calves') ?? ppk(a.sex === 'female' ? 'heifers' : 'steers');
      if (r && kg) { value = (kg * r) / 100; basis = `${Math.round(r)}p/kg`; }
    } else if (cls === 'steer' || cls === 'heifer') {
      const r = ppk(cls === 'steer' ? 'steers' : 'heifers');
      if (r && kg) { value = (kg * r) / 100; basis = `${Math.round(r)}p/kg`; }
    } else if (cls === 'cow') {
      const r = ppk('otm');
      if (r && kg) { value = (kg * r) / 100; basis = `${Math.round(r)}p/kg (cull cow)`; } else if (head('cows')) { value = head('cows'); basis = 'per head'; }
    } else if (cls === 'bull') {
      const h = head('bulls') ?? head('breeding');
      if (h) { value = h; basis = 'per head'; } else if (ppk('otm') && kg) { value = (kg * ppk('otm')!) / 100; basis = `${Math.round(ppk('otm')!)}p/kg`; }
    }
    const row = classes.get(cls) || { count: 0, weighed: 0, weightKg: 0, value: 0, priced: 0, basis };
    row.count += 1;
    if (latest) row.weighed += 1;
    if (kg) row.weightKg += kg;
    if (value != null) { row.value += value; row.priced += 1; }
    row.basis ||= basis;
    classes.set(cls, row);
  }
  const list = [...classes.entries()]
    .sort((x, y) => CLASS_ORDER.indexOf(x[0]) - CLASS_ORDER.indexOf(y[0]))
    .map(([cls, r]) => ({
      class: cls, label: CLASS_LABEL[cls] || cls, count: r.count, weighed: r.weighed, avgWeightKg: r.count ? Math.round(r.weightKg / r.count) : null,
      basis: r.basis || null, value: Math.round(r.value), avgValue: r.priced ? Math.round(r.value / r.priced) : null, priced: r.priced,
    }));
  return {
    since: window.since,
    total: list.reduce((s, r) => s + r.value, 0),
    head: list.reduce((s, r) => s + r.count, 0),
    weighed: list.reduce((s, r) => s + r.weighed, 0),
    classes: list,
  };
}

/**
 * How each month's p/kg compares with that year's average for the class (so rising prices over the years don't
 * skew it), averaged over the years on record. 100 = a normal month; 105 = 5% above.
 */
export async function sellingSeasons(db: DrizzleD1Database) {
  const rows = await db.all<{ category: string; year: string; month: number; ppk: number; n: number }>(sql`
    SELECT category, substr(date, 1, 4) year, CAST(substr(date, 6, 2) AS INTEGER) month, AVG(price_per_kg) ppk, COUNT(*) n
    FROM mart_lots WHERE species = 'cattle' AND basis = 'kg' AND price_per_kg BETWEEN 50 AND 1500
      AND category IN ('steers', 'heifers', 'calves', 'otm')
    GROUP BY category, year, month HAVING n >= 3`);
  const yearMean = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const k = `${r.category}|${r.year}`;
    const m = yearMean.get(k) || { sum: 0, n: 0 };
    m.sum += r.ppk; m.n += 1;
    yearMean.set(k, m);
  }
  const acc = new Map<string, { idx: number[]; lots: number }>();
  for (const r of rows) {
    const ym = yearMean.get(`${r.category}|${r.year}`)!;
    if (ym.n < 4) continue; // a year with only a few sale months says little about seasons
    const k = `${r.category}|${r.month}`;
    const a = acc.get(k) || { idx: [], lots: 0 };
    a.idx.push((r.ppk / (ym.sum / ym.n)) * 100);
    a.lots += r.n;
    acc.set(k, a);
  }
  const categories = ['steers', 'heifers', 'calves', 'otm'].map((category) => ({
    category,
    months: Array.from({ length: 12 }, (_, i) => {
      const a = acc.get(`${category}|${i + 1}`);
      return { month: i + 1, index: a ? Math.round((a.idx.reduce((s, x) => s + x, 0) / a.idx.length) * 10) / 10 : null, lots: a?.lots ?? 0 };
    }),
  })).filter((c) => c.months.filter((m) => m.index != null).length >= 4);
  return { categories };
}
