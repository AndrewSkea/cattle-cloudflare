/**
 * Mart sales: finds this farm's lots in Orkney Auction Mart reports and imports them as sales.
 */

import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, HttpError, body, farmSession, idParam, logActivity, notFound, now, requireAccess, requireRole } from '../lib/context';
import { isoDate } from '../lib/validators';
import { exitAnimal, reinstateAnimal } from '../services/exit';
import { MART_PROVIDER, breedName, lotCandidates, martConfig, matchFarm, pruneMatches, syncOrkneyMart } from '../services/mart/orkney';
import { prettySection, sellerKey } from '../services/mart/parse';

const mart = new Hono<AppEnv>();
mart.use('*', requireAccess('viewer', 'worker'));

const SALE_NOTE = 'Sale weight (Orkney Mart)';

async function integration(c: any, farmId: number) {
  return c.get('db').select().from(schema.farmIntegrations)
    .where(and(eq(schema.farmIntegrations.farmId, farmId), eq(schema.farmIntegrations.provider, MART_PROVIDER))).get() as Promise<typeof schema.farmIntegrations.$inferSelect | undefined>;
}

mart.get('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const row = await integration(c, s.farmId);
  const counts = await db.all<{ status: string; n: number }>(sql`SELECT status, COUNT(*) n FROM mart_matches WHERE farm_id = ${s.farmId} GROUP BY status`);
  const latest = await db.get<{ date: string | null; n: number }>(sql`SELECT MAX(date) date, COUNT(*) n FROM mart_reports`);
  return c.json({ data: {
    sellers: martConfig(row).sellers,
    lastSyncAt: row?.lastSyncAt ?? null,
    counts: Object.fromEntries(['new', 'imported', 'dismissed'].map((k) => [k, counts.find((x) => x.status === k)?.n ?? 0])),
    reports: latest?.n ?? 0,
    latestReport: latest?.date ?? null,
  } });
});

/** Seller names as printed in reports, for the "find your farm" search. */
mart.get('/sellers', async (c) => {
  const q = sellerKey(c.req.query('q') || '');
  if (q.length < 2) return c.json({ data: [] });
  const rows = await c.get('db').all<{ key: string; seller: string; lots: number; last: string }>(sql`
    SELECT seller_key key, MAX(seller) seller, COUNT(*) lots, MAX(date) last FROM mart_lots
    WHERE seller_key LIKE ${'%' + q + '%'} AND top = 0
    GROUP BY seller_key ORDER BY lots DESC LIMIT 25`);
  return c.json({ data: rows });
});

mart.put('/settings', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const { sellers } = await body(c, z.object({ sellers: z.array(z.string().trim().min(3).max(120)).max(10) }));
  const clean = [...new Set(sellers.map((x) => x.replace(/\s*,\s*/g, ', ').trim()))];
  const existing = await integration(c, s.farmId);
  const config = JSON.stringify({ sellers: clean });
  if (existing) await db.update(schema.farmIntegrations).set({ config, updatedAt: now() }).where(eq(schema.farmIntegrations.id, existing.id));
  else await db.insert(schema.farmIntegrations).values({ farmId: s.farmId, provider: MART_PROVIDER, config });
  await pruneMatches(db, s.farmId, clean);
  const added = await matchFarm(db, s.farmId, clean);
  await logActivity(c, 'updated', 'mart', null, `Mart seller names set to ${clean.join('; ') || 'none'}`);
  return c.json({ data: { sellers: clean, added } });
});

/** Fetch new reports now (also runs on a schedule). */
mart.post('/refresh', requireRole('worker'), async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const row = await integration(c, s.farmId);
  if (row?.lastSyncAt && Date.now() - Date.parse(row.lastSyncAt) < 2 * 60_000) {
    return c.json({ data: { skipped: true } });
  }
  let result;
  try {
    result = await syncOrkneyMart(db, { days: 45 });
  } catch (e) {
    throw new HttpError(422, `Couldn't reach Orkney Mart just now (${(e as Error).message}). Try again later.`);
  }
  if (row) {
    await matchFarm(db, s.farmId, martConfig(row).sellers);
    await db.update(schema.farmIntegrations).set({ lastSyncAt: now(), lastError: null }).where(eq(schema.farmIntegrations.id, row.id));
  }
  return c.json({ data: result });
});

mart.get('/matches', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const status = z.enum(['new', 'imported', 'dismissed']).catch('new').parse(c.req.query('status'));
  const rows = await db.all<any>(sql`
    SELECT m.id, m.status, m.animal_ids animalIds, m.decided_at decidedAt,
      l.id lotId, l.date, l.section, l.category, l.species, l.basis, l.seller, l.weight_kg weightKg, l.price,
      l.price_per_kg pricePerKg, l.breed_code breedCode, l.head_count headCount, l.buyer, l.top, l.raw,
      r.id reportId, r.title reportTitle, r.url reportUrl,
      (SELECT a.value FROM mart_averages a WHERE a.report_id = l.report_id AND a.category = l.category AND a.unit = 'ppk' AND (a.label LIKE 'Prime%') = (lower(l.section) LIKE '%prime%')
        ORDER BY (lower(substr(a.label, 1, 5)) = lower(substr(l.section, 1, 5))) DESC, (a.label LIKE 'Store%' OR a.label LIKE 'Prime%') DESC, a.id LIMIT 1) marketPpk,
      (SELECT a.label FROM mart_averages a WHERE a.report_id = l.report_id AND a.category = l.category AND a.unit = 'ppk' AND (a.label LIKE 'Prime%') = (lower(l.section) LIKE '%prime%')
        ORDER BY (lower(substr(a.label, 1, 5)) = lower(substr(l.section, 1, 5))) DESC, (a.label LIKE 'Store%' OR a.label LIKE 'Prime%') DESC, a.id LIMIT 1) marketLabel,
      (SELECT AVG(x.price_per_kg) FROM mart_lots x WHERE x.report_id = l.report_id AND x.category = l.category AND x.price_per_kg IS NOT NULL AND (lower(x.section) LIKE '%prime%') = (lower(l.section) LIKE '%prime%')) lotsAvgPpk
    FROM mart_matches m JOIN mart_lots l ON l.id = m.lot_id JOIN mart_reports r ON r.id = l.report_id
    WHERE m.farm_id = ${s.farmId} AND m.status = ${status}
    ORDER BY l.date DESC, l.top DESC, l.price DESC LIMIT 500`);
  const ids = [...new Set(rows.flatMap((r) => JSON.parse(r.animalIds || '[]') as number[]))];
  const tags = ids.length
    ? new Map((await db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag })
      .from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), inArray(schema.animals.id, ids))).all()).map((a) => [a.id, a]))
    : new Map();
  return c.json({ data: rows.map((r) => ({
    ...r, top: !!r.top, section: prettySection(r.section), breed: breedName(r.breedCode),
    animals: (JSON.parse(r.animalIds || '[]') as number[]).map((id) => tags.get(id)).filter(Boolean),
    animalIds: undefined,
    pricePerKg: r.pricePerKg ?? (r.weightKg >= 100 && r.species === 'cattle' ? Math.round((r.price * 1000) / r.weightKg) / 10 : null),
    ppkDerived: r.pricePerKg == null && r.weightKg >= 100 && r.species === 'cattle',
    marketPpk: r.marketPpk ?? (r.lotsAvgPpk ? Math.round(r.lotsAvgPpk * 10) / 10 : null),
    marketLabel: r.marketLabel ?? (r.lotsAvgPpk ? 'Average of listed lots' : null),
    lotsAvgPpk: undefined,
  })) });
});

async function matchWithLot(c: any, farmId: number, id: number) {
  const db = c.get('db');
  const m = await db.select().from(schema.martMatches).where(and(eq(schema.martMatches.id, id), eq(schema.martMatches.farmId, farmId))).get();
  if (!m) throw notFound('Mart sale');
  const lot = await db.select().from(schema.martLots).where(eq(schema.martLots.id, m.lotId)).get();
  if (!lot) throw notFound('Mart sale');
  return { m: m as typeof schema.martMatches.$inferSelect, lot: lot as schema.MartLot };
}

mart.get('/matches/:id/candidates', async (c) => {
  const s = farmSession(c);
  const { lot } = await matchWithLot(c, s.farmId, idParam(c));
  return c.json({ data: await lotCandidates(c.get('db'), s.farmId, lot) });
});

mart.post('/matches/:id/import', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const { m, lot } = await matchWithLot(c, s.farmId, idParam(c));
  if (m.status === 'imported') throw new HttpError(409, 'This sale has already been imported');
  const data = await body(c, z.object({ animalIds: z.array(z.number().int().positive()).min(1).max(100), overrideWithdrawal: z.boolean().default(false) }));
  const rows = await db.select().from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), inArray(schema.animals.id, data.animalIds))).all();
  if (rows.length !== new Set(data.animalIds).size) throw notFound('Animal');
  const clash = rows.find((a) => a.status !== 'active' && a.exitDate !== lot.date);
  if (clash) throw new HttpError(409, `${clash.tagNo} already left the herd on ${clash.exitDate}`);
  if (!data.overrideWithdrawal) {
    const w = await db.select({ animalId: schema.healthRecords.animalId, until: schema.healthRecords.withdrawalMeatUntil }).from(schema.healthRecords)
      .where(and(inArray(schema.healthRecords.animalId, data.animalIds), sql`${schema.healthRecords.withdrawalMeatUntil} >= ${lot.date}`)).all();
    if (w.length) {
      const tags = [...new Set(w.map((x) => rows.find((a) => a.id === x.animalId)?.tagNo))].join(', ');
      throw new HttpError(409, `${tags} ${w.length > 1 ? 'were' : 'was'} under a meat withdrawal period on the sale date.`, { code: 'withdrawal' });
    }
  }
  const reason = `Orkney Mart — ${prettySection(lot.section)}${lot.pricePerKg ? ` at ${lot.pricePerKg}p/kg` : ''}`;
  for (const a of rows) {
    await exitAnimal(c, a, {
      status: 'sold', exitDate: lot.date, exitReason: reason, salePrice: lot.price,
      saleWeightKg: lot.weightKg && lot.weightKg >= 100 ? lot.weightKg : null,
      buyer: lot.buyer || 'Orkney Auction Mart', overrideWithdrawal: true,
    });
    if (lot.weightKg && lot.weightKg >= 20 && rows.length === 1) {
      await db.insert(schema.weightRecords).values({ farmId: s.farmId, animalId: a.id, date: lot.date, weightKg: lot.weightKg, notes: SALE_NOTE, createdBy: s.userId });
    }
  }
  await db.update(schema.martMatches).set({ status: 'imported', animalIds: JSON.stringify(rows.map((a) => a.id)), decidedBy: s.userId, decidedAt: now() })
    .where(eq(schema.martMatches.id, m.id));
  await logActivity(c, 'imported', 'mart', m.id, `Imported mart sale of ${rows.map((a) => a.tagNo).join(', ')} (${lot.date}, £${lot.price})`);
  return c.json({ ok: true });
});

mart.post('/matches/:id/dismiss', async (c) => {
  const s = farmSession(c);
  const { m } = await matchWithLot(c, s.farmId, idParam(c));
  if (m.status === 'imported') throw new HttpError(409, 'Undo the import first');
  await c.get('db').update(schema.martMatches).set({ status: 'dismissed', decidedBy: s.userId, decidedAt: now() }).where(eq(schema.martMatches.id, m.id));
  return c.json({ ok: true });
});

/** Back to "to review". For an imported sale this also returns the animals to the herd. */
mart.post('/matches/:id/restore', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const { m, lot } = await matchWithLot(c, s.farmId, idParam(c));
  if (m.status === 'imported') {
    const ids = JSON.parse(m.animalIds || '[]') as number[];
    const rows = ids.length ? await db.select().from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), inArray(schema.animals.id, ids))).all() : [];
    for (const a of rows) {
      if (a.status === 'sold' && a.exitDate === lot.date) await reinstateAnimal(c, a);
      await db.delete(schema.weightRecords).where(and(eq(schema.weightRecords.animalId, a.id), eq(schema.weightRecords.date, lot.date), eq(schema.weightRecords.notes, SALE_NOTE)));
    }
    await logActivity(c, 'undone', 'mart', m.id, `Undid mart sale import (${lot.date})`);
  }
  await db.update(schema.martMatches).set({ status: 'new', animalIds: null, decidedBy: null, decidedAt: null }).where(eq(schema.martMatches.id, m.id));
  return c.json({ ok: true });
});

/** Dismiss every unreviewed sale before a date — handy after setting up, for sales already in your records. */
mart.post('/matches/dismiss-before', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const { date } = await body(c, z.object({ date: isoDate }));
  const res = await c.get('db').run(sql`
    UPDATE mart_matches SET status = 'dismissed', decided_by = ${s.userId}, decided_at = ${now()}
    WHERE farm_id = ${s.farmId} AND status = 'new' AND lot_id IN (SELECT id FROM mart_lots WHERE date < ${date})`);
  return c.json({ data: { dismissed: res.meta.changes ?? 0 } });
});

/** Monthly mart prices (p/kg) by class, with this farm's own imported sales alongside. */
mart.get('/prices', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const species = c.req.query('species') === 'sheep' ? 'sheep' : 'cattle';
  const since = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 7);
  const market = await db.all<{ month: string; category: string; ppk: number; n: number }>(sql`
    SELECT substr(date, 1, 7) month, category, ROUND(AVG(price_per_kg), 1) ppk, COUNT(*) n FROM mart_lots
    WHERE species = ${species} AND price_per_kg IS NOT NULL AND price_per_kg BETWEEN 50 AND 1500 AND substr(date, 1, 7) >= ${since}
    GROUP BY month, category HAVING n >= 3 ORDER BY month`);
  const mine = await db.all<{ month: string; category: string; ppk: number; n: number; total: number }>(sql`
    SELECT substr(l.date, 1, 7) month, l.category, ROUND(AVG(l.price_per_kg), 1) ppk, COUNT(*) n, SUM(l.price) total
    FROM mart_matches m JOIN mart_lots l ON l.id = m.lot_id
    WHERE m.farm_id = ${s.farmId} AND m.status = 'imported' AND l.species = ${species}
    GROUP BY month, l.category ORDER BY month`);
  return c.json({ data: { market, mine } });
});

export default mart;
