/**
 * Finance: transactions (income/expense), P&L summary, CSV export. Managers and owners only.
 */

import { Hono } from 'hono';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, type Ctx, HttpError, body, farmSession, idParam, logActivity, notFound, now, requireRole, today } from '../lib/context';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, isoDate, money, optId, optPosNum, optText } from '../lib/validators';

const finance = new Hono<AppEnv>();
finance.use('*', requireRole('manager'));

const txnInput = z.object({
  type: z.enum(['income', 'expense']),
  category: z.string(),
  amount: money.refine((v) => v > 0, 'must be more than zero'),
  vatAmount: optPosNum,
  date: isoDate,
  description: optText(500),
  counterparty: optText(150),
  reference: optText(100),
  animalId: optId,
  equipmentId: optId,
  parcelId: optId,
  staffId: optId,
}).superRefine((d, ctx) => {
  const allowed: readonly string[] = d.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!allowed.includes(d.category)) ctx.addIssue({ code: 'custom', path: ['category'], message: `is not a valid ${d.type} category` });
});

async function assertLinks(c: Ctx, d: z.infer<typeof txnInput>) {
  const s = farmSession(c);
  const checks: [any, number | null | undefined, string][] = [
    [schema.animals, d.animalId, 'Animal'], [schema.equipment, d.equipmentId, 'Equipment'],
    [schema.landParcels, d.parcelId, 'Field'], [schema.staff, d.staffId, 'Staff member'],
  ];
  for (const [table, id, what] of checks) {
    if (!id) continue;
    const row = await c.get('db').select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.farmId, s.farmId))).get();
    if (!row) throw new HttpError(422, `${what} not found on this farm`);
  }
}

function range(c: Ctx) {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const s = farmSession(c);
  const conds = [eq(schema.transactions.farmId, s.farmId)];
  if (from) conds.push(gte(schema.transactions.date, from));
  if (to) conds.push(lte(schema.transactions.date, to));
  return and(...conds);
}

async function linkNames(c: Ctx) {
  const s = farmSession(c);
  const db = c.get('db');
  const [animals, equipment, parcels, staff] = await Promise.all([
    db.select({ id: schema.animals.id, n: schema.animals.tagNo, m: schema.animals.managementTag }).from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all(),
    db.select({ id: schema.equipment.id, n: schema.equipment.name }).from(schema.equipment).where(eq(schema.equipment.farmId, s.farmId)).all(),
    db.select({ id: schema.landParcels.id, n: schema.landParcels.name }).from(schema.landParcels).where(eq(schema.landParcels.farmId, s.farmId)).all(),
    db.select({ id: schema.staff.id, n: schema.staff.name }).from(schema.staff).where(eq(schema.staff.farmId, s.farmId)).all(),
  ]);
  return {
    animal: new Map(animals.map((a) => [a.id, a.m || a.n])), equipment: new Map(equipment.map((a) => [a.id, a.n])),
    parcel: new Map(parcels.map((a) => [a.id, a.n])), staff: new Map(staff.map((a) => [a.id, a.n])),
  };
}

finance.get('/categories', (c) => c.json({ data: { income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES } }));

finance.get('/transactions', async (c) => {
  const [rows, names] = await Promise.all([
    c.get('db').select().from(schema.transactions).where(range(c)).orderBy(desc(schema.transactions.date), desc(schema.transactions.id)).all(),
    linkNames(c),
  ]);
  return c.json({
    data: rows.map((r) => ({
      ...r,
      animalTag: r.animalId ? names.animal.get(r.animalId) : null, equipmentName: r.equipmentId ? names.equipment.get(r.equipmentId) : null,
      parcelName: r.parcelId ? names.parcel.get(r.parcelId) : null, staffName: r.staffId ? names.staff.get(r.staffId) : null,
    })),
  });
});

finance.post('/transactions', async (c) => {
  const s = farmSession(c);
  const data = await body(c, txnInput);
  await assertLinks(c, data);
  const [r] = await c.get('db').insert(schema.transactions).values({ ...data, farmId: s.farmId, createdBy: s.userId }).returning();
  await logActivity(c, 'created', 'transaction', r.id, `Recorded ${r.type} of ${r.amount.toFixed(2)} (${r.category.replace(/_/g, ' ')})`);
  return c.json({ data: r }, 201);
});

const importRow = z.object({
  type: z.enum(['income', 'expense']),
  category: z.string(),
  amount: money.refine((v) => v > 0, 'must be more than zero'),
  date: isoDate,
  description: optText(500),
  counterparty: optText(150),
  reference: optText(100),
}).superRefine((d, ctx) => {
  const allowed: readonly string[] = d.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!allowed.includes(d.category)) ctx.addIssue({ code: 'custom', path: ['category'], message: `is not a valid ${d.type} category` });
});

const dupKey = (r: { date: string; type: string; amount: number; description: string | null | undefined }) =>
  `${r.date}|${r.type}|${r.amount.toFixed(2)}|${(r.description || '').trim().toLowerCase()}`;

/** Bank statement import: rows already mapped and categorised in the browser. Rows matching an existing entry are skipped. */
finance.post('/import', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const { rows } = await body(c, z.object({ rows: z.array(importRow).min(1).max(2000) }));
  const dates = rows.map((r) => r.date).sort();
  const existing = await db.select({ date: schema.transactions.date, type: schema.transactions.type, amount: schema.transactions.amount, description: schema.transactions.description })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.farmId, s.farmId), gte(schema.transactions.date, dates[0]), lte(schema.transactions.date, dates[dates.length - 1]))).all();
  const seen = new Set(existing.map(dupKey));
  const fresh = [];
  for (const r of rows) {
    const k = dupKey(r);
    if (seen.has(k)) continue;
    seen.add(k); // the same line twice in one file counts once
    fresh.push({ ...r, farmId: s.farmId, createdBy: s.userId });
  }
  for (let i = 0; i < fresh.length; i += 10) await db.insert(schema.transactions).values(fresh.slice(i, i + 10));
  if (fresh.length) await logActivity(c, 'created', 'transaction', null, `Imported ${fresh.length} bank transaction${fresh.length === 1 ? '' : 's'}`);
  return c.json({ data: { imported: fresh.length, duplicates: rows.length - fresh.length } }, 201);
});

const AUTO_MESSAGE ='This entry was created automatically from another record (sale, purchase, vet or equipment cost). Edit that record instead.';

finance.put('/transactions/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const db = c.get('db');
  const existing = await db.select().from(schema.transactions).where(and(eq(schema.transactions.id, id), eq(schema.transactions.farmId, s.farmId))).get();
  if (!existing) throw notFound('Transaction');
  if (existing.source) throw new HttpError(409, AUTO_MESSAGE);
  const data = await body(c, txnInput);
  await assertLinks(c, data);
  const [r] = await db.update(schema.transactions).set({ ...data, updatedAt: now() }).where(eq(schema.transactions.id, id)).returning();
  await logActivity(c, 'updated', 'transaction', id, `Updated ${r.type} ${r.description || r.category}`);
  return c.json({ data: r });
});

finance.delete('/transactions/:id', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const db = c.get('db');
  const existing = await db.select().from(schema.transactions).where(and(eq(schema.transactions.id, id), eq(schema.transactions.farmId, s.farmId))).get();
  if (!existing) throw notFound('Transaction');
  if (existing.source) throw new HttpError(409, AUTO_MESSAGE);
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  await logActivity(c, 'deleted', 'transaction', id, `Deleted ${existing.type} ${existing.description || existing.category}`);
  return c.json({ ok: true });
});

finance.get('/summary', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const from = c.req.query('from') || `${today().slice(0, 4)}-01-01`;
  const to = c.req.query('to') || today();
  const rows = await db.select().from(schema.transactions)
    .where(and(eq(schema.transactions.farmId, s.farmId), gte(schema.transactions.date, from), lte(schema.transactions.date, to))).all();

  const income = rows.filter((r) => r.type === 'income').reduce((x, r) => x + r.amount, 0);
  const expense = rows.filter((r) => r.type === 'expense').reduce((x, r) => x + r.amount, 0);

  const byCategory: Record<string, { type: string; category: string; total: number; count: number }> = {};
  const monthly: Record<string, { month: string; income: number; expense: number }> = {};
  for (const r of rows) {
    const k = `${r.type}:${r.category}`;
    byCategory[k] ||= { type: r.type, category: r.category, total: 0, count: 0 };
    byCategory[k].total += r.amount;
    byCategory[k].count += 1;
    const m = r.date.slice(0, 7);
    monthly[m] ||= { month: m, income: 0, expense: 0 };
    monthly[m][r.type as 'income' | 'expense'] += r.amount;
  }
  // Fill empty months so charts have a continuous axis.
  const months: { month: string; income: number; expense: number; net: number }[] = [];
  const cur = new Date(from.slice(0, 7) + '-01T00:00:00Z');
  const end = to.slice(0, 7);
  while (cur.toISOString().slice(0, 7) <= end && months.length < 120) {
    const m = cur.toISOString().slice(0, 7);
    const v = monthly[m] || { month: m, income: 0, expense: 0 };
    months.push({ ...v, net: v.income - v.expense });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  const activeHead = await db.select({ id: schema.animals.id }).from(schema.animals)
    .where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.status, 'active'))).all();
  const sold = await db.select({ price: schema.animals.salePrice, weight: schema.animals.saleWeightKg }).from(schema.animals)
    .where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.status, 'sold'), gte(schema.animals.exitDate, from), lte(schema.animals.exitDate, to))).all();
  const priced = sold.filter((x) => x.price != null);
  const weighed = priced.filter((x) => x.weight);

  return c.json({
    data: {
      from, to, income, expense, net: income - expense,
      vat: rows.reduce((x, r) => x + (r.vatAmount || 0), 0),
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
      monthly: months,
      headCount: activeHead.length,
      costPerHead: activeHead.length ? expense / activeHead.length : null,
      animalsSold: sold.length,
      avgSalePrice: priced.length ? priced.reduce((x, r) => x + r.price!, 0) / priced.length : null,
      avgPricePerKg: weighed.length ? weighed.reduce((x, r) => x + r.price!, 0) / weighed.reduce((x, r) => x + r.weight!, 0) : null,
    },
  });
});

finance.get('/export', async (c) => {
  const [rows, names] = await Promise.all([
    c.get('db').select().from(schema.transactions).where(range(c)).orderBy(desc(schema.transactions.date)).all(),
    linkNames(c),
  ]);
  const esc = (v: unknown) => {
    const str = v == null ? '' : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = ['date,type,category,amount,vat,description,counterparty,reference,animal,equipment,field,staff'];
  for (const r of rows) {
    lines.push([r.date, r.type, r.category, r.amount.toFixed(2), r.vatAmount?.toFixed(2), r.description, r.counterparty, r.reference,
      r.animalId ? names.animal.get(r.animalId) : '', r.equipmentId ? names.equipment.get(r.equipmentId) : '',
      r.parcelId ? names.parcel.get(r.parcelId) : '', r.staffId ? names.staff.get(r.staffId) : ''].map(esc).join(','));
  }
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="transactions-${today()}.csv"` },
  });
});

export default finance;
