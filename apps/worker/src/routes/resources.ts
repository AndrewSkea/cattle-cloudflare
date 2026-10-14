/**
 * Land, buildings, equipment, staff, tasks and inventory.
 */

import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import {
  type AppEnv, type Ctx, HttpError, addMonths, body, farmSession, idParam, logActivity, notFound, now, requireRole,
  roleAtLeast, today, addDays,
} from '../lib/context';
import { crud } from '../lib/crud';
import {
  EQUIPMENT_CATEGORIES, EQUIPMENT_LOG_TYPES, EQUIPMENT_STATUS, INVENTORY_CATEGORIES, LAND_USES, STRUCTURE_KINDS, TENURES,
  isoDate, optDate, optId, optPosNum, optText, reqText,
} from '../lib/validators';
import { deleteSourceTxn, syncSourceTxn } from '../services/finance';
import { cleanFieldTxns } from './fields';

async function assertOwned(c: Ctx, table: any, id: number | null | undefined, what: string) {
  if (!id) return;
  const row = await c.get('db').select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.farmId, farmSession(c).farmId))).get();
  if (!row) throw new HttpError(422, `${what} not found on this farm`);
}

// ==================== LAND PARCELS ====================

const parcelInput = z.object({
  name: reqText(100),
  landUse: z.enum(LAND_USES).default('pasture'),
  tenure: z.enum(TENURES).default('owned'),
  rentAnnual: optPosNum,
  polygon: z.string().max(500_000).nullish(),
  areaHa: optPosNum,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  soilType: optText(100),
  capacity: z.coerce.number().int().min(0).nullish(),
  notes: optText(5000),
});

export const parcels = crud({
  table: schema.landParcels, input: parcelInput, entity: 'land', label: (r) => `field ${r.name}`,
  read: 'viewer', write: 'worker', remove: 'manager', orderBy: asc(schema.landParcels.name),
  afterDelete: (c) => cleanFieldTxns(c),
  prepare: (_c, d) => {
    if (d.polygon) {
      try {
        const g = JSON.parse(d.polygon);
        if (g?.type !== 'Polygon' || !Array.isArray(g.coordinates)) throw new Error();
      } catch { throw new HttpError(422, 'Field boundary is not a valid polygon'); }
    }
    return d;
  },
  list: async (c, rows) => {
    const s = farmSession(c);
    const stock = await c.get('db').select({ parcelId: schema.animals.parcelId, species: schema.animals.species })
      .from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.status, 'active'))).all();
    const counts = new Map<number, Record<string, number>>();
    for (const a of stock) {
      if (!a.parcelId) continue;
      const m = counts.get(a.parcelId) || {};
      m[a.species] = (m[a.species] || 0) + 1;
      counts.set(a.parcelId, m);
    }
    return rows.map((r) => {
      const bySpecies = counts.get(r.id) || {};
      return { ...r, animalCount: Object.values(bySpecies).reduce((x, y) => x + y, 0), animalsBySpecies: bySpecies };
    });
  },
});

// ==================== STRUCTURES ====================

const structureInput = z.object({
  name: reqText(100),
  kind: z.enum(STRUCTURE_KINDS).default('barn'),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  parcelId: optId,
  capacity: z.coerce.number().int().min(0).nullish(),
  condition: z.enum(['good', 'fair', 'poor']).nullish(),
  notes: optText(5000),
});

export const structures = crud({
  table: schema.structures, input: structureInput, entity: 'structure', label: (r) => `${r.kind} ${r.name}`,
  read: 'viewer', write: 'worker', remove: 'manager', orderBy: asc(schema.structures.name),
  prepare: async (c, d) => { await assertOwned(c, schema.landParcels, d.parcelId, 'Field'); return d; },
  list: async (c, rows) => {
    const s = farmSession(c);
    const stock = await c.get('db').select({ structureId: schema.animals.structureId })
      .from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.status, 'active'))).all();
    const counts = new Map<number, number>();
    for (const a of stock) if (a.structureId) counts.set(a.structureId, (counts.get(a.structureId) || 0) + 1);
    return rows.map((r) => ({ ...r, animalCount: counts.get(r.id) || 0 }));
  },
});

// ==================== EQUIPMENT ====================

const equipmentInput = z.object({
  name: reqText(100),
  category: z.enum(EQUIPMENT_CATEGORIES).default('tractor'),
  make: optText(80),
  model: optText(80),
  year: z.coerce.number().int().min(1900).max(2100).nullish(),
  registration: optText(30),
  serialNumber: optText(80),
  purchaseDate: optDate,
  purchasePrice: optPosNum,
  status: z.enum(EQUIPMENT_STATUS).default('active'),
  hours: optPosNum,
  serviceIntervalHours: optPosNum,
  serviceIntervalMonths: z.coerce.number().int().min(1).max(120).nullish(),
  lastServiceDate: optDate,
  lastServiceHours: optPosNum,
  motDue: optDate,
  insuranceDue: optDate,
  notes: optText(5000),
});

type ServiceState = 'ok' | 'due_soon' | 'overdue' | 'unknown';

/** Service status from hour and calendar intervals, plus MOT / insurance dates. */
export function serviceStatus(e: typeof schema.equipment.$inferSelect) {
  const reasons: string[] = [];
  let state = 'unknown' as ServiceState;
  const rank = { unknown: 0, ok: 1, due_soon: 2, overdue: 3 } as const;
  const bump = (s: ServiceState, reason?: string) => {
    if (rank[s] > rank[state]) state = s;
    if (reason && (s === 'due_soon' || s === 'overdue')) reasons.push(reason);
  };
  let nextServiceDate: string | null = null;
  let nextServiceHours: number | null = null;

  if (e.serviceIntervalMonths) {
    if (e.lastServiceDate) {
      nextServiceDate = addMonths(e.lastServiceDate, e.serviceIntervalMonths);
      if (nextServiceDate < today()) bump('overdue', `Service overdue since ${nextServiceDate}`);
      else if (nextServiceDate <= addDays(today(), 30)) bump('due_soon', `Service due ${nextServiceDate}`);
      else bump('ok');
    } else bump('due_soon', 'No service recorded yet');
  }
  if (e.serviceIntervalHours) {
    const base = e.lastServiceHours ?? 0;
    nextServiceHours = base + e.serviceIntervalHours;
    if (e.hours != null) {
      const left = nextServiceHours - e.hours;
      if (left < 0) bump('overdue', `Service overdue by ${Math.round(-left)} h`);
      else if (left <= Math.max(25, e.serviceIntervalHours * 0.1)) bump('due_soon', `Service due in ${Math.round(left)} h`);
      else bump('ok');
    }
  }
  for (const [label, d] of [['MOT', e.motDue], ['Insurance', e.insuranceDue]] as const) {
    if (!d) continue;
    if (d < today()) bump('overdue', `${label} expired ${d}`);
    else if (d <= addDays(today(), 30)) bump('due_soon', `${label} due ${d}`);
    else bump('ok');
  }
  if (e.status === 'needs_attention' || e.status === 'in_repair') reasons.unshift(e.status === 'in_repair' ? 'In repair' : 'Needs attention');
  return { serviceState: state as ServiceState, serviceReasons: reasons, nextServiceDate, nextServiceHours };
}

const equipmentCrud = crud({
  table: schema.equipment, input: equipmentInput, entity: 'equipment', label: (r) => r.name,
  read: 'viewer', write: 'worker', remove: 'manager', orderBy: asc(schema.equipment.name),
  list: (_c, rows) => rows.map((r) => ({ ...r, ...serviceStatus(r) })),
});

export const equipment = new Hono<AppEnv>();

const logInput = z.object({
  date: isoDate,
  type: z.enum(EQUIPMENT_LOG_TYPES),
  hours: optPosNum,
  cost: optPosNum,
  description: optText(2000),
  performedBy: optText(100),
});

async function loadEquipment(c: Ctx, id: number) {
  const e = await c.get('db').select().from(schema.equipment).where(and(eq(schema.equipment.id, id), eq(schema.equipment.farmId, farmSession(c).farmId))).get();
  if (!e) throw notFound('Equipment');
  return e;
}

/** Recompute hours + last service from logs so edits/deletes stay consistent. */
async function refreshEquipmentFromLogs(c: Ctx, equipmentId: number) {
  const db = c.get('db');
  const logs = await db.select().from(schema.equipmentLogs).where(eq(schema.equipmentLogs.equipmentId, equipmentId))
    .orderBy(asc(schema.equipmentLogs.date), asc(schema.equipmentLogs.id)).all();
  const e = await db.select().from(schema.equipment).where(eq(schema.equipment.id, equipmentId)).get();
  if (!e) return;
  const maxHours = logs.reduce<number | null>((m, l) => (l.hours != null && (m == null || l.hours > m) ? l.hours : m), null);
  const lastService = [...logs].reverse().find((l) => l.type === 'service');
  await db.update(schema.equipment).set({
    hours: maxHours != null && (e.hours == null || maxHours > e.hours) ? maxHours : e.hours,
    lastServiceDate: lastService ? lastService.date : e.lastServiceDate,
    lastServiceHours: lastService ? lastService.hours ?? e.lastServiceHours : e.lastServiceHours,
    updatedAt: now(),
  }).where(eq(schema.equipment.id, equipmentId));
}

async function syncLogCost(c: Ctx, e: typeof schema.equipment.$inferSelect, log: typeof schema.equipmentLogs.$inferSelect) {
  const s = farmSession(c);
  const category = log.type === 'fuel' ? 'fuel' : log.type === 'repair' ? 'repairs' : 'machinery';
  await syncSourceTxn(c.get('db'), s.farmId, s.userId, 'equipment_log', log.id, log.cost ? {
    type: 'expense', category, amount: log.cost, date: log.date,
    description: `${e.name}: ${log.type}${log.description ? ` — ${log.description}` : ''}`, counterparty: log.performedBy, equipmentId: e.id,
  } : null);
}

equipment.get('/:id/logs', requireRole('viewer'), async (c) => {
  const e = await loadEquipment(c, idParam(c));
  const logs = await c.get('db').select().from(schema.equipmentLogs).where(eq(schema.equipmentLogs.equipmentId, e.id))
    .orderBy(desc(schema.equipmentLogs.date), desc(schema.equipmentLogs.id)).all();
  return c.json({ data: { equipment: { ...e, ...serviceStatus(e) }, logs } });
});

equipment.post('/:id/logs', requireRole('worker'), async (c) => {
  const s = farmSession(c);
  const e = await loadEquipment(c, idParam(c));
  const data = await body(c, logInput);
  const [log] = await c.get('db').insert(schema.equipmentLogs).values({ ...data, equipmentId: e.id, farmId: s.farmId, createdBy: s.userId }).returning();
  if (data.type === 'service' && (e.status === 'needs_attention' || e.status === 'in_repair')) {
    await c.get('db').update(schema.equipment).set({ status: 'active' }).where(eq(schema.equipment.id, e.id));
  }
  await refreshEquipmentFromLogs(c, e.id);
  await syncLogCost(c, e, log);
  await logActivity(c, 'created', 'equipment', e.id, `${e.name}: logged ${data.type}`);
  return c.json({ data: log }, 201);
});

equipment.put('/:id/logs/:logId', requireRole('worker'), async (c) => {
  const e = await loadEquipment(c, idParam(c));
  const data = await body(c, logInput);
  const [log] = await c.get('db').update(schema.equipmentLogs).set(data)
    .where(and(eq(schema.equipmentLogs.id, idParam(c, 'logId')), eq(schema.equipmentLogs.equipmentId, e.id))).returning();
  if (!log) throw notFound('Log entry');
  await refreshEquipmentFromLogs(c, e.id);
  await syncLogCost(c, e, log);
  return c.json({ data: log });
});

equipment.delete('/:id/logs/:logId', requireRole('worker'), async (c) => {
  const s = farmSession(c);
  const e = await loadEquipment(c, idParam(c));
  const [log] = await c.get('db').delete(schema.equipmentLogs)
    .where(and(eq(schema.equipmentLogs.id, idParam(c, 'logId')), eq(schema.equipmentLogs.equipmentId, e.id))).returning();
  if (!log) throw notFound('Log entry');
  await deleteSourceTxn(c.get('db'), s.farmId, 'equipment_log', log.id);
  return c.json({ ok: true });
});

equipment.route('/', equipmentCrud);

// ==================== STAFF ====================

const staffInput = z.object({
  name: reqText(100),
  userId: optId,
  email: z.string().email().nullish().or(z.literal('').transform(() => null)),
  phone: optText(40),
  jobTitle: optText(100),
  employmentType: z.enum(['full_time', 'part_time', 'seasonal', 'contractor']).default('full_time'),
  payRate: optPosNum,
  payUnit: z.enum(['hour', 'day', 'week', 'month', 'year']).nullish(),
  startDate: optDate,
  endDate: optDate,
  emergencyContact: optText(200),
  notes: optText(5000),
});

const staffCrud = crud({
  table: schema.staff, input: staffInput, entity: 'staff', label: (r) => r.name,
  read: 'viewer', write: 'manager', orderBy: asc(schema.staff.name),
  prepare: async (c, d) => {
    if (d.userId) {
      const m = await c.get('db').select({ id: schema.farmMembers.id }).from(schema.farmMembers)
        .where(and(eq(schema.farmMembers.farmId, farmSession(c).farmId), eq(schema.farmMembers.userId, d.userId))).get();
      if (!m) throw new HttpError(422, 'Linked login is not a member of this farm');
    }
    return d;
  },
  // Pay and emergency details are visible to managers only.
  list: (c, rows) => roleAtLeast(farmSession(c).role, 'manager') ? rows
    : rows.map(({ payRate, payUnit, emergencyContact, notes, ...r }) => r),
});

export const staffRoutes = new Hono<AppEnv>();
staffRoutes.get('/:id/payments', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const rows = await c.get('db').select().from(schema.transactions)
    .where(and(eq(schema.transactions.farmId, s.farmId), eq(schema.transactions.staffId, idParam(c)))).orderBy(desc(schema.transactions.date)).all();
  return c.json({ data: rows });
});
staffRoutes.route('/', staffCrud);

// ==================== TASKS ====================

const taskInput = z.object({
  title: reqText(200),
  description: optText(5000),
  dueDate: optDate,
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
  category: z.enum(['livestock', 'land', 'equipment', 'admin', 'other']).nullish(),
  assigneeUserId: optId,
  animalId: optId,
  equipmentId: optId,
  parcelId: optId,
});

export const tasks = crud({
  table: schema.tasks, input: taskInput, entity: 'task', label: (r) => `task “${r.title}”`,
  read: 'viewer', write: 'worker', orderBy: asc(schema.tasks.dueDate),
  prepare: async (c, d) => {
    const s = farmSession(c);
    await assertOwned(c, schema.animals, d.animalId, 'Animal');
    await assertOwned(c, schema.equipment, d.equipmentId, 'Equipment');
    await assertOwned(c, schema.landParcels, d.parcelId, 'Field');
    if (d.assigneeUserId) {
      const m = await c.get('db').select({ id: schema.farmMembers.id }).from(schema.farmMembers)
        .where(and(eq(schema.farmMembers.farmId, s.farmId), eq(schema.farmMembers.userId, d.assigneeUserId))).get();
      if (!m) throw new HttpError(422, 'Assignee is not a member of this farm');
    }
    if (d.status === 'done') return { ...d, completedAt: now(), completedBy: s.userId };
    if (d.status) return { ...d, completedAt: null, completedBy: null };
    return d;
  },
  list: async (c, rows) => {
    const s = farmSession(c);
    const db = c.get('db');
    const [users, animals, equipmentRows, parcelRows] = await Promise.all([
      db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users)
        .innerJoin(schema.farmMembers, eq(schema.farmMembers.userId, schema.users.id)).where(eq(schema.farmMembers.farmId, s.farmId)).all(),
      db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag }).from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all(),
      db.select({ id: schema.equipment.id, name: schema.equipment.name }).from(schema.equipment).where(eq(schema.equipment.farmId, s.farmId)).all(),
      db.select({ id: schema.landParcels.id, name: schema.landParcels.name }).from(schema.landParcels).where(eq(schema.landParcels.farmId, s.farmId)).all(),
    ]);
    const un = new Map(users.map((u) => [u.id, u.name || u.email]));
    const an = new Map(animals.map((a) => [a.id, a.managementTag || a.tagNo]));
    const en = new Map(equipmentRows.map((a) => [a.id, a.name]));
    const pn = new Map(parcelRows.map((a) => [a.id, a.name]));
    return rows.map((r) => ({
      ...r, assigneeName: r.assigneeUserId ? un.get(r.assigneeUserId) : null, animalTag: r.animalId ? an.get(r.animalId) : null,
      equipmentName: r.equipmentId ? en.get(r.equipmentId) : null, parcelName: r.parcelId ? pn.get(r.parcelId) : null,
      overdue: r.status !== 'done' && !!r.dueDate && r.dueDate < today(),
    }));
  },
});

// ==================== INVENTORY ====================

const inventoryInput = z.object({
  name: reqText(150),
  category: z.enum(INVENTORY_CATEGORIES).default('feed'),
  quantity: z.coerce.number().finite().min(0).default(0),
  unit: z.string().trim().min(1).max(20).default('units'),
  reorderLevel: optPosNum,
  unitCost: optPosNum,
  supplier: optText(150),
  location: optText(150),
  batchNo: optText(80),
  expiryDate: optDate,
  notes: optText(5000),
});

const inventoryCrud = crud({
  table: schema.inventoryItems, input: inventoryInput, entity: 'inventory', label: (r) => r.name,
  read: 'viewer', write: 'worker', orderBy: asc(schema.inventoryItems.name),
  list: (_c, rows) => rows.map((r) => ({
    ...r,
    lowStock: r.reorderLevel != null && r.quantity <= r.reorderLevel,
    expired: !!r.expiryDate && r.expiryDate < today(),
    expiringSoon: !!r.expiryDate && r.expiryDate >= today() && r.expiryDate <= addDays(today(), 30),
  })),
});

export const inventory = new Hono<AppEnv>();

/** Adjust stock: positive = received, negative = used. Optionally records the purchase as an expense. */
inventory.post('/:id/adjust', requireRole('worker'), async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const data = await body(c, z.object({
    change: z.coerce.number().finite().refine((v) => v !== 0, 'cannot be zero'),
    note: optText(300),
    totalCost: optPosNum,
    date: isoDate.default(today()),
  }));
  const db = c.get('db');
  const item = await db.select().from(schema.inventoryItems).where(and(eq(schema.inventoryItems.id, id), eq(schema.inventoryItems.farmId, s.farmId))).get();
  if (!item) throw notFound('Item');
  const quantity = Math.round((item.quantity + data.change) * 1000) / 1000;
  if (quantity < 0) throw new HttpError(422, `Only ${item.quantity} ${item.unit} in stock`);
  await db.update(schema.inventoryItems).set({ quantity, updatedAt: now() }).where(eq(schema.inventoryItems.id, id));
  if (data.change > 0 && data.totalCost && roleAtLeast(s.role, 'manager')) {
    const category = { feed: 'feed', medicine: 'vet_medicine', vaccine: 'vet_medicine', fertiliser: 'fertiliser_seed', seed: 'fertiliser_seed', fuel: 'fuel', bedding: 'bedding', parts: 'repairs' }[item.category] || 'other_expense';
    await db.insert(schema.transactions).values({
      farmId: s.farmId, type: 'expense', category, amount: data.totalCost, date: data.date,
      description: `${item.name} — ${data.change} ${item.unit}`, counterparty: item.supplier, createdBy: s.userId,
    });
  }
  await logActivity(c, 'adjusted', 'inventory', id, `${item.name}: ${data.change > 0 ? '+' : ''}${data.change} ${item.unit}${data.note ? ` (${data.note})` : ''}`);
  return c.json({ quantity });
});
inventory.route('/', inventoryCrud);
