/**
 * Auth: Google OAuth sign-in, session, profile and farm switching.
 */

import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, type Ctx, HttpError, body, now } from '../lib/context';
import { optText } from '../lib/validators';
import {
  activeMembership, authMiddleware, clearSessionCookie, cookie, readCookie, sessionCookie,
} from '../lib/auth';
import { acceptInvite } from '../lib/invites';

const auth = new Hono<AppEnv>();

const STATE_COOKIE = 'oauth_state';

function safeNext(next: string | undefined | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

/** Picks the farm a user lands in: preferred → last used → first active membership. */
async function pickFarm(c: Ctx, userId: number, preferred: number | null): Promise<number | null> {
  const db = c.get('db');
  if (preferred && await activeMembership(c, userId, preferred)) return preferred;
  const user = await db.select({ lastFarmId: schema.users.lastFarmId }).from(schema.users).where(eq(schema.users.id, userId)).get();
  if (user?.lastFarmId && await activeMembership(c, userId, user.lastFarmId)) return user.lastFarmId;
  const all = await db.select().from(schema.farmMembers)
    .where(and(eq(schema.farmMembers.userId, userId), isNull(schema.farmMembers.removedAt))).all();
  const active = all.find((m) => !m.expiresAt || new Date(m.expiresAt) > new Date());
  return active?.farmId ?? null;
}

/** Signs a user in: optional invite, farm choice, session cookie. Returns redirect target + cookie. */
async function completeSignIn(c: Ctx, userId: number, email: string, invite: string | null, next: string | null) {
  const db = c.get('db');
  let preferred: number | null = null;
  let inviteError: string | null = null;
  if (invite) {
    try {
      preferred = await acceptInvite(c, invite, userId, email);
    } catch (e) {
      inviteError = e instanceof HttpError ? e.message : 'Could not accept invite';
    }
  }
  const farmId = await pickFarm(c, userId, preferred);
  await db.update(schema.users).set({ lastFarmId: farmId, lastLoginAt: now() }).where(eq(schema.users.id, userId));

  let target = next || '/dashboard';
  if (inviteError) target = `/join?code=${encodeURIComponent(invite!)}&error=${encodeURIComponent(inviteError)}`;
  else if (!farmId) target = '/onboarding';
  return { target, cookie: await sessionCookie(c, userId, farmId), farmId };
}

/**
 * GET /api/auth/google?next=/path&invite=CODE — starts Google sign-in (top-level navigation).
 */
auth.get('/google', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.redirect('/login?error=Google+sign-in+is+not+configured');
  const state = crypto.randomUUID();
  const payload = JSON.stringify({ state, next: safeNext(c.req.query('next')), invite: c.req.query('invite') || null });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${new URL(c.req.url).origin}/api/auth/callback/google`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  return redirect(url.toString(), [cookie(c, STATE_COOKIE, payload, 600)]);
});

auth.get('/callback/google', async (c) => {
  const clearState = cookie(c, STATE_COOKIE, '', 0);
  const fail = (msg: string) => redirect(`/login?error=${encodeURIComponent(msg)}`, [clearState]);

  if (c.req.query('error')) return fail('Google sign-in was cancelled');
  const code = c.req.query('code');
  const raw = readCookie(c, STATE_COOKIE);
  let saved: { state: string; next: string | null; invite: string | null } | null = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
  if (!code || !saved || saved.state !== c.req.query('state')) {
    return fail('Sign-in session expired. Please try again.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${new URL(c.req.url).origin}/api/auth/callback/google`,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json() as { access_token?: string };
  if (!tokens.access_token) return fail('Google sign-in failed. Please try again.');

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const info = await infoRes.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!info.sub || !info.email) return fail('Google did not return your account details');
  if (!info.email_verified) return fail('Your Google email address is not verified');

  const db = c.get('db');
  const email = info.email.toLowerCase();
  let user = await db.select().from(schema.users).where(eq(schema.users.googleId, info.sub)).get();
  if (!user) {
    // Pre-provisioned account (e.g. farm owner from data import) — link on first sign-in.
    const byEmail = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (byEmail && byEmail.googleId && byEmail.googleId !== info.sub) {
      return fail('This email is already linked to a different Google account');
    }
    if (byEmail) {
      await db.update(schema.users).set({ googleId: info.sub, name: byEmail.name || info.name || null, avatarUrl: info.picture || null, updatedAt: now() })
        .where(eq(schema.users.id, byEmail.id));
      user = { ...byEmail, googleId: info.sub };
    } else {
      [user] = await db.insert(schema.users).values({
        googleId: info.sub, email, name: info.name || null, avatarUrl: info.picture || null,
      }).returning();
    }
  } else {
    await db.update(schema.users).set({ email, avatarUrl: info.picture || user.avatarUrl, updatedAt: now() })
      .where(eq(schema.users.id, user.id));
  }

  const result = await completeSignIn(c, user.id, email, saved.invite, saved.next);
  return redirect(result.target, [clearState, result.cookie]);
});

/**
 * POST /api/auth/dev-login — local development & tests only (DEV_AUTH_ENABLED in .dev.vars).
 */
auth.post('/dev-login', async (c) => {
  if (c.env.DEV_AUTH_ENABLED !== 'true' || c.env.ENVIRONMENT === 'production') return c.json({ error: 'Not Found' }, 404);
  const { email, name, invite } = await body(c, z.object({
    email: z.string().email(), name: z.string().optional(), invite: z.string().optional(),
  }));
  const db = c.get('db');
  const lower = email.toLowerCase();
  let user = await db.select().from(schema.users).where(eq(schema.users.email, lower)).get();
  if (!user) {
    [user] = await db.insert(schema.users).values({ googleId: `dev:${lower}`, email: lower, name: name || null }).returning();
  }
  const result = await completeSignIn(c, user.id, lower, invite || null, null);
  return c.json({ redirect: result.target, farmId: result.farmId }, 200, { 'Set-Cookie': result.cookie });
});

auth.post('/logout', (c) => c.json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(c) }));

auth.use('/me', authMiddleware);
auth.use('/switch-farm', authMiddleware);

auth.get('/me', async (c) => {
  const s = c.get('session');
  const db = c.get('db');
  const user = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).get();
  if (!user) throw new HttpError(401, 'Not signed in');

  const rows = await db.select({
    id: schema.farms.id, name: schema.farms.name, role: schema.farmMembers.role,
    expiresAt: schema.farmMembers.expiresAt, joinedAt: schema.farmMembers.joinedAt,
  }).from(schema.farmMembers)
    .innerJoin(schema.farms, eq(schema.farms.id, schema.farmMembers.farmId))
    .where(and(eq(schema.farmMembers.userId, s.userId), isNull(schema.farmMembers.removedAt)))
    .all();
  const farms = rows.filter((r) => !r.expiresAt || new Date(r.expiresAt) > new Date());

  const farm = s.farmId ? await db.select().from(schema.farms).where(eq(schema.farms.id, s.farmId)).get() : null;

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, phone: user.phone, createdAt: user.createdAt },
    farms,
    farm: farm ? { ...farm, species: JSON.parse(farm.species || '[]') } : null,
    role: s.role,
  });
});

auth.put('/me', async (c) => {
  const s = c.get('session');
  const data = await body(c, z.object({ name: z.string().trim().min(1).max(100), phone: optText(40) }));
  await c.get('db').update(schema.users).set({ ...data, updatedAt: now() }).where(eq(schema.users.id, s.userId));
  return c.json({ ok: true });
});

auth.post('/switch-farm', async (c) => {
  const s = c.get('session');
  const { farmId } = await body(c, z.object({ farmId: z.number().int().positive() }));
  if (!await activeMembership(c, s.userId, farmId)) throw new HttpError(403, 'You are not a member of that farm');
  await c.get('db').update(schema.users).set({ lastFarmId: farmId }).where(eq(schema.users.id, s.userId));
  return c.json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(c, s.userId, farmId) });
});

export default auth;
