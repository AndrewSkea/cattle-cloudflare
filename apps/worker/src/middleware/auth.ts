/**
 * Authentication & Authorization Middleware
 */

import { Context, Next } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY = ['viewer', 'worker', 'manager', 'owner'] as const;
type Role = typeof ROLE_HIERARCHY[number];

/**
 * JWT auth middleware - verifies token and attaches user to context.
 * Sets userId, activeFarmId, and role on the Hono context.
 */
export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>, next: Next) {
  const cookie = c.req.header('Cookie');
  const token = parseCookie(cookie || '', 'auth_token');

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    const user: AuthUser = {
      userId: payload.sub as unknown as number,
      email: payload.email as string,
      activeFarmId: (payload.farmId as number) || null,
      role: (payload.role as string) || null,
    };

    // If user has an active farm, verify membership is still valid
    if (user.activeFarmId && user.role) {
      const db = c.get('db');
      const membership = await db.select()
        .from(schema.farmMembers)
        .where(and(
          eq(schema.farmMembers.farmId, user.activeFarmId),
          eq(schema.farmMembers.userId, user.userId),
          isNull(schema.farmMembers.removedAt),
        ))
        .get();

      if (!membership) {
        return c.json({ error: 'Farm membership revoked' }, 403);
      }

      // Check expiry
      if (membership.expiresAt && new Date(membership.expiresAt) < new Date()) {
        return c.json({ error: 'Farm access expired' }, 403);
      }

      // Use the role from DB (in case it was updated since JWT was issued)
      user.role = membership.role;
    }

    c.set('user', user);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

/**
 * Role-checking middleware factory.
 * Usage: app.get('/path', requireRole('manager'), handler)
 */
export function requireRole(minimumRole: Role) {
  return async (c: Context<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>, next: Next) => {
    const user = c.get('user');

    if (!user.activeFarmId || !user.role) {
      return c.json({ error: 'No active farm selected' }, 403);
    }

    const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role as Role);
    const requiredRoleIndex = ROLE_HIERARCHY.indexOf(minimumRole);

    if (userRoleIndex < requiredRoleIndex) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
}

/**
 * Parse a specific cookie value from the Cookie header string.
 */
function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Create a signed JWT for a user.
 */
export async function createAuthToken(
  env: Env,
  payload: { userId: number; email: string; farmId?: number; role?: string },
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  return new SignJWT({
    email: payload.email,
    farmId: payload.farmId || null,
    role: payload.role || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

/**
 * Build a Set-Cookie header value for the auth token.
 */
export function buildAuthCookie(token: string, maxAge: number = 7 * 24 * 60 * 60): string {
  return `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/**
 * Build a Set-Cookie header value that clears the auth token.
 */
export function clearAuthCookie(): string {
  return `auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
