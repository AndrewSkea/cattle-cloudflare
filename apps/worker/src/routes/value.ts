/**
 * Animal value over time (weight from 0 kg at birth × price per kg each month) and the farm's monthly prices.
 * Money, so managers and owners only.
 */

import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, body, farmSession, idParam, logActivity, notFound, now, requireAccess, today } from '../lib/context';
import { loadFarmGraph } from '../services/livestock';
import { animalSeries, loadPrices, priceFor } from '../services/value';

const value = new Hono<AppEnv>();
value.use('*', requireAccess('manager', 'manager'));

const speciesParam = (v: string | undefined) => (v === 'sheep' ? 'sheep' : 'cattle');

value.get('/animal/:id', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const id = idParam(c);
  const g = await loadFarmGraph(db, s.farmId);
  const a = g.animals.get(id);
  if (!a) throw notFound('Animal');
  const prices = await loadPrices(db, s.farmId, a.species === 'sheep' ? 'sheep' : 'cattle');
  return c.json({ data: animalSeries(a, g, prices, today()) });
});

/** Herd value month by month (animals on the farm at each month end) and every animal's value and £ per month of life. */
value.get('/herd', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const species = speciesParam(c.req.query('species'));
  const months = Math.min(120, Math.max(6, Number(c.req.query('months')) || 36));
  const g = await loadFarmGraph(db, s.farmId);
  const prices = await loadPrices(db, s.farmId, species);
  const t = today();
  const start = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - (months - 1), 1)).toISOString().slice(0, 7);
  const totals = new Map<string, { value: number; weightKg: number; head: number; estimated: number }>();
  const animals: any[] = [];
  let noDob = 0;
  for (const a of g.animals.values()) {
    if (a.species !== species) continue;
    const r = animalSeries(a, g, prices, t);
    if (!r) { if (a.status === 'active') noDob++; continue; }
    for (const p of r.series) {
      if (p.month < start || p.value == null) continue;
      // A sold animal counts in its sale month only if it was still here at the month end — it wasn't, so skip it.
      if (p.sold) continue;
      const row = totals.get(p.month) || { value: 0, weightKg: 0, head: 0, estimated: 0 };
      row.value += p.value; row.weightKg += p.weightKg; row.head += 1; if (p.estimated) row.estimated += 1;
      totals.set(p.month, row);
    }
    if (a.status === 'active' || (a.exitDate && a.exitDate >= `${start}-01`)) {
      animals.push({
        id: a.id, tagNo: a.tagNo, managementTag: a.managementTag, name: a.name, sex: a.sex, castrated: a.castrated, status: a.status,
        dob: r.dob, exitDate: a.status === 'active' ? null : a.exitDate, weightKg: r.currentWeightKg, value: r.currentValue,
        perMonth: r.perMonth, dailyGainKg: r.dailyGainKg, estimated: r.estimated, weighed: r.weighings.length,
      });
    }
  }
  const series = [...totals.entries()].sort(([x], [y]) => x.localeCompare(y))
    .map(([month, v]) => ({ month, value: Math.round(v.value), weightKg: Math.round(v.weightKg), head: v.head, estimated: v.estimated }));
  animals.sort((x, y) => (y.perMonth ?? -1) - (x.perMonth ?? -1));
  return c.json({ data: { species, series, animals, noDob } });
});

/** Every month from two years back to two months ahead: the farm's price (if set) and the Orkney Mart averages. */
value.get('/prices', async (c) => {
  const s = farmSession(c);
  const species = speciesParam(c.req.query('species'));
  const p = await loadPrices(c.get('db'), s.farmId, species);
  const t = today();
  const cats = species === 'sheep' ? ['lambs', 'hoggs', 'ewes'] : ['calves', 'steers', 'heifers', 'otm'];
  const first = [...p.own.keys()].sort()[0];
  let y = Number(t.slice(0, 4)) - 2, m = Number(t.slice(5, 7));
  if (first && first < `${y}-${String(m).padStart(2, '0')}`) { y = Number(first.slice(0, 4)); m = Number(first.slice(5, 7)); }
  const rows = [];
  const endKey = (() => { const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) + 1, 1)); return d.toISOString().slice(0, 7); })();
  for (let guard = 0; guard < 240; guard++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    const used = priceFor(p, month, [species === 'sheep' ? 'lambs' : 'steers']);
    rows.push({
      month, ppk: p.own.get(month) ?? null,
      mart: Object.fromEntries(cats.map((k) => [k, p.mart.get(k)?.get(month) ?? null])),
      used: used ? { ppk: used.ppk, source: used.source } : null,
    });
    if (month === endKey) break;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return c.json({ data: { species, months: rows.reverse() } });
});

value.put('/prices', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const data = await body(c, z.object({
    species: z.enum(['cattle', 'sheep']).default('cattle'),
    prices: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), ppk: z.number().min(1).max(5000).nullable() })).min(1).max(240),
  }));
  const clear = data.prices.filter((p) => p.ppk == null).map((p) => p.month);
  const set = data.prices.filter((p) => p.ppk != null);
  const stmts: any[] = [];
  if (clear.length) {
    stmts.push(db.delete(schema.monthlyPrices).where(and(eq(schema.monthlyPrices.farmId, s.farmId), eq(schema.monthlyPrices.species, data.species), inArray(schema.monthlyPrices.month, clear))));
  }
  for (const p of set) {
    stmts.push(db.insert(schema.monthlyPrices).values({ farmId: s.farmId, species: data.species, month: p.month, ppk: p.ppk! })
      .onConflictDoUpdate({ target: [schema.monthlyPrices.farmId, schema.monthlyPrices.species, schema.monthlyPrices.month], set: { ppk: p.ppk!, updatedAt: now() } }));
  }
  if (stmts.length) await db.batch(stmts as [any, ...any[]]);
  await logActivity(c, 'updated', 'prices', null, `Monthly ${data.species} prices updated (${set.length} set${clear.length ? `, ${clear.length} cleared` : ''})`);
  return c.json({ data: { set: set.length, cleared: clear.length } });
});

export default value;
