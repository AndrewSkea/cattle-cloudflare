/**
 * Farms: create (onboarding), current-farm settings, members & roles, invites.
 */

import { Hono } from 'hono';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import {
  type AppEnv, type Role, HttpError, body, farmSession, logActivity, now, requireRole, roleAtLeast,
} from '../lib/context';
import { HIDEABLE_SECTIONS, optText, SPECIES } from '../lib/validators';
import { sessionCookie } from '../lib/auth';
import { acceptInvite, findUsableInvite } from '../lib/invites';

const farmFields = z.object({
  name: z.string().trim().min(1, 'is required').max(100),
  holdingNumber: optText(50),
  herdMark: z.string().trim().regex(/^\d{6}$/, 'is the 6-digit number on your ear tags after "UK"').nullish().or(z.literal('').transform(() => null)),
  address: optText(300),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  zoom: z.number().int().min(1).max(20).nullish(),
  boundary: z.string().max(200_000).nullish(),
  currency: z.enum(['GBP', 'EUR', 'USD', 'AUD', 'NZD', 'CAD']).default('GBP'),
  areaUnit: z.enum(['ha', 'ac']).default('ha'),
  species: z.array(z.enum(SPECIES)).min(1).default(['cattle']),
  hiddenSections: z.array(z.enum(HIDEABLE_SECTIONS)).default([]),
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'farm';
}

// ---------- /api/farms (create) ----------

export const farmsCreate = new Hono<AppEnv>();

farmsCreate.post('/', async (c) => {
  const s = c.get('session');
  const data = await body(c, farmFields);
  const db = c.get('db');
  const slug = `${slugify(data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  const [farm] = await db.insert(schema.farms).values({ ...data, species: JSON.stringify(data.species), hiddenSections: JSON.stringify(data.hiddenSections), slug }).returning();
  await db.insert(schema.farmMembers).values({ farmId: farm.id, userId: s.userId, role: 'owner' });
  await db.update(schema.users).set({ lastFarmId: farm.id }).where(eq(schema.users.id, s.userId));
  await db.insert(schema.activityLog).values({ farmId: farm.id, userId: s.userId, action: 'created', entity: 'farm', entityId: farm.id, summary: `Created farm ${farm.name}` });
  return c.json({ data: farm }, 201, { 'Set-Cookie': await sessionCookie(c, s.userId, farm.id) });
});

// ---------- /api/invites (public preview, accept) ----------

export const invitesPublic = new Hono<AppEnv>();

invitesPublic.get('/:code', async (c) => {
  const invite = await findUsableInvite(c, c.req.param('code'));
  const db = c.get('db');
  const farm = await db.select({ name: schema.farms.name }).from(schema.farms).where(eq(schema.farms.id, invite.farmId)).get();
  const by = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, invite.createdBy)).get();
  return c.json({ data: { farmName: farm?.name, role: invite.role, invitedBy: by?.name, email: invite.email, accessDays: invite.accessDays } });
});

// ---------- /api/farm (current farm) ----------

const farm = new Hono<AppEnv>();

farm.post('/join', async (c) => {
  const s = c.get('session');
  const { code } = await body(c, z.object({ code: z.string().trim().min(4) }));
  const farmId = await acceptInvite(c, code, s.userId, s.email);
  await c.get('db').update(schema.users).set({ lastFarmId: farmId }).where(eq(schema.users.id, s.userId));
  return c.json({ farmId }, 200, { 'Set-Cookie': await sessionCookie(c, s.userId, farmId) });
});

farm.get('/', requireRole('viewer'), async (c) => {
  const s = farmSession(c);
  const f = await c.get('db').select().from(schema.farms).where(eq(schema.farms.id, s.farmId)).get();
  if (!f) throw new HttpError(404, 'Farm not found');
  return c.json({ data: { ...f, species: JSON.parse(f.species), hiddenSections: JSON.parse(f.hiddenSections) } });
});

farm.put('/', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const data = await body(c, farmFields.partial());
  const { species, hiddenSections, ...rest } = data;
  await c.get('db').update(schema.farms)
    .set({
      ...rest, ...(species ? { species: JSON.stringify(species) } : {}),
      ...(hiddenSections ? { hiddenSections: JSON.stringify(hiddenSections) } : {}), updatedAt: now(),
    })
    .where(eq(schema.farms.id, s.farmId));
  await logActivity(c, 'updated', 'farm', s.farmId, 'Updated farm settings');
  return c.json({ ok: true });
});

farm.delete('/', requireRole('owner'), async (c) => {
  const s = farmSession(c);
  const { confirmName } = await body(c, z.object({ confirmName: z.string() }));
  const db = c.get('db');
  const f = await db.select().from(schema.farms).where(eq(schema.farms.id, s.farmId)).get();
  if (!f || f.name !== confirmName) throw new HttpError(422, 'Type the farm name exactly to confirm');
  await db.delete(schema.farms).where(eq(schema.farms.id, s.farmId));
  return c.json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(c, s.userId, null) });
});

// ----- Members -----

farm.get('/members', requireRole('viewer'), async (c) => {
  const s = farmSession(c);
  const rows = await c.get('db').select({
    userId: schema.users.id, name: schema.users.name, email: schema.users.email, avatarUrl: schema.users.avatarUrl,
    role: schema.farmMembers.role, joinedAt: schema.farmMembers.joinedAt, expiresAt: schema.farmMembers.expiresAt,
    lastLoginAt: schema.users.lastLoginAt,
  }).from(schema.farmMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.farmMembers.userId))
    .where(and(eq(schema.farmMembers.farmId, s.farmId), isNull(schema.farmMembers.removedAt)))
    .all();
  const active = rows.filter((r) => !r.expiresAt || new Date(r.expiresAt) > new Date());
  return c.json({ data: active });
});

async function loadMember(c: any, farmId: number, userId: number) {
  const m = await c.get('db').select().from(schema.farmMembers)
    .where(and(eq(schema.farmMembers.farmId, farmId), eq(schema.farmMembers.userId, userId), isNull(schema.farmMembers.removedAt))).get();
  if (!m) throw new HttpError(404, 'Member not found');
  return m;
}

async function ownerCount(c: any, farmId: number) {
  const owners = await c.get('db').select({ id: schema.farmMembers.id }).from(schema.farmMembers)
    .where(and(eq(schema.farmMembers.farmId, farmId), eq(schema.farmMembers.role, 'owner'), isNull(schema.farmMembers.removedAt))).all();
  return owners.length;
}

/** Managers may manage workers/viewers; only owners may touch managers/owners. */
function assertCanManage(actor: Role, targetRole: Role, newRole?: Role) {
  const limit: Role = actor === 'owner' ? 'owner' : 'worker';
  if (!roleAtLeast(actor, 'manager') || !roleAtLeast(limit, targetRole) || (newRole && !roleAtLeast(limit, newRole))) {
    throw new HttpError(403, 'Only an owner can change managers and owners');
  }
}

farm.put('/members/:userId', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const userId = Number(c.req.param('userId'));
  if (userId === s.userId) throw new HttpError(422, 'You cannot change your own role');
  const data = await body(c, z.object({ role: z.enum(['owner', 'manager', 'worker', 'viewer']), expiresAt: z.string().nullish() }));
  const m = await loadMember(c, s.farmId, userId);
  assertCanManage(s.role, m.role as Role, data.role);
  await c.get('db').update(schema.farmMembers).set({ role: data.role, expiresAt: data.expiresAt ?? null }).where(eq(schema.farmMembers.id, m.id));
  await logActivity(c, 'updated', 'member', userId, `Changed a member's role to ${data.role}`);
  return c.json({ ok: true });
});

farm.delete('/members/:userId', requireRole('viewer'), async (c) => {
  const s = farmSession(c);
  const userId = Number(c.req.param('userId'));
  const m = await loadMember(c, s.farmId, userId);
  if (userId !== s.userId) assertCanManage(s.role, m.role as Role);
  if (m.role === 'owner' && await ownerCount(c, s.farmId) <= 1) {
    throw new HttpError(422, 'A farm needs at least one owner. Make someone else an owner first.');
  }
  await c.get('db').update(schema.farmMembers).set({ removedAt: now() }).where(eq(schema.farmMembers.id, m.id));
  await logActivity(c, 'removed', 'member', userId, userId === s.userId ? 'Left the farm' : 'Removed a member');
  const headers: Record<string, string> = userId === s.userId ? { 'Set-Cookie': await sessionCookie(c, s.userId, null) } : {};
  return c.json({ ok: true }, 200, headers);
});

// ----- Invites -----

farm.get('/invites', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const rows = await c.get('db').select().from(schema.farmInvites)
    .where(and(eq(schema.farmInvites.farmId, s.farmId), isNull(schema.farmInvites.revokedAt)))
    .orderBy(desc(schema.farmInvites.createdAt)).all();
  const usable = rows.filter((i) => (!i.expiresAt || new Date(i.expiresAt) > new Date()) && (i.maxUses == null || i.usedCount < i.maxUses));
  return c.json({ data: usable });
});

farm.post('/invites', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const data = await body(c, z.object({
    role: z.enum(['owner', 'manager', 'worker', 'viewer']),
    email: z.string().email().nullish().or(z.literal('').transform(() => null)),
    note: optText(200),
    maxUses: z.number().int().min(1).max(1000).nullish(),
    accessDays: z.number().int().min(1).max(3650).nullish(),
    linkValidDays: z.number().int().min(1).max(90).default(14),
  }));
  if (s.role !== 'owner' && roleAtLeast(data.role, 'manager')) throw new HttpError(403, 'Only an owner can invite managers or owners');
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const code = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
  const [invite] = await c.get('db').insert(schema.farmInvites).values({
    farmId: s.farmId, code, role: data.role, email: data.email?.toLowerCase() ?? null, note: data.note,
    maxUses: data.maxUses ?? (data.email ? 1 : null), accessDays: data.accessDays ?? null,
    expiresAt: new Date(Date.now() + data.linkValidDays * 86400_000).toISOString(), createdBy: s.userId,
  }).returning();
  await logActivity(c, 'created', 'invite', invite.id, `Created a ${data.role} invite${data.email ? ` for ${data.email}` : ''}`);
  return c.json({ data: invite }, 201);
});

farm.delete('/invites/:id', requireRole('manager'), async (c) => {
  const s = farmSession(c);
  const id = Number(c.req.param('id'));
  await c.get('db').update(schema.farmInvites).set({ revokedAt: now() })
    .where(and(eq(schema.farmInvites.id, id), eq(schema.farmInvites.farmId, s.farmId)));
  return c.json({ ok: true });
});

// ----- Activity -----

farm.get('/activity', requireRole('viewer'), async (c) => {
  const s = farmSession(c);
  const limit = Math.min(Number(c.req.query('limit')) || 30, 200);
  const rows = await c.get('db').select({
    id: schema.activityLog.id, action: schema.activityLog.action, entity: schema.activityLog.entity,
    entityId: schema.activityLog.entityId, summary: schema.activityLog.summary, createdAt: schema.activityLog.createdAt,
    userName: schema.users.name, userEmail: schema.users.email,
  }).from(schema.activityLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.activityLog.userId))
    .where(eq(schema.activityLog.farmId, s.farmId))
    .orderBy(desc(schema.activityLog.id)).limit(limit).all();
  return c.json({ data: rows });
});

export default farm;
