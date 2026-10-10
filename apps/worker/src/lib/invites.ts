import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { HttpError, now, type Ctx } from './context';

export async function findUsableInvite(c: Ctx, code: string) {
  const invite = await c.get('db').select().from(schema.farmInvites).where(eq(schema.farmInvites.code, code)).get();
  if (!invite || invite.revokedAt) throw new HttpError(404, 'This invite link is not valid');
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) throw new HttpError(410, 'This invite link has expired');
  if (invite.maxUses != null && invite.usedCount >= invite.maxUses) throw new HttpError(410, 'This invite link has already been used');
  return invite;
}

/** Adds (or re-activates) the user's membership. Returns the farm id joined. */
export async function acceptInvite(c: Ctx, code: string, userId: number, email: string): Promise<number> {
  const db = c.get('db');
  const invite = await findUsableInvite(c, code);
  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
    throw new HttpError(403, `This invite is for ${invite.email}. Sign in with that Google account.`);
  }

  const expiresAt = invite.accessDays ? new Date(Date.now() + invite.accessDays * 86400_000).toISOString() : null;
  const existing = await db.select().from(schema.farmMembers)
    .where(and(eq(schema.farmMembers.farmId, invite.farmId), eq(schema.farmMembers.userId, userId))).get();

  if (existing && !existing.removedAt && !(existing.expiresAt && new Date(existing.expiresAt) < new Date())) {
    return invite.farmId; // already a member — don't downgrade/upgrade via invite
  }

  if (existing) {
    await db.update(schema.farmMembers)
      .set({ role: invite.role, removedAt: null, expiresAt, joinedAt: now() })
      .where(eq(schema.farmMembers.id, existing.id));
  } else {
    await db.insert(schema.farmMembers).values({ farmId: invite.farmId, userId, role: invite.role, expiresAt });
  }
  await db.update(schema.farmInvites)
    .set({ usedCount: sql`${schema.farmInvites.usedCount} + 1` })
    .where(eq(schema.farmInvites.id, invite.id));
  await db.insert(schema.activityLog).values({
    farmId: invite.farmId, userId, action: 'joined', entity: 'member', entityId: userId,
    summary: `${email} joined as ${invite.role}`,
  });
  return invite.farmId;
}
