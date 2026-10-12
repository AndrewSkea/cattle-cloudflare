/**
 * The morning reminder: what needs doing today on a farm, sent to each device that turned reminders on.
 */

import { and, desc, eq, isNotNull, lte, ne } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';
import { addDays, type Env, today } from '../lib/context';
import { complianceSummary } from './compliance';
import { type PushKeys, sendPush } from './push';

export function pushKeys(env: Env): PushKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: 'https://hooveswho.andrewskea.com' };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Short lines for today, most urgent first. Empty when there is nothing to say. */
export async function farmReminders(db: DrizzleD1Database, farmId: number, userId: number): Promise<{ title: string; lines: string[]; url: string }> {
  const t = today();
  const week = addDays(t, 7);
  const [breeding, animals, health, tasks, compliance] = await Promise.all([
    db.select({ animalId: schema.breedingRecords.animalId, event: schema.breedingRecords.event, scanResult: schema.breedingRecords.scanResult, due: schema.breedingRecords.expectedDueDate })
      .from(schema.breedingRecords)
      .where(and(eq(schema.breedingRecords.farmId, farmId), eq(schema.breedingRecords.outcome, 'pending'), isNotNull(schema.breedingRecords.expectedDueDate), lte(schema.breedingRecords.expectedDueDate, week))).all(),
    db.select({ id: schema.animals.id, status: schema.animals.status }).from(schema.animals).where(eq(schema.animals.farmId, farmId)).all(),
    db.select({ animalId: schema.healthRecords.animalId, title: schema.healthRecords.title, next: schema.healthRecords.nextDueDate })
      .from(schema.healthRecords).where(eq(schema.healthRecords.farmId, farmId)).orderBy(desc(schema.healthRecords.date), desc(schema.healthRecords.id)).all(),
    db.select({ title: schema.tasks.title, due: schema.tasks.dueDate, assignee: schema.tasks.assigneeUserId })
      .from(schema.tasks).where(and(eq(schema.tasks.farmId, farmId), ne(schema.tasks.status, 'done'), isNotNull(schema.tasks.dueDate), lte(schema.tasks.dueDate, t))).all(),
    complianceSummary(db, farmId),
  ]);
  const active = new Set(animals.filter((a) => a.status === 'active').map((a) => a.id));

  const lines: string[] = [];
  if (compliance.overdue) lines.push(`${plural(compliance.overdue, 'ScotEID report')} overdue`);
  if (compliance.dueSoon) lines.push(`${plural(compliance.dueSoon, 'ScotEID report')} due within 3 days`);

  const due = new Map<number, string>();
  for (const b of breeding) if (b.event !== 'heat' && b.scanResult !== 'empty' && active.has(b.animalId) && b.due) due.set(b.animalId, b.due);
  const dues = [...due.values()];
  const overdue = dues.filter((d) => d < t).length;
  const todayN = dues.filter((d) => d === t).length;
  const weekN = dues.filter((d) => d > t).length;
  if (overdue) lines.push(`${plural(overdue, 'cow')} past due date`);
  if (todayN) lines.push(`${plural(todayN, 'cow')} due to calve today`);
  if (weekN) lines.push(`${plural(weekN, 'cow')} due in the next 7 days`);

  // The latest record per animal + treatment decides whether a follow-up is still due
  const seen = new Set<string>();
  const healthDue = new Set<string>();
  for (const h of health) {
    const key = `${h.animalId}|${h.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (h.next && h.next <= t && active.has(h.animalId)) healthDue.add(h.title.toLowerCase());
  }
  if (healthDue.size) lines.push(`Health follow-up due: ${[...healthDue].slice(0, 3).join(', ')}${healthDue.size > 3 ? '…' : ''}`);

  const mine = tasks.filter((x) => !x.assignee || x.assignee === userId);
  if (mine.length) lines.push(mine.length === 1 ? `Task: ${mine[0].title}` : `${mine.length} tasks due`);

  const url = compliance.overdue || compliance.dueSoon ? '/traceability' : dues.length ? '/breeding' : mine.length ? '/tasks' : '/dashboard';
  return { title: lines.length === 1 ? 'HoovesWho: 1 thing today' : `HoovesWho: ${lines.length} things today`, lines, url };
}

/** Cron: one notification per subscribed device with today's reminders. Silent days send nothing. */
export async function sendDailyReminders(db: DrizzleD1Database, env: Env) {
  const keys = pushKeys(env);
  if (!keys) return { sent: 0, skipped: 'no VAPID keys' };
  const subs = await db.select().from(schema.pushSubscriptions).all();
  const cache = new Map<string, Awaited<ReturnType<typeof farmReminders>>>();
  let sent = 0, gone = 0;
  for (const s of subs) {
    const k = `${s.farmId}|${s.userId}`;
    // Still a member of the farm? Memberships can end; their devices stop getting this farm's news.
    const member = await db.select({ expiresAt: schema.farmMembers.expiresAt }).from(schema.farmMembers)
      .where(and(eq(schema.farmMembers.farmId, s.farmId), eq(schema.farmMembers.userId, s.userId))).get();
    if (!member || (member.expiresAt && new Date(member.expiresAt) < new Date())) continue;
    if (!cache.has(k)) cache.set(k, await farmReminders(db, s.farmId, s.userId));
    const r = cache.get(k)!;
    if (!r.lines.length) continue;
    const result = await sendPush(s, { title: r.title, body: r.lines.join('\n'), url: r.url, tag: 'daily' }, keys);
    if (result === 'gone') { await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id)); gone++; }
    if (result === 'ok') { await db.update(schema.pushSubscriptions).set({ lastSentAt: new Date().toISOString() }).where(eq(schema.pushSubscriptions.id, s.id)); sent++; }
  }
  return { sent, gone, devices: subs.length };
}
