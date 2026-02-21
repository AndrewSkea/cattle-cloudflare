/**
 * Public Invite Routes - view and accept farm invites
 */

import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';
import { authMiddleware, createAuthToken, buildAuthCookie } from '../middleware/auth';

const invite = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

/**
 * GET /api/invite/:code - Public. Get invite details (farm name, role).
 */
invite.get('/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const db = c.get('db');

  const result = await db.select({
    code: schema.farmInvites.code,
    role: schema.farmInvites.role,
    maxUses: schema.farmInvites.maxUses,
    usedCount: schema.farmInvites.usedCount,
    expiresAt: schema.farmInvites.expiresAt,
    accessDuration: schema.farmInvites.accessDuration,
    farmName: schema.farms.name,
  })
    .from(schema.farmInvites)
    .innerJoin(schema.farms, eq(schema.farmInvites.farmId, schema.farms.id))
    .where(eq(schema.farmInvites.code, code))
    .get();

  if (!result) {
    return c.json({ error: 'Invite not found' }, 404);
  }

  // Check if expired
  if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
    return c.json({ error: 'Invite has expired' }, 410);
  }

  // Check if max uses reached
  if (result.maxUses && result.usedCount! >= result.maxUses) {
    return c.json({ error: 'Invite has reached maximum uses' }, 410);
  }

  return c.json({
    data: {
      farmName: result.farmName,
      role: result.role,
      accessDuration: result.accessDuration,
    },
  });
});

/**
 * POST /api/invite/:code/accept - Accept an invite. Requires auth.
 */
invite.post('/:code/accept', authMiddleware, async (c) => {
  const code = c.req.param('code').toUpperCase();
  const user = c.get('user');
  const db = c.get('db');

  const inviteRecord = await db.select()
    .from(schema.farmInvites)
    .where(eq(schema.farmInvites.code, code))
    .get();

  if (!inviteRecord) {
    return c.json({ error: 'Invite not found' }, 404);
  }

  // Validate invite
  if (inviteRecord.expiresAt && new Date(inviteRecord.expiresAt) < new Date()) {
    return c.json({ error: 'Invite has expired' }, 410);
  }

  if (inviteRecord.maxUses && inviteRecord.usedCount! >= inviteRecord.maxUses) {
    return c.json({ error: 'Invite has reached maximum uses' }, 410);
  }

  // Check not already a member
  const existingMembership = await db.select({ id: schema.farmMembers.id })
    .from(schema.farmMembers)
    .where(and(
      eq(schema.farmMembers.farmId, inviteRecord.farmId),
      eq(schema.farmMembers.userId, user.userId),
      isNull(schema.farmMembers.removedAt),
    ))
    .get();

  if (existingMembership) {
    return c.json({ error: 'Already a member of this farm' }, 409);
  }

  // Calculate expiry if accessDuration is set
  let expiresAt: string | null = null;
  if (inviteRecord.accessDuration) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + inviteRecord.accessDuration);
    expiresAt = expiry.toISOString();
  }

  // Add as member
  await db.insert(schema.farmMembers).values({
    farmId: inviteRecord.farmId,
    userId: user.userId,
    role: inviteRecord.role,
    expiresAt,
  });

  // Increment used count
  await db.update(schema.farmInvites)
    .set({ usedCount: (inviteRecord.usedCount || 0) + 1 })
    .where(eq(schema.farmInvites.id, inviteRecord.id));

  // Issue new JWT with this farm as active
  const token = await createAuthToken(c.env, {
    userId: user.userId,
    email: user.email,
    farmId: inviteRecord.farmId,
    role: inviteRecord.role,
  });

  return new Response(JSON.stringify({
    success: true,
    farmId: inviteRecord.farmId,
    role: inviteRecord.role,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildAuthCookie(token),
    },
  });
});

export default invite;
