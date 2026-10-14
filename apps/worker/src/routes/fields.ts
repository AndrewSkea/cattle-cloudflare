/**
 * Field records: crops (what is growing, from sowing to harvest), the field timeline (fertiliser, lime, slurry,
 * minerals, sprays, field work, harvests, grazing, soil tests, notes; done or planned) and readings, optionally
 * at points in the field (soil moisture, grass height, pH…). Costs become Finance transactions.
 */

import { Hono } from 'hono';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';
import { type AppEnv, type Ctx, HttpError, body, farmSession, idParam, logActivity, notFound, now, requireRole, today } from '../lib/context';
import { CROP_PURPOSES, CROP_STATUS, CROPS, FIELD_EVENT_TYPES, READING_KINDS, isoDate, optDate, optId, optPosNum, optText } from '../lib/validators';
import { deleteSourceTxn, syncSourceTxn } from '../services/finance';

const fields = new Hono<AppEnv>();

const TYPE_LABEL: Record<string, string> = {
  sowing: 'Sowing', fertiliser: 'Fertiliser', lime: 'Lime', slurry: 'Slurry / muck', minerals: 'Minerals', spray: 'Spray',
  cultivation: 'Field work', harvest: 'Harvest', grazing: 'Grazing', soil_test: 'Soil test', reading: 'Readings', note: 'Note',
};
const COST_CATEGORY: Record<string, string> = {
  sowing: 'fertiliser_seed', fertiliser: 'fertiliser_seed', lime: 'fertiliser_seed', slurry: 'fertiliser_seed', minerals: 'fertiliser_seed', spray: 'fertiliser_seed',
};

const readingInput = z.object({
  kind: z.enum(READING_KINDS),
  label: optText(60),
  value: z.coerce.number().finite(),
  unit: optText(20),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
});

const eventInput = z.object({
  type: z.enum(FIELD_EVENT_TYPES),
  status: z.enum(['done', 'planned']).default('done'),
  date: isoDate,
  endDate: optDate,
  cropId: optId,
  product: optText(200),
  rate: optPosNum,
  rateUnit: optText(20),
  areaHa: optPosNum,
  nKgHa: optPosNum,
  pKgHa: optPosNum,
  kKgHa: optPosNum,
  sKgHa: optPosNum,
  yieldAmount: optPosNum,
  yieldUnit: optText(20),
  moisturePct: z.coerce.number().min(0).max(100).nullish().or(z.literal('').transform(() => null)),
  dryMatterPct: z.coerce.number().min(0).max(100).nullish().or(z.literal('').transform(() => null)),
  noGrazeUntil: optDate,
  cost: optPosNum,
  contractor: optText(100),
  equipmentId: optId,
  notes: optText(5000),
  readings: z.array(readingInput).max(300).default([]),
  /** Harvest only: the crop is finished (ends it on this date) */
  finishesCrop: z.boolean().optional(),
});

const cropInput = z.object({
  crop: z.enum(CROPS),
  variety: optText(100),
  purpose: z.enum(CROP_PURPOSES).default('grazing'),
  status: z.enum(CROP_STATUS).default('growing'),
  startDate: optDate,
  expectedHarvest: optDate,
  endDate: optDate,
  notes: optText(5000),
  /** Optional sowing record created with the crop */
  sowing: z.object({ product: optText(200), rate: optPosNum, rateUnit: optText(20), cost: optPosNum, contractor: optText(100) }).nullish(),
});

async function loadParcel(c: Ctx) {
  const p = await c.get('db').select().from(schema.landParcels)
    .where(and(eq(schema.landParcels.id, idParam(c)), eq(schema.landParcels.farmId, farmSession(c).farmId))).get();
  if (!p) throw notFound('Field');
  return p;
}

type Parcel = typeof schema.landParcels.$inferSelect;
type FieldEvent = typeof schema.fieldEvents.$inferSelect;

async function syncEventCost(c: Ctx, p: Parcel, e: FieldEvent) {
  const s = farmSession(c);
  const category = COST_CATEGORY[e.type] || (e.contractor ? 'contractors' : ['cultivation', 'harvest'].includes(e.type) ? 'machinery' : 'other_expense');
  await syncSourceTxn(c.get('db'), s.farmId, s.userId, 'field_event', e.id, e.status === 'done' && e.cost ? {
    type: 'expense', category, amount: e.cost, date: e.date, parcelId: p.id, counterparty: e.contractor, equipmentId: e.equipmentId,
    description: `${p.name}: ${TYPE_LABEL[e.type] || e.type}${e.product ? ` — ${e.product}` : ''}`,
  } : null);
}

/** The crop in the field on a date: started on or before it and not ended before it (latest first). */
async function cropOn(c: Ctx, parcelId: number, date: string) {
  const crops = await c.get('db').select().from(schema.fieldCrops).where(eq(schema.fieldCrops.parcelId, parcelId))
    .orderBy(desc(schema.fieldCrops.startDate), desc(schema.fieldCrops.id)).all();
  return crops.find((x) => (!x.startDate || x.startDate <= date) && (!x.endDate || x.endDate >= date) && x.status !== 'planned')
    ?? crops.find((x) => x.status === 'planned' && (!x.startDate || x.startDate <= addYear(date)));
}
const addYear = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;

async function checkRefs(c: Ctx, parcelId: number, d: { cropId?: number | null; equipmentId?: number | null }) {
  const s = farmSession(c);
  const db = c.get('db');
  if (d.cropId) {
    const crop = await db.select({ id: schema.fieldCrops.id }).from(schema.fieldCrops)
      .where(and(eq(schema.fieldCrops.id, d.cropId), eq(schema.fieldCrops.parcelId, parcelId), eq(schema.fieldCrops.farmId, s.farmId))).get();
    if (!crop) throw new HttpError(422, 'Crop not found in this field');
  }
  if (d.equipmentId) {
    const eq_ = await db.select({ id: schema.equipment.id }).from(schema.equipment)
      .where(and(eq(schema.equipment.id, d.equipmentId), eq(schema.equipment.farmId, s.farmId))).get();
    if (!eq_) throw new HttpError(422, 'Equipment not found on this farm');
  }
}

async function writeReadings(c: Ctx, p: Parcel, e: FieldEvent, readings: z.infer<typeof readingInput>[]) {
  const db = c.get('db');
  await db.delete(schema.fieldReadings).where(eq(schema.fieldReadings.eventId, e.id));
  // D1 allows 100 bound parameters per statement: 11 columns → 9 rows per insert
  for (let i = 0; i < readings.length; i += 9) {
    await db.insert(schema.fieldReadings).values(readings.slice(i, i + 9).map((r) => ({
      ...r, farmId: p.farmId, parcelId: p.id, eventId: e.id, date: e.date,
    })));
  }
}

/** Grazing per field from animal moves, plus manual grazing records. */
async function grazingByParcel(c: Ctx) {
  const s = farmSession(c);
  const db = c.get('db');
  const [moves, stock, manual] = await Promise.all([
    db.select({ animalId: schema.movements.animalId, date: schema.movements.date, from: schema.movements.fromParcelId, to: schema.movements.toParcelId })
      .from(schema.movements).where(eq(schema.movements.farmId, s.farmId)).orderBy(asc(schema.movements.date), asc(schema.movements.id)).all(),
    db.select({ id: schema.animals.id, parcelId: schema.animals.parcelId }).from(schema.animals)
      .where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.status, 'active'))).all(),
    db.select({ parcelId: schema.fieldEvents.parcelId, date: schema.fieldEvents.date, endDate: schema.fieldEvents.endDate }).from(schema.fieldEvents)
      .where(and(eq(schema.fieldEvents.farmId, s.farmId), eq(schema.fieldEvents.type, 'grazing'), eq(schema.fieldEvents.status, 'done'))).all(),
  ]);
  const t = today();
  const out = new Map<number, { head: number; since: string | null; lastOut: string | null; history: { date: string; in: number; out: number }[] }>();
  const get = (id: number) => { if (!out.has(id)) out.set(id, { head: 0, since: null, lastOut: null, history: [] }); return out.get(id)!; };
  const lastIn = new Map<number, string>(); // animal → latest move-in date to its current field
  for (const m of moves) {
    if (m.to) {
      const g = get(m.to);
      const h = g.history[g.history.length - 1];
      if (h?.date === m.date) h.in++; else g.history.push({ date: m.date, in: 1, out: 0 });
      lastIn.set(m.animalId, m.date);
    }
    if (m.from && m.from !== m.to) {
      const g = get(m.from);
      if (!g.lastOut || m.date > g.lastOut) g.lastOut = m.date;
      const h = g.history[g.history.length - 1];
      if (h?.date === m.date) h.out++; else g.history.push({ date: m.date, in: 0, out: 1 });
    }
  }
  for (const a of stock) {
    if (!a.parcelId) continue;
    const g = get(a.parcelId);
    g.head++;
    const d = lastIn.get(a.id);
    if (d && (!g.since || d < g.since)) g.since = d;
  }
  for (const m of manual) {
    const g = get(m.parcelId);
    const end = m.endDate && m.endDate <= t ? m.endDate : m.endDate ? null : m.date;
    if (end && (!g.lastOut || end > g.lastOut)) g.lastOut = end;
  }
  return out;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// ---------- Overview: every field at a glance + the season chart ----------

fields.get('/', requireRole('viewer'), async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const t = today();
  const year = Number(c.req.query('year')) || Number(t.slice(0, 4));
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const [parcels, crops, events, soil, grazing] = await Promise.all([
    db.select({ id: schema.landParcels.id, name: schema.landParcels.name, areaHa: schema.landParcels.areaHa, landUse: schema.landParcels.landUse })
      .from(schema.landParcels).where(eq(schema.landParcels.farmId, s.farmId)).orderBy(asc(schema.landParcels.name)).all(),
    db.select().from(schema.fieldCrops).where(eq(schema.fieldCrops.farmId, s.farmId)).orderBy(desc(schema.fieldCrops.startDate), desc(schema.fieldCrops.id)).all(),
    db.select({
      id: schema.fieldEvents.id, parcelId: schema.fieldEvents.parcelId, type: schema.fieldEvents.type, status: schema.fieldEvents.status,
      date: schema.fieldEvents.date, endDate: schema.fieldEvents.endDate, product: schema.fieldEvents.product, noGrazeUntil: schema.fieldEvents.noGrazeUntil,
      nKgHa: schema.fieldEvents.nKgHa, pKgHa: schema.fieldEvents.pKgHa, kKgHa: schema.fieldEvents.kKgHa, areaHa: schema.fieldEvents.areaHa,
    }).from(schema.fieldEvents).where(eq(schema.fieldEvents.farmId, s.farmId)).orderBy(desc(schema.fieldEvents.date), desc(schema.fieldEvents.id)).all(),
    db.select({ parcelId: schema.fieldReadings.parcelId, date: schema.fieldReadings.date, value: schema.fieldReadings.value })
      .from(schema.fieldReadings).where(and(eq(schema.fieldReadings.farmId, s.farmId), eq(schema.fieldReadings.kind, 'ph'))).orderBy(desc(schema.fieldReadings.date)).all(),
    grazingByParcel(c),
  ]);

  const rows = parcels.map((p) => {
    const mine = events.filter((e) => e.parcelId === p.id);
    const done = mine.filter((e) => e.status === 'done');
    const crop = crops.find((x) => x.parcelId === p.id && x.status !== 'planned' && (!x.endDate || x.endDate >= t) && (!x.startDate || x.startDate <= t)) ?? null;
    const nextCrop = crops.filter((x) => x.parcelId === p.id && x.status === 'planned').sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))[0] ?? null;
    const planned = mine.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));
    const noGraze = done.map((e) => e.noGrazeUntil).filter((d): d is string => !!d && d >= t).sort().pop() ?? null;
    // Nutrients applied this calendar year, per hectare of the whole field (part-field applications scaled down)
    const nut = { n: 0, p: 0, k: 0 };
    for (const e of done) {
      if (e.date < from || e.date > to) continue;
      const share = e.areaHa && p.areaHa ? Math.min(1, e.areaHa / p.areaHa) : 1;
      nut.n += (e.nKgHa || 0) * share; nut.p += (e.pKgHa || 0) * share; nut.k += (e.kKgHa || 0) * share;
    }
    const soilTests = done.filter((e) => e.type === 'soil_test');
    const ph = soil.find((r) => r.parcelId === p.id);
    const g = grazing.get(p.id);
    return {
      parcelId: p.id, crop, nextCrop,
      lastEvent: done.find((e) => e.type !== 'note') ?? null,
      nextPlanned: planned[0] ?? null,
      plannedCount: planned.length,
      noGrazeUntil: noGraze,
      nutrients: { n: Math.round(nut.n), p: Math.round(nut.p), k: Math.round(nut.k) },
      lastSoilTest: soilTests[0]?.date ?? null,
      lastPh: ph ? { value: ph.value, date: ph.date } : null,
      grazing: { head: g?.head ?? 0, since: g?.since ?? null, lastOut: g?.lastOut ?? null, restDays: !g?.head && g?.lastOut ? daysBetween(g.lastOut, t) : null },
    };
  });

  return c.json({
    data: {
      year,
      fields: rows,
      crops: crops.filter((x) => (!x.startDate || x.startDate <= to) && (!x.endDate || x.endDate >= from)),
      events: events.filter((e) => e.date >= from && e.date <= to).map(({ id, parcelId, type, status, date, endDate, product }) => ({ id, parcelId, type, status, date, endDate, product })),
      planned: events.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 50)
        .map(({ id, parcelId, type, date, product }) => ({ id, parcelId, type, date, product })),
    },
  });
});

// ---------- One field ----------

fields.get('/:id', requireRole('viewer'), async (c) => {
  const p = await loadParcel(c);
  const db = c.get('db');
  const [crops, events, readings, grazing, stock] = await Promise.all([
    db.select().from(schema.fieldCrops).where(eq(schema.fieldCrops.parcelId, p.id)).orderBy(desc(schema.fieldCrops.startDate), desc(schema.fieldCrops.id)).all(),
    db.select().from(schema.fieldEvents).where(eq(schema.fieldEvents.parcelId, p.id)).orderBy(desc(schema.fieldEvents.date), desc(schema.fieldEvents.id)).all(),
    db.select().from(schema.fieldReadings).where(eq(schema.fieldReadings.parcelId, p.id)).orderBy(asc(schema.fieldReadings.date), asc(schema.fieldReadings.id)).all(),
    grazingByParcel(c),
    db.select({ species: schema.animals.species }).from(schema.animals)
      .where(and(eq(schema.animals.farmId, p.farmId), eq(schema.animals.parcelId, p.id), eq(schema.animals.status, 'active'))).all(),
  ]);
  const byEvent = new Map<number, typeof readings>();
  for (const r of readings) { if (!byEvent.has(r.eventId)) byEvent.set(r.eventId, []); byEvent.get(r.eventId)!.push(r); }
  const g = grazing.get(p.id);
  const t = today();
  const animalsBySpecies: Record<string, number> = {};
  for (const a of stock) animalsBySpecies[a.species] = (animalsBySpecies[a.species] || 0) + 1;
  return c.json({
    data: {
      parcel: { ...p, animalCount: stock.length, animalsBySpecies },
      crops,
      events: events.map((e) => ({ ...e, readings: byEvent.get(e.id) || [] })),
      grazing: {
        head: g?.head ?? 0, since: g?.since ?? null, lastOut: g?.lastOut ?? null,
        restDays: !g?.head && g?.lastOut ? daysBetween(g.lastOut, t) : null,
        history: (g?.history ?? []).slice(-60).reverse(),
      },
    },
  });
});

// ---------- Crops ----------

fields.post('/:id/crops', requireRole('worker'), async (c) => {
  const s = farmSession(c);
  const p = await loadParcel(c);
  const { sowing, ...d } = await body(c, cropInput);
  const db = c.get('db');
  if (d.status === 'growing' && d.startDate && d.startDate > today()) d.status = 'planned';
  // A new growing crop ends the one before it (the day before it went in)
  if (d.status === 'growing') {
    const prev = await db.select().from(schema.fieldCrops)
      .where(and(eq(schema.fieldCrops.parcelId, p.id), eq(schema.fieldCrops.status, 'growing'))).all();
    for (const x of prev) {
      if (d.startDate && x.startDate && x.startDate >= d.startDate) continue;
      await db.update(schema.fieldCrops).set({ status: 'finished', endDate: x.endDate ?? d.startDate ?? today(), updatedAt: now() }).where(eq(schema.fieldCrops.id, x.id));
    }
  }
  const [crop] = await db.insert(schema.fieldCrops).values({ ...d, farmId: s.farmId, parcelId: p.id }).returning();
  if (sowing && (d.startDate || d.status === 'planned')) {
    const [e] = await db.insert(schema.fieldEvents).values({
      farmId: s.farmId, parcelId: p.id, cropId: crop.id, type: 'sowing', status: crop.status === 'planned' ? 'planned' : 'done',
      date: d.startDate ?? today(), product: sowing.product ?? cropName(d.crop, d.variety), rate: sowing.rate, rateUnit: sowing.rateUnit,
      cost: sowing.cost, contractor: sowing.contractor, createdBy: s.userId,
    }).returning();
    await syncEventCost(c, p, e);
  }
  await logActivity(c, 'created', 'land', p.id, `${p.name}: ${crop.status === 'planned' ? 'planned' : 'added'} ${cropName(crop.crop, crop.variety)}`);
  return c.json({ data: crop }, 201);
});

fields.put('/:id/crops/:cropId', requireRole('worker'), async (c) => {
  const p = await loadParcel(c);
  const { sowing: _, ...d } = await body(c, cropInput.partial());
  const [crop] = await c.get('db').update(schema.fieldCrops).set({ ...d, updatedAt: now() })
    .where(and(eq(schema.fieldCrops.id, idParam(c, 'cropId')), eq(schema.fieldCrops.parcelId, p.id))).returning();
  if (!crop) throw notFound('Crop');
  await logActivity(c, 'updated', 'land', p.id, `${p.name}: updated ${cropName(crop.crop, crop.variety)}`);
  return c.json({ data: crop });
});

fields.delete('/:id/crops/:cropId', requireRole('worker'), async (c) => {
  const p = await loadParcel(c);
  const [crop] = await c.get('db').delete(schema.fieldCrops)
    .where(and(eq(schema.fieldCrops.id, idParam(c, 'cropId')), eq(schema.fieldCrops.parcelId, p.id))).returning();
  if (!crop) throw notFound('Crop');
  await logActivity(c, 'deleted', 'land', p.id, `${p.name}: removed ${cropName(crop.crop, crop.variety)}`);
  return c.json({ ok: true });
});

// ---------- Timeline events ----------

async function saveEvent(c: Ctx, p: Parcel, d: z.infer<typeof eventInput>, id?: number) {
  const s = farmSession(c);
  const db = c.get('db');
  const { readings, finishesCrop, ...data } = d;
  await checkRefs(c, p.id, data);
  if (!data.cropId && !['soil_test', 'note'].includes(data.type)) data.cropId = (await cropOn(c, p.id, data.date))?.id ?? null;
  let e: FieldEvent | undefined;
  if (id) {
    [e] = await db.update(schema.fieldEvents).set({ ...data, updatedAt: now() })
      .where(and(eq(schema.fieldEvents.id, id), eq(schema.fieldEvents.parcelId, p.id))).returning();
    if (!e) throw notFound('Record');
  } else {
    [e] = await db.insert(schema.fieldEvents).values({ ...data, farmId: s.farmId, parcelId: p.id, createdBy: s.userId }).returning();
  }
  await writeReadings(c, p, e, readings);
  await syncEventCost(c, p, e);
  if (e.status === 'done' && e.cropId) {
    // Sowing a planned crop starts it; a final harvest finishes it
    const crop = await db.select().from(schema.fieldCrops).where(eq(schema.fieldCrops.id, e.cropId)).get();
    if (crop && e.type === 'sowing' && crop.status === 'planned') {
      await db.update(schema.fieldCrops).set({ status: 'growing', startDate: e.date, updatedAt: now() }).where(eq(schema.fieldCrops.id, crop.id));
    }
    if (crop && e.type === 'harvest' && finishesCrop) {
      await db.update(schema.fieldCrops).set({ status: 'finished', endDate: e.endDate ?? e.date, updatedAt: now() }).where(eq(schema.fieldCrops.id, crop.id));
    }
  }
  return e;
}

fields.post('/:id/events', requireRole('worker'), async (c) => {
  const p = await loadParcel(c);
  const e = await saveEvent(c, p, await body(c, eventInput));
  await logActivity(c, 'created', 'land', p.id, `${p.name}: ${e.status === 'planned' ? 'planned ' : ''}${(TYPE_LABEL[e.type] || e.type).toLowerCase()}${e.product ? ` (${e.product})` : ''}`);
  return c.json({ data: e }, 201);
});

fields.put('/:id/events/:eventId', requireRole('worker'), async (c) => {
  const p = await loadParcel(c);
  const e = await saveEvent(c, p, await body(c, eventInput), idParam(c, 'eventId'));
  await logActivity(c, 'updated', 'land', p.id, `${p.name}: updated ${(TYPE_LABEL[e.type] || e.type).toLowerCase()}`);
  return c.json({ data: e });
});

/** Tick off planned work: it becomes a done record on the given date (default today). */
fields.post('/:id/events/:eventId/done', requireRole('worker'), async (c) => {
  const p = await loadParcel(c);
  const { date } = await body(c, z.object({ date: isoDate.optional() }));
  const [e] = await c.get('db').update(schema.fieldEvents).set({ status: 'done', date: date ?? today(), updatedAt: now() })
    .where(and(eq(schema.fieldEvents.id, idParam(c, 'eventId')), eq(schema.fieldEvents.parcelId, p.id))).returning();
  if (!e) throw notFound('Record');
  await c.get('db').update(schema.fieldReadings).set({ date: e.date }).where(eq(schema.fieldReadings.eventId, e.id));
  await syncEventCost(c, p, e);
  if (e.type === 'sowing' && e.cropId) {
    await c.get('db').update(schema.fieldCrops).set({ status: 'growing', startDate: e.date, updatedAt: now() })
      .where(and(eq(schema.fieldCrops.id, e.cropId), eq(schema.fieldCrops.status, 'planned')));
  }
  await logActivity(c, 'updated', 'land', p.id, `${p.name}: done ${(TYPE_LABEL[e.type] || e.type).toLowerCase()}${e.product ? ` (${e.product})` : ''}`);
  return c.json({ data: e });
});

fields.delete('/:id/events/:eventId', requireRole('worker'), async (c) => {
  const s = farmSession(c);
  const p = await loadParcel(c);
  const [e] = await c.get('db').delete(schema.fieldEvents)
    .where(and(eq(schema.fieldEvents.id, idParam(c, 'eventId')), eq(schema.fieldEvents.parcelId, p.id))).returning();
  if (!e) throw notFound('Record');
  await deleteSourceTxn(c.get('db'), s.farmId, 'field_event', e.id);
  await logActivity(c, 'deleted', 'land', p.id, `${p.name}: deleted ${(TYPE_LABEL[e.type] || e.type).toLowerCase()}`);
  return c.json({ ok: true });
});

/** Finance rows for field records whose field (and so record) was deleted. */
export async function cleanFieldTxns(c: Ctx) {
  const s = farmSession(c);
  const live = c.get('db').select({ id: schema.fieldEvents.id }).from(schema.fieldEvents).where(eq(schema.fieldEvents.farmId, s.farmId));
  await c.get('db').delete(schema.transactions).where(and(
    eq(schema.transactions.farmId, s.farmId), eq(schema.transactions.source, 'field_event'),
    sql`${schema.transactions.sourceId} not in ${live}`,
  ));
}

/** Calendar and reminders: field work (done and planned) in a date range. */
export async function plannedFieldWork(db: DrizzleD1Database, farmId: number, from: string | null, to: string, onlyPlanned = false) {
  const rows = await db.select({
    id: schema.fieldEvents.id, parcelId: schema.fieldEvents.parcelId, type: schema.fieldEvents.type, status: schema.fieldEvents.status,
    date: schema.fieldEvents.date, product: schema.fieldEvents.product, field: schema.landParcels.name,
  }).from(schema.fieldEvents).innerJoin(schema.landParcels, eq(schema.landParcels.id, schema.fieldEvents.parcelId))
    .where(and(eq(schema.fieldEvents.farmId, farmId), from ? gte(schema.fieldEvents.date, from) : undefined, lte(schema.fieldEvents.date, to),
      onlyPlanned ? eq(schema.fieldEvents.status, 'planned') : undefined)).all();
  return rows.map((r) => ({ ...r, label: `${TYPE_LABEL[r.type] || r.type}${r.product ? `: ${r.product}` : ''}` }));
}

export function cropName(crop: string, variety?: string | null) {
  const name = crop.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());
  return variety ? `${name} (${variety})` : name;
}

export default fields;
