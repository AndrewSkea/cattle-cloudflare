/**
 * Farm Routes - CRUD, member management, invites
 */

import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';
import { authMiddleware, requireRole, createAuthToken, buildAuthCookie } from '../middleware/auth';

const farms = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

// All farm routes require authentication
farms.use('*', authMiddleware);

// ==================== FARM CRUD ====================

/**
 * POST /api/farms - Create a new farm. Creator becomes Owner.
 */
const createFarmSchema = z.object({
  name: z.string().min(1).max(100),
});

farms.post('/', zValidator('json', createFarmSchema), async (c) => {
  const { name } = c.req.valid('json');
  const user = c.get('user');
  const db = c.get('db');

  // Generate slug from name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Check slug uniqueness
  const existing = await db.select({ id: schema.farms.id })
    .from(schema.farms)
    .where(eq(schema.farms.slug, slug))
    .get();

  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  // Create farm
  const [farm] = await db.insert(schema.farms).values({
    name,
    slug: finalSlug,
  }).returning();

  // Add creator as owner
  await db.insert(schema.farmMembers).values({
    farmId: farm.id,
    userId: user.userId,
    role: 'owner',
  });

  // Issue new JWT with farm context
  const token = await createAuthToken(c.env, {
    userId: user.userId,
    email: user.email,
    farmId: farm.id,
    role: 'owner',
  });

  return new Response(JSON.stringify({ data: farm }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildAuthCookie(token),
    },
  });
});

/**
 * GET /api/farms - List farms the user belongs to.
 */
farms.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  const memberships = await db.select({
    farmId: schema.farmMembers.farmId,
    role: schema.farmMembers.role,
    joinedAt: schema.farmMembers.joinedAt,
    expiresAt: schema.farmMembers.expiresAt,
    farmName: schema.farms.name,
    farmSlug: schema.farms.slug,
  })
    .from(schema.farmMembers)
    .innerJoin(schema.farms, eq(schema.farmMembers.farmId, schema.farms.id))
    .where(and(
      eq(schema.farmMembers.userId, user.userId),
      isNull(schema.farmMembers.removedAt),
    ))
    .all();

  // Filter expired memberships
  const active = memberships.filter(m => {
    if (m.expiresAt && new Date(m.expiresAt) < new Date()) return false;
    return true;
  });

  return c.json({ data: active });
});

/**
 * PUT /api/farms/:id - Update farm details. Owner only.
 */
farms.put('/:id', requireRole('owner'), zValidator('json', z.object({
  name: z.string().min(1).max(100).optional(),
})), async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const user = c.get('user');
  const db = c.get('db');

  if (user.activeFarmId !== farmId) {
    return c.json({ error: 'Not your active farm' }, 403);
  }

  const updates = c.req.valid('json');
  const updateData: any = { updatedAt: new Date().toISOString() };
  if (updates.name) {
    updateData.name = updates.name;
    updateData.slug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  await db.update(schema.farms)
    .set(updateData)
    .where(eq(schema.farms.id, farmId));

  return c.json({ success: true });
});

/**
 * DELETE /api/farms/:id - Delete farm. Owner only.
 */
farms.delete('/:id', requireRole('owner'), async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const user = c.get('user');
  const db = c.get('db');

  if (user.activeFarmId !== farmId) {
    return c.json({ error: 'Not your active farm' }, 403);
  }

  await db.delete(schema.farms).where(eq(schema.farms.id, farmId));

  return c.json({ success: true });
});

/**
 * POST /api/farms/:id/switch - Switch active farm. Issues new JWT.
 */
farms.post('/:id/switch', async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const user = c.get('user');
  const db = c.get('db');

  // Verify membership
  const membership = await db.select()
    .from(schema.farmMembers)
    .where(and(
      eq(schema.farmMembers.farmId, farmId),
      eq(schema.farmMembers.userId, user.userId),
      isNull(schema.farmMembers.removedAt),
    ))
    .get();

  if (!membership) {
    return c.json({ error: 'Not a member of this farm' }, 403);
  }

  if (membership.expiresAt && new Date(membership.expiresAt) < new Date()) {
    return c.json({ error: 'Farm access expired' }, 403);
  }

  const token = await createAuthToken(c.env, {
    userId: user.userId,
    email: user.email,
    farmId: farmId,
    role: membership.role,
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildAuthCookie(token),
    },
  });
});

// ==================== MEMBER MANAGEMENT ====================

/**
 * GET /api/farms/:id/members - List farm members. Manager+ only.
 */
farms.get('/:id/members', requireRole('manager'), async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const user = c.get('user');
  const db = c.get('db');

  if (user.activeFarmId !== farmId) {
    return c.json({ error: 'Not your active farm' }, 403);
  }

  const members = await db.select({
    id: schema.farmMembers.id,
    userId: schema.farmMembers.userId,
    role: schema.farmMembers.role,
    joinedAt: schema.farmMembers.joinedAt,
    expiresAt: schema.farmMembers.expiresAt,
    removedAt: schema.farmMembers.removedAt,
    userName: schema.users.name,
    userEmail: schema.users.email,
    userAvatar: schema.users.avatarUrl,
  })
    .from(schema.farmMembers)
    .innerJoin(schema.users, eq(schema.farmMembers.userId, schema.users.id))
    .where(eq(schema.farmMembers.farmId, farmId))
    .all();

  return c.json({ data: members });
});

/**
 * PUT /api/farms/:id/members/:userId - Update member role/expiry. Owner only.
 */
farms.put('/:id/members/:userId', requireRole('owner'), zValidator('json', z.object({
  role: z.enum(['owner', 'manager', 'worker', 'viewer']).optional(),
  expiresAt: z.string().nullable().optional(),
})), async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const targetUserId = parseInt(c.req.param('userId'));
  const user = c.get('user');
  const db = c.get('db');

  if (user.activeFarmId !== farmId) {
    return c.json({ error: 'Not your active farm' }, 403);
  }

  // Can't modify yourself
  if (targetUserId === user.userId) {
    return c.json({ error: 'Cannot modify your own membership' }, 400);
  }

  const updates = c.req.valid('json');
  const updateData: any = {};
  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.expiresAt !== undefined) updateData.expiresAt = updates.expiresAt;

  await db.update(schema.farmMembers)
    .set(updateData)
    .where(and(
      eq(schema.farmMembers.farmId, farmId),
      eq(schema.farmMembers.userId, targetUserId),
    ));

  return c.json({ success: true });
});

/**
 * DELETE /api/farms/:id/members/:userId - Remove member. Owner only.
 */
farms.delete('/:id/members/:userId', requireRole('owner'), async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const targetUserId = parseInt(c.req.param('userId'));
  const user = c.get('user');
  const db = c.get('db');

  if (user.activeFarmId !== farmId) {
    return c.json({ error: 'Not your active farm' }, 403);
  }

  if (targetUserId === user.userId) {
    return c.json({ error: 'Cannot remove yourself' }, 400);
  }

  // Soft delete - set removedAt
  await db.update(schema.farmMembers)
    .set({ removedAt: new Date().toISOString() })
    .where(and(
      eq(schema.farmMembers.farmId, farmId),
      eq(schema.farmMembers.userId, targetUserId),
    ));

  return c.json({ success: true });
});

// ==================== INVITE MANAGEMENT ====================

/**
 * POST /api/farms/:id/invites - Create invite. Owner/Manager only.
 */
const createInviteSchema = z.object({
  role: z.enum(['manager', 'worker', 'viewer']),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  accessDuration: z.number().int().positive().nullable().optional(), // days
});

farms.post('/:id/invites', requireRole('manager'), zValidator('json', createInviteSchema), async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const user = c.get('user');
  const db = c.get('db');

  if (user.activeFarmId !== farmId) {
    return c.json({ error: 'Not your active farm' }, 403);
  }

  const data = c.req.valid('json');

  // Generate random 8-character code
  const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 8)
    .toUpperCase();

  const [invite] = await db.insert(schema.farmInvites).values({
    farmId,
    code,
    role: data.role,
    maxUses: data.maxUses ?? null,
    accessDuration: data.accessDuration ?? null,
    expiresAt: data.expiresAt ?? null,
    createdBy: user.userId,
  }).returning();

  return c.json({ data: invite }, 201);
});

/**
 * GET /api/farms/:id/invites - List active invites. Owner/Manager only.
 */
farms.get('/:id/invites', requireRole('manager'), async (c) => {
  const farmId = parseInt(c.req.param('id'));
  const user = c.get('user');
  const db = c.get('db');

  if (user.activeFarmId !== farmId) {
    return c.json({ error: 'Not your active farm' }, 403);
  }

  const invites = await db.select()
    .from(schema.farmInvites)
    .where(eq(schema.farmInvites.farmId, farmId))
    .all();

  return c.json({ data: invites });
});

/**
 * DELETE /api/farms/:id/invites/:inviteId - Revoke invite. Owner/Manager only.
 */
farms.delete('/:id/invites/:inviteId', requireRole('manager'), async (c) => {
  const inviteId = parseInt(c.req.param('inviteId'));
  const db = c.get('db');

  await db.delete(schema.farmInvites)
    .where(eq(schema.farmInvites.id, inviteId));

  return c.json({ success: true });
});

export default farms;
