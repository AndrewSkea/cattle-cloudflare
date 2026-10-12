/**
 * Per-animal records: health, weights, breeding, births, movements.
 */

import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import {
  type AppEnv, HttpError, addDays, body, farmSession, idParam, logActivity, notFound, now, requireAccess, today,
} from '../lib/context';
import { HEALTH_TYPES, isoDate, optDate, optId, optPosNum, optText, reqText } from '../lib/validators';
import { animalInFarm } from '../services/livestock';
import { deleteSourceTxn, syncSourceTxn } from '../services/finance';

export const GESTATION_DAYS: Record<string, number> = { cattle: 283, sheep: 147, goat: 150, pig: 114, horse: 340 };

async function requireAnimal(c: any, farmId: number, animalId: number) {
  const a = await animalInFarm(c.get('db'), farmId, animalId);
  if (!a) throw new HttpError(422, 'Animal not found on this farm');
  return a;
}

async function tagMap(c: any, farmId: number) {
  const all = await c.get('db').select({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag, species: schema.animals.species, status: schema.animals.status })
    .from(schema.animals).where(eq(schema.animals.farmId, farmId)).all();
  return new Map<number, { tag: string; tagNo: string; species: string; status: string }>(
    all.map((a: any) => [a.id, { tag: a.managementTag || a.tagNo, tagNo: a.tagNo, species: a.species, status: a.status }]));
}

// ==================== HEALTH ====================

export const health = new Hono<AppEnv>();
health.use('*', requireAccess('viewer', 'worker'));

const healthInput = z.object({
  animalId: z.number().int().positive(),
  date: isoDate,
  type: z.enum(HEALTH_TYPES),
  title: reqText(150),
  product: optText(150),
  dose: optText(80),
  batchNo: optText(80),
  administeredBy: optText(100),
  vet: optText(100),
  result: optText(200),
  withdrawalMeatUntil: optDate,
  withdrawalMilkUntil: optDate,
  nextDueDate: optDate,
  cost: optPosNum,
  notes: optText(5000),
});

async function syncHealthCost(c: any, farmId: number, userId: number, r: typeof schema.healthRecords.$inferSelect, tag: string) {
  await syncSourceTxn(c.get('db'), farmId, userId, 'health', r.id, r.cost ? {
    type: 'expense', category: 'vet_medicine', amount: r.cost, date: r.date, description: `${r.title} — ${tag}`,
    counterparty: r.vet, animalId: r.animalId,
  } : null);
}

health.get('/', async (c) => {
  const s = farmSession(c);
  const conds = [eq(schema.healthRecords.farmId, s.farmId)];
  const { from, to, type } = c.req.query();
  if (from) conds.push(gte(schema.healthRecords.date, from));
  if (to) conds.push(lte(schema.healthRecords.date, to));
  if (type) conds.push(eq(schema.healthRecords.type, type));
  const [rows, tags] = await Promise.all([
    c.get('db').select().from(schema.healthRecords).where(and(...conds)).orderBy(desc(schema.healthRecords.date), desc(schema.healthRecords.id)).limit(2000).all(),
    tagMap(c, s.farmId),
  ]);
  return c.json({ data: rows.map((r) => ({ ...r, animalTag: tags.get(r.animalId)?.tag, species: tags.get(r.animalId)?.species })) });
});

/** Upcoming/overdue follow-ups: latest record per animal+title that has a next-due date. */
health.get('/due', async (c) => {
  const s = farmSession(c);
  const [rows, tags] = await Promise.all([
    c.get('db').select().from(schema.healthRecords).where(eq(schema.healthRecords.farmId, s.farmId)).orderBy(desc(schema.healthRecords.date), desc(schema.healthRecords.id)).all(),
    tagMap(c, s.farmId),
  ]);
  const seen = new Set<string>();
  const due = [];
  for (const r of rows) {
    const key = `${r.animalId}|${r.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.nextDueDate && tags.get(r.animalId)?.status === 'active') {
      due.push({ ...r, animalTag: tags.get(r.animalId)?.tag, overdue: r.nextDueDate < today() });
    }
  }
  due.sort((a, b) => a.nextDueDate!.localeCompare(b.nextDueDate!));
  return c.json({ data: due });
});

health.get('/withdrawals', async (c) => {
  const s = farmSession(c);
  const t = today();
  const [rows, tags] = await Promise.all([
    c.get('db').select().from(schema.healthRecords).where(and(eq(schema.healthRecords.farmId, s.farmId), isNotNull(schema.healthRecords.withdrawalMeatUntil), gte(schema.healthRecords.withdrawalMeatUntil, t))).all(),
    tagMap(c, s.farmId),
  ]);
  const milk = await c.get('db').select().from(schema.healthRecords).where(and(eq(schema.healthRecords.farmId, s.farmId), isNotNull(schema.healthRecords.withdrawalMilkUntil), gte(schema.healthRecords.withdrawalMilkUntil, t))).all();
  const byId = new Map([...rows, ...milk].map((r) => [r.id, r]));
  return c.json({ data: [...byId.values()].map((r) => ({ ...r, animalTag: tags.get(r.animalId)?.tag })) });
});

health.post('/', async (c) => {
  const s = farmSession(c);
  const data = await body(c, healthInput);
  const a = await requireAnimal(c, s.farmId, data.animalId);
  const [r] = await c.get('db').insert(schema.healthRecords).values({ ...data, farmId: s.farmId, createdBy: s.userId }).returning();
  await syncHealthCost(c, s.farmId, s.userId, r, a.tagNo);
  await logActivity(c, 'created', 'health', r.id, `${r.title} — ${a.tagNo}`);
  return c.json({ data: r }, 201);
});

health.put('/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const data = await body(c, healthInput);
  const a = await requireAnimal(c, s.farmId, data.animalId);
  const [r] = await c.get('db').update(schema.healthRecords).set({ ...data, updatedAt: now() })
    .where(and(eq(schema.healthRecords.id, id), eq(schema.healthRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Health record');
  await syncHealthCost(c, s.farmId, s.userId, r, a.tagNo);
  await logActivity(c, 'updated', 'health', id, `Updated ${r.title} — ${a.tagNo}`);
  return c.json({ data: r });
});

health.delete('/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const [r] = await c.get('db').delete(schema.healthRecords).where(and(eq(schema.healthRecords.id, id), eq(schema.healthRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Health record');
  await deleteSourceTxn(c.get('db'), s.farmId, 'health', id);
  await logActivity(c, 'deleted', 'health', id, `Deleted health record ${r.title}`);
  return c.json({ ok: true });
});

// ==================== WEIGHTS ====================

export const weights = new Hono<AppEnv>();
weights.use('*', requireAccess('viewer', 'worker'));

const weightInput = z.object({
  animalId: z.number().int().positive(),
  date: isoDate,
  weightKg: z.coerce.number().positive().max(5000),
  conditionScore: z.coerce.number().min(0).max(10).nullish(),
  notes: optText(1000),
});

weights.get('/', async (c) => {
  const s = farmSession(c);
  const [rows, tags] = await Promise.all([
    c.get('db').select().from(schema.weightRecords).where(eq(schema.weightRecords.farmId, s.farmId)).orderBy(desc(schema.weightRecords.date)).limit(5000).all(),
    tagMap(c, s.farmId),
  ]);
  return c.json({ data: rows.map((r) => ({ ...r, animalTag: tags.get(r.animalId)?.tag })) });
});

weights.post('/', async (c) => {
  const s = farmSession(c);
  const data = await body(c, weightInput);
  const a = await requireAnimal(c, s.farmId, data.animalId);
  const [r] = await c.get('db').insert(schema.weightRecords).values({ ...data, farmId: s.farmId, createdBy: s.userId }).returning();
  await logActivity(c, 'created', 'weight', r.id, `Weighed ${a.tagNo}: ${r.weightKg} kg`);
  return c.json({ data: r }, 201);
});

weights.put('/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const data = await body(c, weightInput);
  await requireAnimal(c, s.farmId, data.animalId);
  const [r] = await c.get('db').update(schema.weightRecords).set(data)
    .where(and(eq(schema.weightRecords.id, id), eq(schema.weightRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Weight record');
  return c.json({ data: r });
});

weights.delete('/:id', async (c) => {
  const s = farmSession(c);
  const [r] = await c.get('db').delete(schema.weightRecords).where(and(eq(schema.weightRecords.id, idParam(c)), eq(schema.weightRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Weight record');
  return c.json({ ok: true });
});

// ==================== BREEDING ====================

export const breeding = new Hono<AppEnv>();
breeding.use('*', requireAccess('viewer', 'worker'));

const breedingInput = z.object({
  animalId: z.number().int().positive(),
  event: z.enum(['service', 'scan', 'heat']),
  date: isoDate,
  method: z.enum(['natural', 'ai', 'et']).nullish(),
  sireId: optId,
  sireName: optText(100),
  scanResult: z.enum(['pregnant', 'empty', 'unknown']).nullish(),
  fetusCount: z.coerce.number().int().min(0).max(20).nullish(),
  expectedDueDate: optDate,
  outcome: z.enum(['pending', 'born', 'failed', 'aborted']).default('pending'),
  notes: optText(2000),
});

async function prepareBreeding(c: any, farmId: number, data: z.infer<typeof breedingInput>) {
  const a = await requireAnimal(c, farmId, data.animalId);
  if (a.sex !== 'female') throw new HttpError(422, `${a.tagNo} is not female`);
  if (data.sireId) {
    const sire = await animalInFarm(c.get('db'), farmId, data.sireId);
    if (!sire || sire.sex !== 'male') throw new HttpError(422, 'Sire must be a male animal on this farm');
  }
  let expectedDueDate = data.expectedDueDate ?? null;
  if (!expectedDueDate && data.event === 'service' && GESTATION_DAYS[a.species]) expectedDueDate = addDays(data.date, GESTATION_DAYS[a.species]);
  const outcome = data.event === 'scan' && data.scanResult === 'empty' ? 'failed' : data.outcome;
  return { a, values: { ...data, expectedDueDate: data.event === 'heat' ? null : expectedDueDate, outcome } };
}

breeding.get('/', async (c) => {
  const s = farmSession(c);
  const [rows, tags] = await Promise.all([
    c.get('db').select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, s.farmId)).orderBy(desc(schema.breedingRecords.date), desc(schema.breedingRecords.id)).all(),
    tagMap(c, s.farmId),
  ]);
  return c.json({
    data: rows.map((r) => ({
      ...r, animalTag: tags.get(r.animalId)?.tag, animalStatus: tags.get(r.animalId)?.status,
      sireTag: r.sireId ? tags.get(r.sireId)?.tag : null,
      overdue: r.outcome === 'pending' && !!r.expectedDueDate && r.expectedDueDate < today(),
    })),
  });
});

breeding.post('/', async (c) => {
  const s = farmSession(c);
  const { a, values } = await prepareBreeding(c, s.farmId, await body(c, breedingInput));
  const [r] = await c.get('db').insert(schema.breedingRecords).values({ ...values, farmId: s.farmId, createdBy: s.userId }).returning();
  await logActivity(c, 'created', 'breeding', r.id, `${values.event[0].toUpperCase() + values.event.slice(1)} recorded for ${a.tagNo}`);
  return c.json({ data: r }, 201);
});

/**
 * Scan results for a batch of females on one day (the scanner's visit). Each result is stored as a scan that keeps
 * the sire and due date of her latest pending service unless a due date is given; "empty" closes that service.
 */
breeding.post('/scans', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const { date, results } = await body(c, z.object({
    date: isoDate,
    results: z.array(z.object({
      animalId: z.number().int().positive(),
      result: z.enum(['pregnant', 'empty', 'unknown']),
      fetusCount: z.coerce.number().int().min(0).max(20).nullish(),
      expectedDueDate: optDate,
    })).min(1).max(500),
  }));
  // Whole-farm reads: D1 allows 100 bound parameters, which a large batch in an IN (...) list would exceed.
  const [females, pending] = await Promise.all([
    db.select({ id: schema.animals.id, sex: schema.animals.sex, tagNo: schema.animals.tagNo }).from(schema.animals)
      .where(eq(schema.animals.farmId, s.farmId)).all(),
    db.select().from(schema.breedingRecords)
      .where(and(eq(schema.breedingRecords.farmId, s.farmId), eq(schema.breedingRecords.outcome, 'pending'),
        eq(schema.breedingRecords.event, 'service'), lte(schema.breedingRecords.date, date)))
      .orderBy(desc(schema.breedingRecords.date)).all(),
  ]);
  const byId = new Map(females.map((a) => [a.id, a]));
  for (const r of results) {
    const a = byId.get(r.animalId);
    if (!a) throw new HttpError(422, 'Animal not found on this farm');
    if (a.sex !== 'female') throw new HttpError(422, `${a.tagNo} is not female`);
  }
  const lastService = new Map<number, typeof pending[number]>();
  for (const p of pending) if (!lastService.has(p.animalId)) lastService.set(p.animalId, p);

  const rows = results.map((r) => {
    const svc = lastService.get(r.animalId);
    return {
      farmId: s.farmId, animalId: r.animalId, event: 'scan', date, scanResult: r.result, fetusCount: r.fetusCount ?? null,
      sireId: svc?.sireId ?? null, sireName: svc?.sireName ?? null, method: svc?.method ?? null,
      expectedDueDate: r.result === 'empty' ? null : r.expectedDueDate ?? svc?.expectedDueDate ?? null,
      outcome: r.result === 'empty' ? 'failed' : 'pending', createdBy: s.userId,
    };
  });
  // D1 caps bound parameters per statement, so insert in chunks.
  for (let i = 0; i < rows.length; i += 6) await db.insert(schema.breedingRecords).values(rows.slice(i, i + 6));
  const empty = results.filter((r) => r.result === 'empty').map((r) => r.animalId);
  for (let i = 0; i < empty.length; i += 80) {
    await db.update(schema.breedingRecords).set({ outcome: 'failed', updatedAt: now() })
      .where(and(eq(schema.breedingRecords.farmId, s.farmId), inArray(schema.breedingRecords.animalId, empty.slice(i, i + 80)),
        eq(schema.breedingRecords.outcome, 'pending'), lte(schema.breedingRecords.date, date)));
  }
  const inCalf = results.filter((r) => r.result === 'pregnant').length;
  await logActivity(c, 'created', 'breeding', null, `Scan results: ${inCalf} in calf, ${empty.length} empty${results.length - inCalf - empty.length ? `, ${results.length - inCalf - empty.length} unsure` : ''}`);
  return c.json({ data: { saved: results.length, pregnant: inCalf, empty: empty.length } }, 201);
});

breeding.put('/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const { values } = await prepareBreeding(c, s.farmId, await body(c, breedingInput));
  const [r] = await c.get('db').update(schema.breedingRecords).set({ ...values, updatedAt: now() })
    .where(and(eq(schema.breedingRecords.id, id), eq(schema.breedingRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Breeding record');
  return c.json({ data: r });
});

breeding.delete('/:id', async (c) => {
  const s = farmSession(c);
  const [r] = await c.get('db').delete(schema.breedingRecords).where(and(eq(schema.breedingRecords.id, idParam(c)), eq(schema.breedingRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Breeding record');
  return c.json({ ok: true });
});

// ==================== BIRTHS ====================

export const births = new Hono<AppEnv>();
births.use('*', requireAccess('viewer', 'worker'));

const birthInput = z.object({
  damId: z.number().int().positive(),
  date: isoDate,
  sex: z.enum(['female', 'male']).nullish(),
  sireId: optId,
  sireName: optText(100),
  ease: z.enum(['unassisted', 'easy_pull', 'hard_pull', 'vet', 'caesarean']).nullish(),
  outcome: z.enum(['alive', 'stillborn', 'died']).default('alive'),
  birthWeightKg: optPosNum,
  offspringId: optId,
  notes: optText(2000),
  // Optionally register the newborn in the same step
  offspring: z.object({
    tagNo: reqText(50), managementTag: optText(50), name: optText(100), breed: optText(80), colour: optText(80),
    parcelId: optId, structureId: optId,
  }).nullish(),
});

births.get('/', async (c) => {
  const s = farmSession(c);
  const [rows, tags] = await Promise.all([
    c.get('db').select().from(schema.birthRecords).where(eq(schema.birthRecords.farmId, s.farmId)).orderBy(desc(schema.birthRecords.date), desc(schema.birthRecords.id)).all(),
    tagMap(c, s.farmId),
  ]);
  return c.json({
    data: rows.map((r) => ({
      ...r, damTag: tags.get(r.damId)?.tag, offspringTag: r.offspringId ? tags.get(r.offspringId)?.tag : null,
      sireTag: r.sireId ? tags.get(r.sireId)?.tag : null,
    })),
  });
});

births.post('/', async (c) => {
  const s = farmSession(c);
  const data = await body(c, birthInput);
  const db = c.get('db');
  const dam = await requireAnimal(c, s.farmId, data.damId);
  if (dam.sex !== 'female') throw new HttpError(422, `${dam.tagNo} is not female`);
  if (dam.dob && data.date <= dam.dob) throw new HttpError(422, 'Birth date must be after the dam\'s date of birth');
  // +1 day: users east of UTC are already on "tomorrow"
  if (data.date > addDays(today(), 1)) throw new HttpError(422, 'Birth date cannot be in the future');
  if (data.sireId) {
    const sire = await animalInFarm(db, s.farmId, data.sireId);
    if (!sire || sire.sex !== 'male') throw new HttpError(422, 'Sire must be a male animal on this farm');
  }

  const { offspring, ...rec } = data;
  let offspringId = rec.offspringId ?? null;
  if (offspring && rec.outcome === 'alive') {
    if (!rec.sex) throw new HttpError(422, 'Choose the sex of the newborn to register it');
    try {
      const [o] = await db.insert(schema.animals).values({
        farmId: s.farmId, species: dam.species, sex: rec.sex, dob: rec.date, birthYear: Number(rec.date.slice(0, 4)),
        damId: dam.id, sireId: rec.sireId ?? null, sireName: rec.sireName, breed: offspring.breed ?? dam.breed,
        tagNo: offspring.tagNo, managementTag: offspring.managementTag, name: offspring.name, colour: offspring.colour,
        parcelId: offspring.parcelId ?? dam.parcelId, structureId: offspring.structureId ?? dam.structureId, origin: 'born',
      }).returning();
      offspringId = o.id;
      if (rec.birthWeightKg) await db.insert(schema.weightRecords).values({ farmId: s.farmId, animalId: o.id, date: rec.date, weightKg: rec.birthWeightKg, notes: 'Birth weight', createdBy: s.userId });
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) throw new HttpError(409, `Tag ${offspring.tagNo} is already used on this farm`);
      throw e;
    }
  } else if (offspringId) {
    const o = await animalInFarm(db, s.farmId, offspringId);
    if (!o) throw new HttpError(422, 'Offspring not found');
    if (o.damId !== dam.id) await db.update(schema.animals).set({ damId: dam.id }).where(eq(schema.animals.id, o.id));
  }

  const [r] = await db.insert(schema.birthRecords).values({ ...rec, offspringId, farmId: s.farmId, createdBy: s.userId }).returning();

  // A birth resolves every earlier pending service/scan for this dam.
  await db.update(schema.breedingRecords).set({ outcome: 'born', updatedAt: now() })
    .where(and(eq(schema.breedingRecords.animalId, dam.id), eq(schema.breedingRecords.outcome, 'pending'), lte(schema.breedingRecords.date, rec.date)));
  await logActivity(c, 'created', 'birth', r.id, `${dam.tagNo} gave birth${offspring ? ` — ${offspring.tagNo}` : ''}`);
  return c.json({ data: r, offspringId }, 201);
});

births.put('/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const { offspring: _ignored, ...data } = await body(c, birthInput);
  await requireAnimal(c, s.farmId, data.damId);
  if (data.offspringId) await requireAnimal(c, s.farmId, data.offspringId);
  const [r] = await c.get('db').update(schema.birthRecords).set({ ...data, updatedAt: now() })
    .where(and(eq(schema.birthRecords.id, id), eq(schema.birthRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Birth record');
  return c.json({ data: r });
});

births.delete('/:id', async (c) => {
  const s = farmSession(c);
  const [r] = await c.get('db').delete(schema.birthRecords).where(and(eq(schema.birthRecords.id, idParam(c)), eq(schema.birthRecords.farmId, s.farmId))).returning();
  if (!r) throw notFound('Birth record');
  return c.json({ ok: true });
});

// ==================== MOVEMENTS ====================

export const movements = new Hono<AppEnv>();
movements.use('*', requireAccess('viewer', 'worker'));

movements.get('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const [rows, tags, parcels, structures] = await Promise.all([
    db.select().from(schema.movements).where(eq(schema.movements.farmId, s.farmId)).orderBy(desc(schema.movements.date), desc(schema.movements.id)).limit(1000).all(),
    tagMap(c, s.farmId),
    db.select({ id: schema.landParcels.id, name: schema.landParcels.name }).from(schema.landParcels).where(eq(schema.landParcels.farmId, s.farmId)).all(),
    db.select({ id: schema.structures.id, name: schema.structures.name }).from(schema.structures).where(eq(schema.structures.farmId, s.farmId)).all(),
  ]);
  const pn = new Map(parcels.map((p) => [p.id, p.name]));
  const sn = new Map(structures.map((p) => [p.id, p.name]));
  return c.json({
    data: rows.map((m) => ({
      ...m, animalTag: tags.get(m.animalId)?.tag, fromParcelName: m.fromParcelId ? pn.get(m.fromParcelId) : null,
      toParcelName: m.toParcelId ? pn.get(m.toParcelId) : null, toStructureName: m.toStructureId ? sn.get(m.toStructureId) : null,
    })),
  });
});

movements.delete('/:id', async (c) => {
  const s = farmSession(c);
  const [r] = await c.get('db').delete(schema.movements).where(and(eq(schema.movements.id, idParam(c)), eq(schema.movements.farmId, s.farmId))).returning();
  if (!r) throw notFound('Movement');
  return c.json({ ok: true });
});

