/**
 * Reminder notifications: devices subscribe here (Web Push) and get the morning reminder from the daily cron.
 */

import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, HttpError, body, farmSession, requireRole } from '../lib/context';
import { optText } from '../lib/validators';
import { farmReminders, pushKeys } from '../services/reminders';
import { sendPush } from '../services/push';

const push = new Hono<AppEnv>();
push.use('*', requireRole('viewer'));

push.get('/', async (c) => {
  const s = farmSession(c);
  const devices = await c.get('db').select({
    id: schema.pushSubscriptions.id, endpoint: schema.pushSubscriptions.endpoint, label: schema.pushSubscriptions.label,
    lastSentAt: schema.pushSubscriptions.lastSentAt, createdAt: schema.pushSubscriptions.createdAt,
  }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, s.userId)).all();
  return c.json({ data: { publicKey: c.env.VAPID_PUBLIC_KEY || null, devices } });
});

push.post('/subscribe', async (c) => {
  const s = farmSession(c);
  if (!pushKeys(c.env)) throw new HttpError(409, 'Reminders aren’t set up on this server yet');
  const data = await body(c, z.object({
    endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'must be https'),
    keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
    label: optText(60),
  }));
  const db = c.get('db');
  const values = { userId: s.userId, farmId: s.farmId, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, label: data.label ?? null };
  // The same device re-subscribing (or switching farm) replaces its row.
  await db.insert(schema.pushSubscriptions).values(values)
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: s.userId, farmId: s.farmId, p256dh: values.p256dh, auth: values.auth, label: values.label } });
  return c.json({ ok: true }, 201);
});

push.post('/unsubscribe', async (c) => {
  const s = farmSession(c);
  const { endpoint } = await body(c, z.object({ endpoint: z.string().max(1000) }));
  await c.get('db').delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, s.userId)));
  return c.json({ ok: true });
});

/** Sends today's reminder (or a "you're set up" note) to this person's devices now. */
push.post('/test', async (c) => {
  const s = farmSession(c);
  const keys = pushKeys(c.env);
  if (!keys) throw new HttpError(409, 'Reminders aren’t set up on this server yet');
  const db = c.get('db');
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, s.userId)).all();
  if (!subs.length) throw new HttpError(409, 'Turn on reminders on this device first');
  const r = await farmReminders(db, s.farmId, s.userId);
  const payload = r.lines.length
    ? { title: r.title, body: r.lines.join('\n'), url: r.url, tag: 'daily' }
    : { title: 'HoovesWho reminders are on', body: 'Nothing needs doing today. You’ll get a note at 8am when something does.', url: '/dashboard', tag: 'test' };
  let sent = 0;
  for (const sub of subs) {
    const res = await sendPush(sub, payload, keys);
    if (res === 'gone') await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
    if (res === 'ok') sent++;
  }
  return c.json({ data: { sent, devices: subs.length } });
});

export default push;
