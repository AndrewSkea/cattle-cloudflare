/**
 * Auth Routes - Google OAuth, Turnstile verification, JWT management
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../types';
import type { DrizzleD1Database } from '../db/client';
import { createAuthToken, buildAuthCookie, clearAuthCookie, authMiddleware } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();

// The frontend URL for redirects
function getAppUrl(c: any): string {
  const origin = c.req.header('Origin') || c.req.header('Referer') || '';
  if (origin.includes('localhost')) return 'http://localhost:3000';
  return 'https://cattle-management.pages.dev';
}

function isLocalhostRequest(c: any): boolean {
  const origin = c.req.header('Origin') || c.req.header('Host') || '';
  return origin.includes('localhost') || origin.includes('127.0.0.1');
}

/**
 * GET /api/auth/login
 * Validates Turnstile token, returns Google OAuth redirect URL.
 */
auth.get('/login', async (c) => {
  const turnstileToken = c.req.query('turnstile_token');

  if (!turnstileToken) {
    return c.json({ error: 'Turnstile token required' }, 400);
  }

  // Verify Turnstile token
  const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: c.env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
    }),
  });

  const turnstileResult = await turnstileResponse.json() as { success: boolean };
  if (!turnstileResult.success) {
    return c.json({ error: 'Turnstile verification failed' }, 403);
  }

  // Build Google OAuth URL
  const redirectUri = `${new URL(c.req.url).origin}/api/auth/callback/google`;
  const state = crypto.randomUUID(); // CSRF protection

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('access_type', 'online');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  return c.json({ url: googleAuthUrl.toString(), state });
});

/**
 * GET /api/auth/callback/google
 * Exchanges authorization code for tokens, creates/finds user, sets JWT cookie.
 */
auth.get('/callback/google', async (c) => {
  const code = c.req.query('code');
  const appUrl = getAppUrl(c);

  if (!code) {
    return c.redirect(`${appUrl}/login?error=no_code`);
  }

  try {
    // Exchange code for tokens
    const redirectUri = `${new URL(c.req.url).origin}/api/auth/callback/google`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      return c.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const googleUser = await userInfoResponse.json() as {
      id: string;
      email: string;
      name: string;
      picture: string;
    };

    // Google tokens are NOT stored - used once and discarded
    const db = c.get('db');

    // Find or create user
    let user = await db.select()
      .from(schema.users)
      .where(eq(schema.users.googleId, googleUser.id))
      .get();

    if (!user) {
      // New user - create account
      const result = await db.insert(schema.users).values({
        googleId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
      }).returning();
      user = result[0];
    } else {
      // Existing user - update profile info from Google
      await db.update(schema.users)
        .set({
          email: googleUser.email,
          name: googleUser.name,
          avatarUrl: googleUser.picture,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.users.id, user.id));
    }

    // Check if user has any active farm memberships
    const memberships = await db.select({
      farmId: schema.farmMembers.farmId,
      role: schema.farmMembers.role,
    })
      .from(schema.farmMembers)
      .where(eq(schema.farmMembers.userId, user.id))
      .all();

    const activeMembership = memberships.length > 0 ? memberships[0] : null;

    // Issue JWT
    const token = await createAuthToken(c.env, {
      userId: user.id,
      email: user.email,
      farmId: activeMembership?.farmId,
      role: activeMembership?.role,
    });

    const cookie = buildAuthCookie(token, isLocalhostRequest(c));

    // Redirect based on whether user has a farm
    const redirectTo = activeMembership ? `${appUrl}/dashboard` : `${appUrl}/onboarding`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectTo,
        'Set-Cookie': cookie,
      },
    });
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    return c.redirect(`${appUrl}/login?error=auth_failed`);
  }
});

/**
 * POST /api/auth/logout
 * Clears the auth cookie.
 */
auth.post('/logout', (c) => {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearAuthCookie(isLocalhostRequest(c)),
    },
  });
});

/**
 * GET /api/auth/me
 * Returns current user info and farm memberships. Requires valid JWT.
 */
auth.get('/me', authMiddleware, async (c) => {
  const authUser = c.get('user' as any);
  const db = c.get('db');

  const user = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, authUser.userId))
    .get();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Get all farm memberships with farm details
  const memberships = await db.select({
    farmId: schema.farmMembers.farmId,
    role: schema.farmMembers.role,
    joinedAt: schema.farmMembers.joinedAt,
    expiresAt: schema.farmMembers.expiresAt,
    removedAt: schema.farmMembers.removedAt,
    farmName: schema.farms.name,
    farmSlug: schema.farms.slug,
  })
    .from(schema.farmMembers)
    .innerJoin(schema.farms, eq(schema.farmMembers.farmId, schema.farms.id))
    .where(eq(schema.farmMembers.userId, user.id))
    .all();

  // Filter to active memberships
  const activeMemberships = memberships.filter(m => {
    if (m.removedAt) return false;
    if (m.expiresAt && new Date(m.expiresAt) < new Date()) return false;
    return true;
  });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    farms: activeMemberships.map(m => ({
      id: m.farmId,
      name: m.farmName,
      slug: m.farmSlug,
      role: m.role,
      joinedAt: m.joinedAt,
      expiresAt: m.expiresAt,
    })),
    activeFarmId: authUser.activeFarmId,
    activeRole: authUser.role,
  });
});

/**
 * POST /api/auth/dev-login
 * Development-only: creates/finds a test user+farm and returns a JWT token as JSON.
 * Used by Playwright tests to bypass Google OAuth and Turnstile.
 * Returns 404 in production.
 */
auth.post('/dev-login', async (c) => {
  // Only enabled when DEV_AUTH_ENABLED is set (local .dev.vars only, never in production)
  if (!c.env.DEV_AUTH_ENABLED) {
    return c.json({ error: 'Not found' }, 404);
  }

  const db = c.get('db');
  const body = await c.req.json<{ email?: string; name?: string }>().catch(() => ({}));
  const email = body.email || 'test@example.com';
  const name = body.name || 'Test User';

  // Find or create user (using email as unique key for dev)
  let user = await db.select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get();

  if (!user) {
    const result = await db.insert(schema.users).values({
      googleId: `dev-${email}`,
      email,
      name,
      avatarUrl: null,
    }).returning();
    user = result[0];
  }

  // Find or create farm membership
  const membership = await db.select()
    .from(schema.farmMembers)
    .where(eq(schema.farmMembers.userId, user.id))
    .get();

  let farmId: number;
  let role: string;

  if (!membership) {
    // Create a default test farm
    const farmResult = await db.insert(schema.farms).values({
      name: 'Test Farm',
      slug: `test-farm-${user.id}`,
    }).returning();
    farmId = farmResult[0].id;

    // Add user as owner
    await db.insert(schema.farmMembers).values({
      farmId,
      userId: user.id,
      role: 'owner',
    });
    role = 'owner';
  } else {
    farmId = membership.farmId;
    role = membership.role;
  }

  const token = await createAuthToken(c.env, {
    userId: user.id,
    email: user.email,
    farmId,
    role,
  });

  return c.json({ token, userId: user.id, farmId, role });
});

export default auth;
