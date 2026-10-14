/**
 * Dashboard overview and farm calendar — pulls alerts together from every module.
 */

import { Hono } from 'hono';
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { type AppEnv, addDays, farmSession, requireRole, roleAtLeast, today } from '../lib/context';
import { ageMonths, classify, loadFarmGraph } from '../services/livestock';
import { serviceStatus } from './resources';
import { complianceSummary } from '../services/compliance';
import { plannedFieldWork } from './fields';

const dashboard = new Hono<AppEnv>();
dashboard.use('*', requireRole('viewer'));

dashboard.get('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const t = today();
  const yearStart = `${t.slice(0, 4)}-01-01`;
  const soon = addDays(t, 30);

  const [g, health, breeding, births, equipment, inventory, tasks, activity, txns, parcels] = await Promise.all([
    loadFarmGraph(db, s.farmId),
    db.select().from(schema.healthRecords).where(eq(schema.healthRecords.farmId, s.farmId)).orderBy(desc(schema.healthRecords.date), desc(schema.healthRecords.id)).all(),
    db.select().from(schema.breedingRecords).where(and(eq(schema.breedingRecords.farmId, s.farmId), eq(schema.breedingRecords.outcome, 'pending'))).all(),
    db.select().from(schema.birthRecords).where(and(eq(schema.birthRecords.farmId, s.farmId), gte(schema.birthRecords.date, yearStart))).all(),
    db.select().from(schema.equipment).where(eq(schema.equipment.farmId, s.farmId)).all(),
    db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.farmId, s.farmId)).all(),
    db.select().from(schema.tasks).where(and(eq(schema.tasks.farmId, s.farmId), ne(schema.tasks.status, 'done'))).orderBy(schema.tasks.dueDate).all(),
    db.select({
      id: schema.activityLog.id, summary: schema.activityLog.summary, entity: schema.activityLog.entity, entityId: schema.activityLog.entityId,
      action: schema.activityLog.action, createdAt: schema.activityLog.createdAt, userName: schema.users.name, userEmail: schema.users.email,
    }).from(schema.activityLog).leftJoin(schema.users, eq(schema.users.id, schema.activityLog.userId))
      .where(eq(schema.activityLog.farmId, s.farmId)).orderBy(desc(schema.activityLog.id)).limit(12).all(),
    roleAtLeast(s.role, 'manager')
      ? db.select().from(schema.transactions).where(and(eq(schema.transactions.farmId, s.farmId), gte(schema.transactions.date, yearStart))).all()
      : Promise.resolve(null),
    db.select({ id: schema.landParcels.id, areaHa: schema.landParcels.areaHa }).from(schema.landParcels).where(eq(schema.landParcels.farmId, s.farmId)).all(),
  ]);

  const tag = (id: number) => { const a = g.animals.get(id); return a ? a.managementTag || a.tagNo : `#${id}`; };
  const active = [...g.animals.values()].filter((a) => a.status === 'active');

  // Herd composition by species → class
  const herd: Record<string, { total: number; classes: Record<string, number> }> = {};
  for (const a of active) {
    const age = ageMonths(a.dob, a.birthYear);
    const cls = classify(a, age, (g.birthsByDam.get(a.id)?.length || 0) > 0 || (a.sex === 'female' && (g.childrenOf.get(a.id)?.length || 0) > 0));
    herd[a.species] ||= { total: 0, classes: {} };
    herd[a.species].total += 1;
    herd[a.species].classes[cls] = (herd[a.species].classes[cls] || 0) + 1;
  }
  const exitsThisYear = [...g.animals.values()].filter((a) => a.exitDate && a.exitDate >= yearStart);

  // Health follow-ups: latest record per animal+title
  const seen = new Set<string>();
  const healthDue = [];
  for (const r of health) {
    const key = `${r.animalId}|${r.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.nextDueDate && r.nextDueDate <= soon && g.animals.get(r.animalId)?.status === 'active') {
      healthDue.push({ id: r.id, animalId: r.animalId, animalTag: tag(r.animalId), title: r.title, date: r.nextDueDate, overdue: r.nextDueDate < t });
    }
  }
  healthDue.sort((a, b) => a.date.localeCompare(b.date));

  const withdrawals = health.filter((r) => (r.withdrawalMeatUntil && r.withdrawalMeatUntil >= t) || (r.withdrawalMilkUntil && r.withdrawalMilkUntil >= t))
    .map((r) => ({ id: r.id, animalId: r.animalId, animalTag: tag(r.animalId), title: r.title, until: [r.withdrawalMeatUntil, r.withdrawalMilkUntil].filter(Boolean).sort().pop() }));

  // One pregnancy per female: her latest pending service or scan (not scanned empty).
  const latestPending = new Map<number, typeof breeding[number]>();
  for (const b of breeding) {
    if (b.event === 'heat' || b.scanResult === 'empty' || g.animals.get(b.animalId)?.status !== 'active') continue;
    const cur = latestPending.get(b.animalId);
    if (!cur || b.date > cur.date || (b.date === cur.date && b.id > cur.id)) latestPending.set(b.animalId, b);
  }
  const pregnancies = [...latestPending.values()];
  const dueBirths = pregnancies.filter((b) => b.expectedDueDate && b.expectedDueDate <= addDays(t, 45))
    .map((b) => ({ id: b.id, animalId: b.animalId, animalTag: tag(b.animalId), date: b.expectedDueDate!, overdue: b.expectedDueDate! < t }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const dueDates = pregnancies.map((b) => b.expectedDueDate).filter((d): d is string => !!d && d >= t).sort();
  const calving = { pregnant: pregnancies.length, next: dueDates[0] ?? null, soon: dueBirths.filter((b) => !b.overdue).length, overdue: dueBirths.filter((b) => b.overdue).length };

  const equipmentAlerts = equipment.filter((e) => e.status !== 'sold' && e.status !== 'retired')
    .map((e) => ({ id: e.id, name: e.name, ...serviceStatus(e), status: e.status }))
    .filter((e) => e.serviceState === 'overdue' || e.serviceState === 'due_soon' || e.status === 'needs_attention' || e.status === 'in_repair');

  const stockAlerts = inventory.filter((i) => (i.reorderLevel != null && i.quantity <= i.reorderLevel) || (i.expiryDate && i.expiryDate <= soon))
    .map((i) => ({
      id: i.id, name: i.name, quantity: i.quantity, unit: i.unit,
      reason: i.expiryDate && i.expiryDate < t ? 'Expired' : i.expiryDate && i.expiryDate <= soon ? `Expires ${i.expiryDate}` : 'Low stock',
    }));

  const openTasks = tasks.map((x) => ({ ...x, overdue: !!x.dueDate && x.dueDate < t }));

  let money = null;
  if (txns) {
    const inc = txns.filter((x) => x.type === 'income').reduce((a, x) => a + x.amount, 0);
    const exp = txns.filter((x) => x.type === 'expense').reduce((a, x) => a + x.amount, 0);
    money = { income: inc, expense: exp, net: inc - exp };
  }

  const martNew = (await db.get<{ n: number }>(sql`SELECT COUNT(*) n FROM mart_matches WHERE farm_id = ${s.farmId} AND status = 'new'`))?.n ?? 0;
  const compliance = await complianceSummary(db, s.farmId);

  return c.json({
    data: {
      herd,
      totals: {
        activeAnimals: active.length,
        birthsThisYear: births.filter((b) => b.outcome === 'alive').length,
        birthLossesThisYear: births.filter((b) => b.outcome !== 'alive').length,
        soldThisYear: exitsThisYear.filter((a) => a.status === 'sold' || a.status === 'culled').length,
        diedThisYear: exitsThisYear.filter((a) => a.status === 'died').length,
        pregnantOrServed: pregnancies.length,
        landHa: parcels.reduce((x, p) => x + (p.areaHa || 0), 0),
        fields: parcels.length,
        equipment: equipment.filter((e) => e.status !== 'sold' && e.status !== 'retired').length,
      },
      calving,
      alerts: { healthDue, withdrawals, dueBirths, equipment: equipmentAlerts, stock: stockAlerts, martNew, compliance },
      tasks: { open: openTasks.length, overdue: openTasks.filter((x) => x.overdue).length, mine: openTasks.filter((x) => x.assigneeUserId === s.userId).slice(0, 8), upcoming: openTasks.slice(0, 8) },
      money,
      activity,
    },
  });
});

/** Calendar events for a date range: tasks, health due, expected births, equipment service/MOT/insurance. */
dashboard.get('/calendar', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const from = c.req.query('from') || addDays(today(), -31);
  const to = c.req.query('to') || addDays(today(), 62);
  const [tasks, health, breeding, equipment, animals] = await Promise.all([
    db.select().from(schema.tasks).where(and(eq(schema.tasks.farmId, s.farmId), gte(schema.tasks.dueDate, from), lte(schema.tasks.dueDate, to))).all(),
    db.select().from(schema.healthRecords).where(and(eq(schema.healthRecords.farmId, s.farmId), gte(schema.healthRecords.nextDueDate, from), lte(schema.healthRecords.nextDueDate, to))).all(),
    db.select().from(schema.breedingRecords).where(and(eq(schema.breedingRecords.farmId, s.farmId), eq(schema.breedingRecords.outcome, 'pending'), gte(schema.breedingRecords.expectedDueDate, from), lte(schema.breedingRecords.expectedDueDate, to))).all(),
    db.select().from(schema.equipment).where(eq(schema.equipment.farmId, s.farmId)).all(),
    db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag, status: schema.animals.status }).from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all(),
  ]);
  const an = new Map(animals.map((a) => [a.id, a]));
  const tag = (id: number) => an.get(id)?.managementTag || an.get(id)?.tagNo || `#${id}`;
  const events: { date: string; kind: string; title: string; link: string; done?: boolean }[] = [];
  for (const x of tasks) events.push({ date: x.dueDate!, kind: 'task', title: x.title, link: `/tasks`, done: x.status === 'done' });
  for (const x of health) if (an.get(x.animalId)?.status === 'active') events.push({ date: x.nextDueDate!, kind: 'health', title: `${x.title} — ${tag(x.animalId)}`, link: `/livestock/view?id=${x.animalId}&tab=health` });
  for (const x of breeding) if (an.get(x.animalId)?.status === 'active') events.push({ date: x.expectedDueDate!, kind: 'birth', title: `${tag(x.animalId)} due`, link: `/livestock/view?id=${x.animalId}&tab=breeding` });
  for (const e of equipment) {
    if (e.status === 'sold' || e.status === 'retired') continue;
    const st = serviceStatus(e);
    for (const [d, label] of [[st.nextServiceDate, 'service'], [e.motDue, 'MOT'], [e.insuranceDue, 'insurance']] as const) {
      if (d && d >= from && d <= to) events.push({ date: d, kind: 'equipment', title: `${e.name} ${label}`, link: `/equipment/view?id=${e.id}` });
    }
  }
  for (const f of await plannedFieldWork(db, s.farmId, from, to)) {
    events.push({ date: f.date, kind: 'field', title: `${f.label} — ${f.field}`, link: `/land/field?id=${f.parcelId}`, done: f.status === 'done' });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return c.json({ data: events });
});

export default dashboard;
