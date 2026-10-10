/**
 * Session tokens, cookies and the auth middleware.
 *
 * The app and API share one origin, so the session is a first-party HttpOnly SameSite=Lax cookie.
 * The role is always re-read from farm_members so revocations take effect immediately.
 */

import type { MiddlewareHandler } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppEnv, Ctx, Env, Role } from './context';

const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

export function readCookie(c: Ctx, name: string): string | null {
  const header = c.req.header('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function cookie(c: Ctx, name: string, value: string, maxAgeSeconds: number): string {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function signSession(env: Env, userId: number, farmId: number | null): Promise<string> {
  return new SignJWT({ farmId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(new TextEncoder().encode(env.JWT_SECRET));
}

export async function sessionCookie(c: Ctx, userId: number, farmId: number | null): Promise<string> {
  return cookie(c, SESSION_COOKIE, await signSession(c.env, userId, farmId), SESSION_DAYS * 86400);
}

export function clearSessionCookie(c: Ctx): string {
  return cookie(c, SESSION_COOKIE, '', 0);
}

/** Active (not removed, not expired) membership or null. */
export async function activeMembership(c: Ctx, userId: number, farmId: number) {
  const m = await c.get('db').select().from(schema.farmMembers)
    .where(and(eq(schema.farmMembers.farmId, farmId), eq(schema.farmMembers.userId, userId), isNull(schema.farmMembers.removedAt)))
    .get();
  if (!m) return null;
  if (m.expiresAt && new Date(m.expiresAt) < new Date()) return null;
  return m;
}

/** Requires a valid session cookie. Sets `session` with the current role for the active farm. */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: 'Not signed in' }, 401);

  let userId: number;
  let farmId: number | null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(c.env.JWT_SECRET));
    userId = Number(payload.sub);
    farmId = typeof payload.farmId === 'number' ? payload.farmId : null;
  } catch {
    return c.json({ error: 'Session expired' }, 401, { 'Set-Cookie': clearSessionCookie(c) });
  }

  const user = await c.get('db').select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return c.json({ error: 'Not signed in' }, 401, { 'Set-Cookie': clearSessionCookie(c) });

  let role: Role | null = null;
  if (farmId) {
    const m = await activeMembership(c, userId, farmId);
    if (m) role = m.role as Role;
    else farmId = null; // access revoked or expired — behave as "no active farm"
  }

  c.set('session', { userId, email: user.email, farmId, role });
  await next();
};
