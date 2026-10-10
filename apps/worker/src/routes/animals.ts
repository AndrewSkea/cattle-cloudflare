/**
 * Livestock: animals CRUD, exits (sale/death), bulk actions, import/export, family trees.
 */

import { Hono } from 'hono';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import {
  type AppEnv, HttpError, body, farmSession, idParam, logActivity, notFound, now, requireAccess, requireRole,
  roleAtLeast, today, addDays,
} from '../lib/context';
import {
  ANIMAL_STATUS, HEALTH_TYPES, SPECIES, isoDate, optDate, optId, optNum, optPosNum, optText, reqText,
} from '../lib/validators';
import {
  ageMonths, animalInFarm, classify, descendantIds, families, familyReport, loadFarmGraph,
} from '../services/livestock';
import { syncSourceTxn, deleteSourceTxn } from '../services/finance';
import { exitAnimal, reinstateAnimal } from '../services/exit';

const animals = new Hono<AppEnv>();
animals.use('*', requireAccess('viewer', 'worker'));

const animalInput = z.object({
  species: z.enum(SPECIES).default('cattle'),
  tagNo: reqText(50),
  managementTag: optText(50),
  name: optText(100),
  sex: z.enum(['female', 'male']),
  castrated: z.boolean().default(false),
  breed: optText(80),
  colour: optText(80),
  dob: optDate,
  birthYear: z.coerce.number().int().min(1950).max(2100).nullish(),
  damId: optId,
  sireId: optId,
  sireName: optText(100),
  size: z.coerce.number().int().min(1).max(4).nullish(),
  parcelId: optId,
  structureId: optId,
  origin: z.enum(['born', 'purchased']).default('born'),
  purchaseDate: optDate,
  purchasePrice: optPosNum,
  purchaseSource: optText(150),
  notes: optText(5000),
});

type AnimalInput = z.infer<typeof animalInput>;

async function validateRelations(c: any, farmId: number, data: Partial<AnimalInput>, selfId?: number) {
  const db = c.get('db');
  if (data.dob && data.dob > addDays(today(), 1)) throw new HttpError(422, 'Date of birth cannot be in the future');
  if (data.damId) {
    if (data.damId === selfId) throw new HttpError(422, 'An animal cannot be its own dam');
    const dam = await animalInFarm(db, farmId, data.damId);
    if (!dam) throw new HttpError(422, 'Dam not found on this farm');
    if (dam.sex !== 'female') throw new HttpError(422, `${dam.tagNo} is not female so cannot be a dam`);
    if (data.dob && dam.dob && dam.dob >= data.dob) throw new HttpError(422, 'Dam must be born before her offspring');
  }
  if (data.sireId) {
    if (data.sireId === selfId) throw new HttpError(422, 'An animal cannot be its own sire');
    const sire = await animalInFarm(db, farmId, data.sireId);
    if (!sire) throw new HttpError(422, 'Sire not found on this farm');
    if (sire.sex !== 'male') throw new HttpError(422, `${sire.tagNo} is not male so cannot be a sire`);
  }
  if (selfId && (data.damId || data.sireId)) {
    const g = await loadFarmGraph(db, farmId);
    const desc = new Set(descendantIds(g, selfId).map((d) => d.id));
    if ((data.damId && desc.has(data.damId)) || (data.sireId && desc.has(data.sireId))) {
      throw new HttpError(422, 'A parent cannot be one of this animal\'s descendants');
    }
  }
  if (data.parcelId) {
    const p = await db.select({ id: schema.landParcels.id }).from(schema.landParcels)
      .where(and(eq(schema.landParcels.id, data.parcelId), eq(schema.landParcels.farmId, farmId))).get();
    if (!p) throw new HttpError(422, 'Field not found');
  }
  if (data.structureId) {
    const s = await db.select({ id: schema.structures.id }).from(schema.structures)
      .where(and(eq(schema.structures.id, data.structureId), eq(schema.structures.farmId, farmId))).get();
    if (!s) throw new HttpError(422, 'Building not found');
  }
}

function birthYearOf(data: Partial<AnimalInput>) {
  return data.dob ? Number(data.dob.slice(0, 4)) : data.birthYear ?? null;
}

async function syncPurchaseTxn(c: any, farmId: number, userId: number, a: schema.Animal) {
  await syncSourceTxn(c.get('db'), farmId, userId, 'animal_purchase', a.id, a.origin === 'purchased' && a.purchasePrice ? {
    type: 'expense', category: 'livestock_purchases', amount: a.purchasePrice, date: a.purchaseDate || a.createdAt.slice(0, 10),
    description: `Purchase of ${a.tagNo}`, counterparty: a.purchaseSource, animalId: a.id,
  } : null);
}

function uniqueTagError(e: unknown, tag: string): never {
  if (String((e as Error)?.message || e).includes('UNIQUE')) throw new HttpError(409, `Tag ${tag} is already used on this farm`);
  throw e;
}

// ---------- List ----------

animals.get('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const status = c.req.query('status') || 'active';
  const species = c.req.query('species');

  const conds = [eq(schema.animals.farmId, s.farmId)];
  if (status === 'active') conds.push(eq(schema.animals.status, 'active'));
  if (species) conds.push(eq(schema.animals.species, species));

  const [rows, parcels, structures, births, weights, withdrawals, all] = await Promise.all([
    db.select().from(schema.animals).where(and(...conds)).all(),
    db.select({ id: schema.landParcels.id, name: schema.landParcels.name }).from(schema.landParcels).where(eq(schema.landParcels.farmId, s.farmId)).all(),
    db.select({ id: schema.structures.id, name: schema.structures.name }).from(schema.structures).where(eq(schema.structures.farmId, s.farmId)).all(),
    db.select({ damId: schema.birthRecords.damId }).from(schema.birthRecords).where(eq(schema.birthRecords.farmId, s.farmId)).all(),
    db.select({ animalId: schema.weightRecords.animalId, date: schema.weightRecords.date, weightKg: schema.weightRecords.weightKg })
      .from(schema.weightRecords).where(eq(schema.weightRecords.farmId, s.farmId)).orderBy(schema.weightRecords.date).all(),
    db.select({ animalId: schema.healthRecords.animalId, until: schema.healthRecords.withdrawalMeatUntil })
      .from(schema.healthRecords).where(and(eq(schema.healthRecords.farmId, s.farmId), gte(schema.healthRecords.withdrawalMeatUntil, today()))).all(),
    db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag, damId: schema.animals.damId, sireId: schema.animals.sireId })
      .from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all(),
  ]);

  const parcelName = new Map(parcels.map((p) => [p.id, p.name]));
  const structureName = new Map(structures.map((p) => [p.id, p.name]));
  const tagOf = new Map(all.map((a) => [a.id, a.managementTag || a.tagNo]));
  const birthsBy = new Map<number, number>();
  for (const b of births) birthsBy.set(b.damId, (birthsBy.get(b.damId) || 0) + 1);
  const offspring = new Map<number, number>();
  for (const a of all) for (const p of [a.damId, a.sireId]) if (p) offspring.set(p, (offspring.get(p) || 0) + 1);
  const latestWeight = new Map<number, { date: string; weightKg: number }>();
  for (const w of weights) latestWeight.set(w.animalId, w);
  const withdrawal = new Map<number, string>();
  for (const w of withdrawals) if (w.until && (!withdrawal.has(w.animalId) || w.until > withdrawal.get(w.animalId)!)) withdrawal.set(w.animalId, w.until);

  const data = rows
    .filter((a) => status !== 'exited' || a.status !== 'active')
    .map((a) => {
      const age = ageMonths(a.dob, a.birthYear);
      const lw = latestWeight.get(a.id);
      return {
        ...a,
        ageMonths: age,
        category: classify(a, age, (birthsBy.get(a.id) || 0) > 0 || (a.sex === 'female' && (offspring.get(a.id) || 0) > 0)),
        damTag: a.damId ? tagOf.get(a.damId) ?? null : null,
        sireTag: a.sireId ? tagOf.get(a.sireId) ?? null : a.sireName,
        parcelName: a.parcelId ? parcelName.get(a.parcelId) ?? null : null,
        structureName: a.structureId ? structureName.get(a.structureId) ?? null : null,
        offspringCount: offspring.get(a.id) || 0,
        latestWeightKg: lw?.weightKg ?? null,
        latestWeightDate: lw?.date ?? null,
        withdrawalUntil: withdrawal.get(a.id) ?? null,
      };
    });
  return c.json({ data });
});

/** Lightweight list for pickers (includes exited animals so history still resolves). */
animals.get('/options', async (c) => {
  const s = farmSession(c);
  const rows = await c.get('db').select({
    id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag, name: schema.animals.name,
    sex: schema.animals.sex, species: schema.animals.species, status: schema.animals.status, dob: schema.animals.dob, breed: schema.animals.breed,
  }).from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all();
  return c.json({ data: rows });
});

animals.get('/families', async (c) => {
  const s = farmSession(c);
  const g = await loadFarmGraph(c.get('db'), s.farmId);
  return c.json({ data: families(g, c.req.query('species') || undefined) });
});

animals.get('/export', async (c) => {
  const s = farmSession(c);
  const rows = await c.get('db').select().from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all();
  const tag = new Map(rows.map((r) => [r.id, r.tagNo]));
  const cols = ['tagNo', 'managementTag', 'name', 'species', 'sex', 'castrated', 'breed', 'colour', 'dob', 'damTag', 'sireTag', 'sireName',
    'status', 'origin', 'purchaseDate', 'purchasePrice', 'exitDate', 'exitReason', 'salePrice', 'saleWeightKg', 'buyer', 'carcaseWeightKg', 'carcaseGrade', 'notes'] as const;
  const esc = (v: unknown) => {
    const str = v == null ? '' : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [cols.join(',')];
  for (const r of rows) {
    const rec: Record<string, unknown> = { ...r, damTag: r.damId ? tag.get(r.damId) : '', sireTag: r.sireId ? tag.get(r.sireId) : '' };
    lines.push(cols.map((k) => esc(rec[k])).join(','));
  }
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="livestock-${today()}.csv"` },
  });
});

// ---------- Create / import ----------

animals.post('/', async (c) => {
  const s = farmSession(c);
  const data = await body(c, animalInput);
  await validateRelations(c, s.farmId, data);
  const db = c.get('db');
  let a: schema.Animal;
  try {
    [a] = await db.insert(schema.animals).values({ ...data, birthYear: birthYearOf(data), farmId: s.farmId }).returning();
  } catch (e) { uniqueTagError(e, data.tagNo); }
  if (a.parcelId || a.structureId) {
    await db.insert(schema.movements).values({ farmId: s.farmId, animalId: a.id, date: a.dob && a.origin === 'born' ? a.dob : today(), toParcelId: a.parcelId, toStructureId: a.structureId, notes: 'Initial location', createdBy: s.userId });
  }
  await syncPurchaseTxn(c, s.farmId, s.userId, a);
  await logActivity(c, 'created', 'animal', a.id, `Added ${a.species} ${a.tagNo}`);
  return c.json({ data: a }, 201);
});

animals.post('/import', async (c) => {
  const s = farmSession(c);
  const { rows } = await body(c, z.object({
    rows: z.array(z.object({
      tagNo: z.string().trim().min(1).max(50), managementTag: optText(50), name: optText(100),
      species: z.enum(SPECIES).default('cattle'), sex: z.string().trim(), breed: optText(80),
      dob: optDate, damTag: optText(50), sireTag: optText(50), sireName: optText(100), notes: optText(2000),
    })).min(1).max(2000),
  }));
  const db = c.get('db');
  const existing = await db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag })
    .from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all();
  const existingTags = new Set(existing.map((e) => e.tagNo));
  const errors: string[] = [];
  const toInsert: (typeof schema.animals.$inferInsert)[] = [];
  rows.forEach((r, i) => {
    const sexRaw = r.sex.toLowerCase();
    const sex = /^(f|fem|female|cow|heifer|ewe|doe|sow|gilt|mare|hen)/.test(sexRaw) ? 'female'
      : /^(m|male|bull|steer|ram|buck|boar|stallion|gelding|wether|cockerel)/.test(sexRaw) ? 'male' : null;
    if (!sex) { errors.push(`Row ${i + 2}: unknown sex "${r.sex}"`); return; }
    if (existingTags.has(r.tagNo)) { errors.push(`Row ${i + 2}: tag ${r.tagNo} already exists — skipped`); return; }
    existingTags.add(r.tagNo);
    toInsert.push({
      farmId: s.farmId, species: r.species, tagNo: r.tagNo, managementTag: r.managementTag, name: r.name, sex,
      castrated: /steer|wether|gelding|barrow/.test(sexRaw), breed: r.breed, dob: r.dob,
      birthYear: r.dob ? Number(r.dob.slice(0, 4)) : null, sireName: r.sireName, notes: r.notes,
    });
  });
  let created: { id: number; tagNo: string; managementTag: string | null }[] = [];
  for (let i = 0; i < toInsert.length; i += 50) {
    const chunk = await db.insert(schema.animals).values(toInsert.slice(i, i + 50))
      .returning({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag });
    created = created.concat(chunk);
  }
  // Second pass: resolve parent tags against the whole farm.
  const lookup = new Map<string, number>();
  for (const a of [...existing, ...created]) {
    lookup.set(a.tagNo.toLowerCase(), a.id);
    if (a.managementTag) lookup.set(a.managementTag.toLowerCase(), a.id);
  }
  const byTag = new Map(created.map((a) => [a.tagNo, a.id]));
  const updates = [];
  for (const r of rows) {
    const id = byTag.get(r.tagNo);
    if (!id) continue;
    const damId = r.damTag ? lookup.get(r.damTag.toLowerCase()) : undefined;
    const sireId = r.sireTag ? lookup.get(r.sireTag.toLowerCase()) : undefined;
    if (r.damTag && !damId) errors.push(`${r.tagNo}: dam ${r.damTag} not found`);
    if (damId || sireId) updates.push(db.update(schema.animals).set({ damId: damId ?? null, sireId: sireId ?? null }).where(eq(schema.animals.id, id)));
  }
  if (updates.length) await db.batch(updates as any);
  await logActivity(c, 'imported', 'animal', null, `Imported ${created.length} animals`);
  return c.json({ created: created.length, errors });
});

// ---------- Bulk ----------

const bulkIds = z.array(z.number().int().positive()).min(1).max(1000);

async function assertAllInFarm(c: any, farmId: number, ids: number[]) {
  const found = await c.get('db').select({ id: schema.animals.id }).from(schema.animals)
    .where(and(eq(schema.animals.farmId, farmId), inArray(schema.animals.id, ids))).all();
  if (found.length !== new Set(ids).size) throw new HttpError(422, 'Some selected animals were not found');
}

animals.post('/bulk/move', async (c) => {
  const s = farmSession(c);
  const data = await body(c, z.object({ ids: bulkIds, parcelId: optId, structureId: optId, date: isoDate.default(today()), notes: optText(500) }));
  await assertAllInFarm(c, s.farmId, data.ids);
  await validateRelations(c, s.farmId, { parcelId: data.parcelId, structureId: data.structureId });
  const db = c.get('db');
  const current = await db.select({ id: schema.animals.id, parcelId: schema.animals.parcelId }).from(schema.animals).where(inArray(schema.animals.id, data.ids)).all();
  const stmts: any[] = [db.update(schema.animals).set({ parcelId: data.parcelId ?? null, structureId: data.structureId ?? null, updatedAt: now() })
    .where(and(eq(schema.animals.farmId, s.farmId), inArray(schema.animals.id, data.ids)))];
  for (const a of current) {
    stmts.push(db.insert(schema.movements).values({ farmId: s.farmId, animalId: a.id, date: data.date, fromParcelId: a.parcelId, toParcelId: data.parcelId ?? null, toStructureId: data.structureId ?? null, notes: data.notes, createdBy: s.userId }));
  }
  await db.batch(stmts as any);
  await logActivity(c, 'moved', 'animal', null, `Moved ${data.ids.length} animals`);
  return c.json({ moved: data.ids.length });
});

animals.post('/bulk/health', async (c) => {
  const s = farmSession(c);
  const data = await body(c, z.object({
    ids: bulkIds, date: isoDate, type: z.enum(HEALTH_TYPES), title: reqText(150), product: optText(150), dose: optText(80),
    batchNo: optText(80), administeredBy: optText(100), withdrawalMeatUntil: optDate, withdrawalMilkUntil: optDate,
    nextDueDate: optDate, notes: optText(2000),
  }));
  await assertAllInFarm(c, s.farmId, data.ids);
  const { ids, ...rec } = data;
  const db = c.get('db');
  const rows = ids.map((animalId) => ({ ...rec, animalId, farmId: s.farmId, createdBy: s.userId }));
  for (let i = 0; i < rows.length; i += 50) await db.insert(schema.healthRecords).values(rows.slice(i, i + 50));
  await logActivity(c, 'created', 'health', null, `${data.title} recorded for ${ids.length} animals`);
  return c.json({ created: ids.length });
});

// ---------- Single animal ----------

animals.get('/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const db = c.get('db');
  const a = await animalInFarm(db, s.farmId, id);
  if (!a) throw notFound('Animal');
  const [dam, sire, parcel, structure, births, offspring] = await Promise.all([
    a.damId ? animalInFarm(db, s.farmId, a.damId) : null,
    a.sireId ? animalInFarm(db, s.farmId, a.sireId) : null,
    a.parcelId ? db.select({ id: schema.landParcels.id, name: schema.landParcels.name }).from(schema.landParcels).where(eq(schema.landParcels.id, a.parcelId)).get() : null,
    a.structureId ? db.select({ id: schema.structures.id, name: schema.structures.name }).from(schema.structures).where(eq(schema.structures.id, a.structureId)).get() : null,
    db.select({ id: schema.birthRecords.id }).from(schema.birthRecords).where(eq(schema.birthRecords.damId, id)).all(),
    db.select({ id: schema.animals.id }).from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), a.sex === 'female' ? eq(schema.animals.damId, id) : eq(schema.animals.sireId, id))).all(),
  ]);
  const age = ageMonths(a.dob, a.birthYear);
  const brief = (x: schema.Animal | null | undefined) => x ? { id: x.id, tagNo: x.tagNo, managementTag: x.managementTag, name: x.name, breed: x.breed } : null;
  return c.json({
    data: {
      ...a, ageMonths: age, category: classify(a, age, births.length > 0 || (a.sex === 'female' && offspring.length > 0)),
      dam: brief(dam), sire: brief(sire), parcel, structure, offspringCount: offspring.length, birthCount: births.length,
    },
  });
});

animals.get('/:id/records', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const db = c.get('db');
  if (!await animalInFarm(db, s.farmId, id)) throw notFound('Animal');
  const canSeeMoney = roleAtLeast(s.role, 'manager');
  const [health, weights, breeding, births, moves, parcels, structures, all, txns] = await Promise.all([
    db.select().from(schema.healthRecords).where(eq(schema.healthRecords.animalId, id)).orderBy(desc(schema.healthRecords.date)).all(),
    db.select().from(schema.weightRecords).where(eq(schema.weightRecords.animalId, id)).orderBy(desc(schema.weightRecords.date)).all(),
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.animalId, id)).orderBy(desc(schema.breedingRecords.date)).all(),
    db.select().from(schema.birthRecords).where(eq(schema.birthRecords.damId, id)).orderBy(desc(schema.birthRecords.date)).all(),
    db.select().from(schema.movements).where(eq(schema.movements.animalId, id)).orderBy(desc(schema.movements.date), desc(schema.movements.id)).all(),
    db.select({ id: schema.landParcels.id, name: schema.landParcels.name }).from(schema.landParcels).where(eq(schema.landParcels.farmId, s.farmId)).all(),
    db.select({ id: schema.structures.id, name: schema.structures.name }).from(schema.structures).where(eq(schema.structures.farmId, s.farmId)).all(),
    db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag }).from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all(),
    canSeeMoney ? db.select().from(schema.transactions).where(and(eq(schema.transactions.farmId, s.farmId), eq(schema.transactions.animalId, id))).orderBy(desc(schema.transactions.date)).all() : Promise.resolve(null),
  ]);
  const pn = new Map(parcels.map((p) => [p.id, p.name]));
  const sn = new Map(structures.map((p) => [p.id, p.name]));
  const tag = new Map(all.map((a) => [a.id, a.managementTag || a.tagNo]));
  return c.json({
    data: {
      health,
      weights,
      breeding: breeding.map((b) => ({ ...b, sireTag: b.sireId ? tag.get(b.sireId) : null })),
      births: births.map((b) => ({ ...b, offspringTag: b.offspringId ? tag.get(b.offspringId) : null, sireTag: b.sireId ? tag.get(b.sireId) : null })),
      movements: moves.map((m) => ({
        ...m, fromParcelName: m.fromParcelId ? pn.get(m.fromParcelId) : null, toParcelName: m.toParcelId ? pn.get(m.toParcelId) : null,
        toStructureName: m.toStructureId ? sn.get(m.toStructureId) : null,
      })),
      transactions: txns,
    },
  });
});

animals.get('/:id/family', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const g = await loadFarmGraph(c.get('db'), s.farmId);
  if (!g.animals.has(id)) throw notFound('Animal');
  return c.json({ data: familyReport(g, id) });
});

animals.put('/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const db = c.get('db');
  const before = await animalInFarm(db, s.farmId, id);
  if (!before) throw notFound('Animal');
  const data = await body(c, animalInput);
  await validateRelations(c, s.farmId, data, id);
  let a: schema.Animal;
  try {
    [a] = await db.update(schema.animals).set({ ...data, birthYear: birthYearOf(data), updatedAt: now() })
      .where(and(eq(schema.animals.id, id), eq(schema.animals.farmId, s.farmId))).returning();
  } catch (e) { uniqueTagError(e, data.tagNo); }
  if ((data.parcelId ?? null) !== before.parcelId || (data.structureId ?? null) !== before.structureId) {
    await db.insert(schema.movements).values({ farmId: s.farmId, animalId: id, date: today(), fromParcelId: before.parcelId, toParcelId: data.parcelId ?? null, toStructureId: data.structureId ?? null, createdBy: s.userId });
  }
  await syncPurchaseTxn(c, s.farmId, s.userId, a);
  await logActivity(c, 'updated', 'animal', id, `Updated ${a.tagNo}`);
  return c.json({ data: a });
});

animals.post('/:id/exit', async (c) => {
  const s = farmSession(c);
  const a = await animalInFarm(c.get('db'), s.farmId, idParam(c));
  if (!a) throw notFound('Animal');
  const data = await body(c, z.object({
    status: z.enum(['sold', 'died', 'culled', 'missing']),
    exitDate: isoDate, exitReason: optText(500), salePrice: optPosNum, saleWeightKg: optPosNum, buyer: optText(150),
    carcaseWeightKg: optPosNum, carcaseGrade: optText(10),
    overrideWithdrawal: z.boolean().default(false),
  }));
  return c.json({ data: await exitAnimal(c, a, data) });
});

animals.post('/:id/reinstate', async (c) => {
  const s = farmSession(c);
  const a = await animalInFarm(c.get('db'), s.farmId, idParam(c));
  if (!a) throw notFound('Animal');
  await reinstateAnimal(c, a);
  return c.json({ ok: true });
});

animals.delete('/:id', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const db = c.get('db');
  const a = await animalInFarm(db, s.farmId, id);
  if (!a) throw notFound('Animal');
  await deleteSourceTxn(db, s.farmId, 'animal_sale', id);
  await deleteSourceTxn(db, s.farmId, 'animal_purchase', id);
  await db.delete(schema.animals).where(eq(schema.animals.id, id));
  await logActivity(c, 'deleted', 'animal', id, `Deleted ${a.tagNo}`);
  return c.json({ ok: true });
});

export default animals;
