/**
 * Mart sale statements: the seller's PDF from the mart ("Sellers List for SPECIAL SALE"), read in the browser,
 * checked here against the herd, then imported in one go — every animal marked sold with its price, weight and
 * buyer, the mart's charges added to Finances, and any matching lots from the public sales report ticked off.
 */

import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, HttpError, body, farmSession, idParam, logActivity, notFound, now, requireAccess } from '../lib/context';
import { isoDate, optText } from '../lib/validators';
import { checkUkTag, normaliseTag } from '../services/compliance';
import { breedName } from '../services/mart/orkney';

const sales = new Hono<AppEnv>();
sales.use('*', requireAccess('worker', 'worker'));

export const STATEMENT_WEIGHT_NOTE = 'Sale weight (mart statement)';

const SEX: Record<string, { sex: 'male' | 'female'; castrated: boolean; label: string }> = {
  STR: { sex: 'male', castrated: true, label: 'Steer' },
  BUL: { sex: 'male', castrated: false, label: 'Bull' },
  BULL: { sex: 'male', castrated: false, label: 'Bull' },
  HFR: { sex: 'female', castrated: false, label: 'Heifer' },
  COW: { sex: 'female', castrated: false, label: 'Cow' },
};

/** "UK523801101382" → "UK523801-101382", the way this app stores UK tags. */
function storedTag(tag: string) {
  const t = normaliseTag(tag);
  return /^UK\d{12}$/.test(t) ? `${t.slice(0, 8)}-${t.slice(8)}` : t;
}

/** Positions where two equal-length tags differ. */
function distance(a: string, b: string) {
  if (a.length !== b.length) return 99;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

const previewRow = z.object({
  tag: z.string().trim().min(4).max(30),
  sex: z.string().trim().max(6).nullish(),
  breedCode: z.string().trim().max(6).nullish(),
  dob: isoDate.nullish(),
});

/** Finds each statement line's animal: exact tag, else a near-miss tag (a misread digit) with the same date of birth. */
sales.post('/preview', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const { date, rows } = await body(c, z.object({ date: isoDate, rows: z.array(previewRow).min(1).max(400) }));
  const herd = await db.select({
    id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag, name: schema.animals.name,
    sex: schema.animals.sex, castrated: schema.animals.castrated, breed: schema.animals.breed, dob: schema.animals.dob,
    status: schema.animals.status, exitDate: schema.animals.exitDate, salePrice: schema.animals.salePrice, species: schema.animals.species,
  }).from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.species, 'cattle'))).all();
  const byTag = new Map(herd.map((a) => [normaliseTag(a.tagNo), a]));
  const withdrawals = await db.all<{ animal_id: number; until: string; title: string }>(sql`
    SELECT animal_id, MAX(withdrawal_meat_until) until, title FROM health_records
    WHERE farm_id = ${s.farmId} AND withdrawal_meat_until >= ${date} GROUP BY animal_id`);
  const wd = new Map(withdrawals.map((w) => [w.animal_id, w]));
  const already = await db.select({ id: schema.saleStatements.id, saleRef: schema.saleStatements.saleRef, date: schema.saleStatements.date })
    .from(schema.saleStatements).where(and(eq(schema.saleStatements.farmId, s.farmId), eq(schema.saleStatements.date, date), eq(schema.saleStatements.status, 'imported'))).all();

  const out = rows.map((r) => {
    const tag = normaliseTag(r.tag);
    const check = checkUkTag(tag);
    let animal = byTag.get(tag) ?? null;
    let readAs: string | null = null;
    const near = animal ? [] : herd
      .map((a) => ({ a, d: distance(normaliseTag(a.tagNo), tag) }))
      .filter((x) => x.d <= 2)
      .sort((x, y) => x.d - y.d || Number(y.a.dob === r.dob) - Number(x.a.dob === r.dob));
    if (!animal && near.length) {
      const best = near[0];
      // One misread digit plus the same date of birth (or a single candidate) is safe to suggest as the match.
      if (best.d === 1 && r.dob && best.a.dob === r.dob && near.filter((x) => x.d === 1 && x.a.dob === r.dob).length === 1) {
        animal = best.a;
        readAs = tag;
      }
    }
    const issues: { level: 'error' | 'warn'; text: string }[] = [];
    const sex = SEX[(r.sex || '').toUpperCase()];
    if (readAs && animal) issues.push({ level: 'warn', text: `Read as ${readAs} — matched to ${animal.tagNo} (same date of birth)` });
    if (!animal) {
      issues.push({ level: 'error', text: check.ok ? 'Not in your herd' : `Not in your herd, and the tag looks misread (${check.issue})` });
    } else {
      if (animal.status !== 'active' && animal.exitDate !== date) issues.push({ level: 'error', text: `Already ${animal.status} on ${animal.exitDate}` });
      else if (animal.status !== 'active') issues.push({ level: 'warn', text: `Already marked ${animal.status} on this date — will be updated` });
      if (r.dob && animal.dob && r.dob !== animal.dob) issues.push({ level: 'warn', text: `Date of birth on statement ${r.dob}, in your records ${animal.dob}` });
      if (sex && sex.sex !== animal.sex) issues.push({ level: 'warn', text: `Statement says ${sex.label.toLowerCase()}, your records say ${animal.sex}` });
      const bn = breedName(r.breedCode);
      if (bn && animal.breed && !animal.breed.toLowerCase().includes(bn)) issues.push({ level: 'warn', text: `Statement breed ${titleCase(bn)}, your records ${animal.breed}` });
      const w = wd.get(animal.id);
      if (w) issues.push({ level: 'warn', text: `Under meat withdrawal until ${w.until} (${w.title})` });
    }
    return {
      tag,
      tagOk: check.ok,
      tagIssue: check.ok ? null : check.issue ?? null,
      animal: animal ? { id: animal.id, tagNo: animal.tagNo, managementTag: animal.managementTag, name: animal.name, sex: animal.sex, castrated: animal.castrated, breed: animal.breed, dob: animal.dob, status: animal.status } : null,
      suggestions: animal ? [] : near.slice(0, 3).map((x) => ({ id: x.a.id, tagNo: x.a.tagNo, managementTag: x.a.managementTag, dob: x.a.dob, status: x.a.status })),
      withdrawal: animal ? wd.get(animal.id)?.until ?? null : null,
      issues,
    };
  });
  return c.json({ data: { rows: out, alreadyImported: already } });
});

/** Animals for the "pick an animal" control in the confirm step. */
sales.get('/animals', async (c) => {
  const s = farmSession(c);
  const rows = await c.get('db').select({
    id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag, dob: schema.animals.dob,
    sex: schema.animals.sex, status: schema.animals.status,
  }).from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.species, 'cattle'))).all();
  return c.json({ data: rows });
});

const lotSchema = z.object({
  lot: z.string().trim().max(12).nullish(),
  tag: z.string().trim().min(4).max(30),
  animalId: z.number().int().positive().nullish(),
  /** Add the animal to the herd first (it wasn't recorded) */
  create: z.boolean().default(false),
  sex: z.string().trim().max(6).nullish(),
  breedCode: z.string().trim().max(6).nullish(),
  dob: isoDate.nullish(),
  weightKg: z.number().min(0).max(3000).nullish(),
  price: z.number().min(0).max(1_000_000),
  buyer: optText(120),
  batchSize: z.number().int().min(1).max(200).default(1),
});

const importSchema = z.object({
  date: isoDate,
  saleRef: optText(20),
  title: optText(120),
  fileName: optText(200),
  gross: z.number().min(0).max(100_000_000),
  commission: z.number().min(0).max(10_000_000).nullish(),
  insurance: z.number().min(0).max(10_000_000).nullish(),
  vat: z.number().min(0).max(10_000_000).nullish(),
  otherCharges: z.number().min(0).max(10_000_000).nullish(),
  net: z.number().min(0).max(100_000_000).nullish(),
  lots: z.array(lotSchema).min(1).max(400),
  overrideWithdrawal: z.boolean().default(false),
});

sales.post('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const data = await body(c, importSchema);
  if (data.saleRef) {
    const dup = await db.select({ id: schema.saleStatements.id }).from(schema.saleStatements).where(and(
      eq(schema.saleStatements.farmId, s.farmId), eq(schema.saleStatements.date, data.date),
      eq(schema.saleStatements.saleRef, data.saleRef), eq(schema.saleStatements.status, 'imported'))).get();
    if (dup) throw new HttpError(409, `Sale ${data.saleRef} on ${data.date} has already been imported. Undo it on the Mart sales page first to import it again.`);
  }

  // New animals (on the statement but never recorded) are added to the herd first.
  const toCreate = data.lots.filter((l) => !l.animalId && l.create);
  const missing = data.lots.filter((l) => !l.animalId && !l.create);
  if (missing.length) throw new HttpError(422, `Choose an animal (or "add to herd") for ${missing.map((l) => l.tag).join(', ')}`);
  const created = new Map<string, number>();
  if (toCreate.length) {
    const existing = await db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo }).from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all();
    const tags = new Map(existing.map((a) => [normaliseTag(a.tagNo), a.id]));
    for (const l of toCreate) {
      const t = normaliseTag(l.tag);
      if (tags.has(t)) { created.set(t, tags.get(t)!); continue; }
      const sx = SEX[(l.sex || '').toUpperCase()] ?? { sex: 'male' as const, castrated: true };
      const bn = breedName(l.breedCode);
      const [row] = await db.insert(schema.animals).values({
        farmId: s.farmId, species: 'cattle', tagNo: storedTag(t), sex: sx.sex, castrated: sx.castrated,
        breed: bn ? titleCase(bn) : l.breedCode || null, dob: l.dob ?? null, birthYear: l.dob ? Number(l.dob.slice(0, 4)) : null,
        origin: 'born', notes: 'Added from a mart sale statement',
      }).returning({ id: schema.animals.id });
      created.set(t, row.id);
    }
  }
  const lots = data.lots.map((l) => ({ ...l, animalId: l.animalId ?? created.get(normaliseTag(l.tag))! }));
  const ids = lots.map((l) => l.animalId);
  if (new Set(ids).size !== ids.length) throw new HttpError(422, 'The same animal is on two lines — check the matches');

  const rows = await db.select().from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), inArray(schema.animals.id, ids))).all();
  if (rows.length !== ids.length) throw notFound('Animal');
  const byId = new Map(rows.map((a) => [a.id, a]));
  const clash = rows.filter((a) => a.status !== 'active' && a.exitDate !== data.date);
  if (clash.length) throw new HttpError(409, `${clash.map((a) => `${a.tagNo} (${a.status} ${a.exitDate})`).join(', ')} already left the herd`);
  const early = rows.filter((a) => a.dob && a.dob > data.date);
  if (early.length) throw new HttpError(422, `${early.map((a) => a.tagNo).join(', ')}: sale date is before the date of birth`);
  if (!data.overrideWithdrawal) {
    const w = await db.select({ animalId: schema.healthRecords.animalId }).from(schema.healthRecords)
      .where(and(inArray(schema.healthRecords.animalId, ids), sql`${schema.healthRecords.withdrawalMeatUntil} >= ${data.date}`)).all();
    if (w.length) {
      const tags = [...new Set(w.map((x) => byId.get(x.animalId)?.tagNo))].join(', ');
      throw new HttpError(409, `${tags} ${w.length > 1 ? 'were' : 'was'} under a meat withdrawal period on the sale date.`, { code: 'withdrawal' });
    }
  }

  const charges = (data.commission ?? 0) + (data.insurance ?? 0) + (data.vat ?? 0) + (data.otherCharges ?? 0);
  const saleName = [data.saleRef, data.title ? titleCase(data.title) : null].filter(Boolean).join(' ') || 'Mart sale';
  const [stmt] = await db.insert(schema.saleStatements).values({
    farmId: s.farmId, saleRef: data.saleRef, title: data.title, date: data.date, fileName: data.fileName, headCount: lots.length,
    gross: data.gross, commission: data.commission ?? null, insurance: data.insurance ?? null, vat: data.vat ?? null,
    otherCharges: data.otherCharges ?? null, net: data.net ?? null,
    lots: JSON.stringify(lots.map((l) => ({ lot: l.lot, tag: l.tag, animalId: l.animalId, weightKg: l.weightKg ?? null, price: l.price, buyer: l.buyer, batchSize: l.batchSize, created: created.has(normaliseTag(l.tag)) }))),
    animalIds: JSON.stringify(ids), createdBy: s.userId,
  }).returning({ id: schema.saleStatements.id });

  // Lots in the public sales report for the same day that these sales account for (same price and weight).
  const reportLots = await db.all<{ id: number; price: number; weight_kg: number | null; head_count: number }>(sql`
    SELECT m.id, l.price, l.weight_kg, l.head_count FROM mart_matches m JOIN mart_lots l ON l.id = m.lot_id
    WHERE m.farm_id = ${s.farmId} AND m.status = 'new' AND l.date = ${data.date}`);
  const matchIds: number[] = [];
  const matchStmts: any[] = [];
  for (const m of reportLots) {
    const same = lots.filter((l) => Math.abs(l.price - m.price) < 0.5 && (m.weight_kg == null || l.weightKg == null || Math.abs(l.weightKg - m.weight_kg) < 1));
    if (!same.length) continue;
    matchIds.push(m.id);
    matchStmts.push(db.update(schema.martMatches).set({ status: 'imported', animalIds: JSON.stringify(same.map((l) => l.animalId)), decidedBy: s.userId, decidedAt: now() })
      .where(eq(schema.martMatches.id, m.id)));
  }

  const ts = now();
  const stmts: any[] = [...matchStmts];
  for (const l of lots) {
    const a = byId.get(l.animalId)!;
    const reason = `${saleName} — lot ${l.lot ?? '?'}${l.batchSize > 1 ? ` (one of ${l.batchSize})` : ''}${l.weightKg ? ` at ${Math.round((l.price * 1000) / l.weightKg) / 10}p/kg` : ''}`;
    stmts.push(db.update(schema.animals).set({
      status: 'sold', exitDate: data.date, exitReason: reason, salePrice: l.price, saleWeightKg: l.weightKg ?? null,
      buyer: l.buyer || 'Orkney Auction Mart', parcelId: null, structureId: null, updatedAt: ts,
    }).where(eq(schema.animals.id, a.id)));
    stmts.push(db.delete(schema.transactions).where(and(eq(schema.transactions.farmId, s.farmId), eq(schema.transactions.source, 'animal_sale'), eq(schema.transactions.sourceId, a.id))));
    if (l.price > 0) {
      stmts.push(db.insert(schema.transactions).values({
        farmId: s.farmId, type: 'income', category: 'livestock_sales', amount: l.price, date: data.date, description: `Sale of ${a.tagNo}`,
        counterparty: l.buyer || 'Orkney Auction Mart', reference: data.saleRef ?? null, animalId: a.id, source: 'animal_sale', sourceId: a.id, createdBy: s.userId,
      }));
    }
    stmts.push(db.delete(schema.weightRecords).where(and(eq(schema.weightRecords.animalId, a.id), eq(schema.weightRecords.date, data.date))));
    if (l.weightKg && l.weightKg >= 20) {
      stmts.push(db.insert(schema.weightRecords).values({
        farmId: s.farmId, animalId: a.id, date: data.date, weightKg: l.weightKg,
        notes: l.batchSize > 1 ? `${STATEMENT_WEIGHT_NOTE}, average of ${l.batchSize}` : STATEMENT_WEIGHT_NOTE, createdBy: s.userId,
      }));
    }
  }
  if (charges > 0) {
    const parts = [
      data.commission ? `commission £${data.commission.toFixed(2)}` : null, data.insurance ? `insurance £${data.insurance.toFixed(2)}` : null,
      data.vat ? `VAT £${data.vat.toFixed(2)}` : null, data.otherCharges ? `other £${data.otherCharges.toFixed(2)}` : null,
    ].filter(Boolean).join(', ');
    stmts.push(db.insert(schema.transactions).values({
      farmId: s.farmId, type: 'expense', category: 'mart_charges', amount: Math.round(charges * 100) / 100, vatAmount: data.vat ?? null,
      date: data.date, description: `Mart charges, ${saleName} (${parts})`, counterparty: 'Orkney Auction Mart', reference: data.saleRef ?? null,
      source: 'sale_statement', sourceId: stmt.id, createdBy: s.userId,
    }));
  }
  stmts.push(db.update(schema.saleStatements).set({ matchIds: JSON.stringify(matchIds) }).where(eq(schema.saleStatements.id, stmt.id)));
  stmts.push(db.insert(schema.activityLog).values({
    farmId: s.farmId, userId: s.userId, action: 'imported', entity: 'sale_statement', entityId: stmt.id,
    summary: `Imported ${saleName} (${data.date}): ${lots.length} sold for £${data.gross.toLocaleString('en-GB')}${created.size ? `, ${created.size} added to the herd` : ''}`,
  }));
  await db.batch(stmts as [any, ...any[]]);
  return c.json({ data: { id: stmt.id, sold: lots.length, created: created.size, reportLots: matchIds.length } }, 201);
});

sales.get('/', async (c) => {
  const s = farmSession(c);
  const rows = await c.get('db').select().from(schema.saleStatements).where(eq(schema.saleStatements.farmId, s.farmId))
    .orderBy(sql`${schema.saleStatements.date} DESC, ${schema.saleStatements.id} DESC`).all();
  return c.json({ data: rows.map(({ lots, animalIds, matchIds, ...r }) => ({ ...r, lots: JSON.parse(lots) })) });
});

/** Puts every animal back in the herd and removes the sale income, weights and charges. */
sales.post('/:id/undo', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const st = await db.select().from(schema.saleStatements).where(and(eq(schema.saleStatements.id, idParam(c)), eq(schema.saleStatements.farmId, s.farmId))).get();
  if (!st) throw notFound('Sale statement');
  if (st.status !== 'imported') throw new HttpError(409, 'This statement has already been undone');
  const ids = JSON.parse(st.animalIds) as number[];
  const rows = ids.length ? await db.select().from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), inArray(schema.animals.id, ids))).all() : [];
  const back = rows.filter((a) => a.status === 'sold' && a.exitDate === st.date);
  const ts = now();
  const stmts: any[] = [];
  for (const a of back) {
    stmts.push(db.update(schema.animals).set({
      status: 'active', exitDate: null, exitReason: null, salePrice: null, saleWeightKg: null, buyer: null, updatedAt: ts,
    }).where(eq(schema.animals.id, a.id)));
    stmts.push(db.delete(schema.transactions).where(and(eq(schema.transactions.farmId, s.farmId), eq(schema.transactions.source, 'animal_sale'), eq(schema.transactions.sourceId, a.id))));
    stmts.push(db.delete(schema.weightRecords).where(and(eq(schema.weightRecords.animalId, a.id), eq(schema.weightRecords.date, st.date), sql`${schema.weightRecords.notes} LIKE ${STATEMENT_WEIGHT_NOTE + '%'}`)));
  }
  stmts.push(db.delete(schema.transactions).where(and(eq(schema.transactions.farmId, s.farmId), eq(schema.transactions.source, 'sale_statement'), eq(schema.transactions.sourceId, st.id))));
  const matchIds = JSON.parse(st.matchIds || '[]') as number[];
  if (matchIds.length) {
    stmts.push(db.update(schema.martMatches).set({ status: 'new', animalIds: null, decidedBy: null, decidedAt: null })
      .where(and(eq(schema.martMatches.farmId, s.farmId), inArray(schema.martMatches.id, matchIds))));
  }
  stmts.push(db.update(schema.saleStatements).set({ status: 'undone' }).where(eq(schema.saleStatements.id, st.id)));
  await db.batch(stmts as [any, ...any[]]);
  await logActivity(c, 'undone', 'sale_statement', st.id, `Undid ${st.saleRef ?? 'mart'} sale import (${st.date}): ${back.length} back in the herd`);
  return c.json({ data: { reinstated: back.length } });
});

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

export default sales;
