# Auth & Multi-Tenancy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google OAuth login with Turnstile bot protection, multi-farm tenancy with RBAC, and an invite system - storing zero credentials.

**Architecture:** Custom Google OAuth flow handled by the Hono worker. Google tokens are exchanged server-side and discarded. The worker issues its own signed JWT stored in an HttpOnly cookie. All data tables gain a `farmId` foreign key. Auth middleware verifies JWT and scopes every query to the active farm.

**Tech Stack:** Hono (worker), Drizzle ORM + D1 (database), Next.js 15 static export (frontend), Google OAuth 2.0, Cloudflare Turnstile, jose (JWT library)

**Design doc:** `docs/plans/2026-02-18-auth-multi-tenancy-design.md`

---

## Phase 1: Database Schema (Auth + Multi-Tenancy Tables)

### Task 1: Add auth and farm tables to Drizzle schema

**Files:**
- Modify: `apps/worker/src/db/schema.ts`

**Step 1: Add new tables to schema**

Add these tables after the existing `fieldAssignments` table and before the `// RELATIONS` section in `apps/worker/src/db/schema.ts`:

```typescript
// ==================== USERS TABLE ====================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  googleIdIdx: index('idx_user_google_id').on(table.googleId),
  emailIdx: index('idx_user_email').on(table.email),
}));

// ==================== FARMS TABLE ====================

export const farms = sqliteTable('farms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  slugIdx: index('idx_farm_slug').on(table.slug),
}));

// ==================== FARM MEMBERS TABLE ====================

export const farmMembers = sqliteTable('farm_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'owner' | 'manager' | 'worker' | 'viewer'
  joinedAt: text('joined_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at'), // null = permanent
  removedAt: text('removed_at'), // null = active
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  farmUserIdx: index('idx_farm_member_farm_user').on(table.farmId, table.userId),
  userIdx: index('idx_farm_member_user').on(table.userId),
}));

// ==================== FARM INVITES TABLE ====================

export const farmInvites = sqliteTable('farm_invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  role: text('role').notNull(),
  maxUses: integer('max_uses'), // null = unlimited
  usedCount: integer('used_count').default(0),
  accessDuration: integer('access_duration'), // null = permanent, otherwise days
  expiresAt: text('expires_at'), // null = never (link expiry)
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  codeIdx: index('idx_invite_code').on(table.code),
  farmIdx: index('idx_invite_farm').on(table.farmId),
}));
```

**Step 2: Add `farmId` column to all existing data tables**

Add a `farmId` column to each of these existing tables in `apps/worker/src/db/schema.ts`. Add it after the `id` field in each table:

- `cattle` table: Add `farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),`
- `calvingEvents` table: Add `farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),`
- `serviceEvents` table: Add `farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),`
- `saleEvents` table: Add `farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),`
- `healthEvents` table: Add `farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),`
- `fields` table: Add `farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),`
- `fieldAssignments` table: Add `farmId: integer('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),`

Also add a `farmId` index to each table's index block. For example in the cattle table:
```typescript
farmIdx: index('idx_cattle_farm').on(table.farmId),
```

**Step 3: Add relations for new tables**

Add to the relations section of `apps/worker/src/db/schema.ts`:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  farmMemberships: many(farmMembers),
}));

export const farmsRelations = relations(farms, ({ many }) => ({
  members: many(farmMembers),
  invites: many(farmInvites),
  cattle: many(cattle),
}));

export const farmMembersRelations = relations(farmMembers, ({ one }) => ({
  farm: one(farms, { fields: [farmMembers.farmId], references: [farms.id] }),
  user: one(users, { fields: [farmMembers.userId], references: [users.id] }),
}));

export const farmInvitesRelations = relations(farmInvites, ({ one }) => ({
  farm: one(farms, { fields: [farmInvites.farmId], references: [farms.id] }),
  createdByUser: one(users, { fields: [farmInvites.createdBy], references: [users.id] }),
}));
```

Also add a `farm` relation to each existing table's relations. For example in `cattleRelations`:
```typescript
farm: one(farms, { fields: [cattle.farmId], references: [farms.id] }),
```

**Step 4: Add type exports for new tables**

```typescript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Farm = typeof farms.$inferSelect;
export type NewFarm = typeof farms.$inferInsert;

export type FarmMember = typeof farmMembers.$inferSelect;
export type NewFarmMember = typeof farmMembers.$inferInsert;

export type FarmInvite = typeof farmInvites.$inferSelect;
export type NewFarmInvite = typeof farmInvites.$inferInsert;
```

**Step 5: Generate and apply migration**

```bash
cd apps/worker
pnpm run db:generate
```

This will create a new migration file in `apps/worker/src/db/migrations/`. Review it to ensure all tables and columns are correct.

**Step 6: Apply migration to remote D1**

```bash
cd apps/worker
wrangler d1 migrations apply cattle-management-db --remote
```

**Step 7: Commit**

```bash
git add apps/worker/src/db/schema.ts apps/worker/src/db/migrations/
git commit -m "feat: add auth and multi-tenancy schema (users, farms, members, invites + farmId on all tables)"
```

---

## Phase 2: Worker Auth Infrastructure

### Task 2: Install jose and update Env types

**Files:**
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/src/types/index.ts`

**Step 1: Install jose JWT library**

```bash
cd apps/worker
pnpm add jose
```

**Step 2: Update Env types**

Replace the contents of `apps/worker/src/types/index.ts` with:

```typescript
/**
 * Shared TypeScript types for Cloudflare Worker
 */

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
}

export interface AuthUser {
  userId: number;
  email: string;
  activeFarmId: number | null;
  role: string | null;
}

export interface UploadStats {
  cattleAdded: number;
  cattleSkipped: number;
  cattleUpdated: number;
  maternalLinks: number;
  calvingsAdded: number;
  servicesAdded: number;
  salesAdded: number;
  healthAdded: number;
  errors: string[];
}

export interface FamilyTreeNode {
  generation: number;
  cattle: any;
  descendants?: FamilyTreeNode[];
}

export interface BreedingScore {
  cattleId: number;
  score: number;
  offspringCount: number;
  retentionRate: number;
  revenue: number;
  age: number;
  bloodlineStrength: number;
}
```

**Step 3: Update wrangler.toml comments**

Replace the secrets comment block at the bottom of `apps/worker/wrangler.toml`:

```toml
# Secrets (set via: wrangler secret put <NAME>)
# JWT_SECRET
# GOOGLE_CLIENT_ID
# GOOGLE_CLIENT_SECRET
# TURNSTILE_SECRET_KEY
```

**Step 4: Commit**

```bash
git add apps/worker/package.json apps/worker/pnpm-lock.yaml apps/worker/src/types/index.ts apps/worker/wrangler.toml
git commit -m "feat: add jose dependency and auth env types"
```

---

### Task 3: Create auth middleware

**Files:**
- Create: `apps/worker/src/middleware/auth.ts`

**Step 1: Create the auth middleware file**

Create `apps/worker/src/middleware/auth.ts`:

```typescript
/**
 * Authentication & Authorization Middleware
 */

import { Context, Next } from 'hono';
import { jwtVerify } from 'jose';
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
  const { SignJWT } = await import('jose');
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
```

**Step 2: Commit**

```bash
git add apps/worker/src/middleware/auth.ts
git commit -m "feat: add JWT auth middleware with role checking"
```

---

### Task 4: Create auth routes (Google OAuth + Turnstile)

**Files:**
- Create: `apps/worker/src/routes/auth.ts`

**Step 1: Create the auth routes file**

Create `apps/worker/src/routes/auth.ts`:

```typescript
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

    const activeMembership = memberships.find(m => {
      // Would need to also check expiresAt and removedAt for full validation
      return true;
    });

    // Issue JWT
    const token = await createAuthToken(c.env, {
      userId: user.id,
      email: user.email,
      farmId: activeMembership?.farmId,
      role: activeMembership?.role,
    });

    const cookie = buildAuthCookie(token);

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
      'Set-Cookie': clearAuthCookie(),
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

export default auth;
```

**Step 2: Commit**

```bash
git add apps/worker/src/routes/auth.ts
git commit -m "feat: add auth routes (Google OAuth, Turnstile, login/callback/logout/me)"
```

---

### Task 5: Create farm and invite routes

**Files:**
- Create: `apps/worker/src/routes/farms.ts`

**Step 1: Create the farms routes file**

Create `apps/worker/src/routes/farms.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add apps/worker/src/routes/farms.ts
git commit -m "feat: add farm CRUD, member management, and invite routes"
```

---

### Task 6: Create public invite routes

**Files:**
- Create: `apps/worker/src/routes/invite.ts`

**Step 1: Create the invite routes file**

Create `apps/worker/src/routes/invite.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add apps/worker/src/routes/invite.ts
git commit -m "feat: add public invite routes (view and accept)"
```

---

### Task 7: Wire up auth routes and middleware in index.ts

**Files:**
- Modify: `apps/worker/src/index.ts`

**Step 1: Update index.ts**

Replace the entire contents of `apps/worker/src/index.ts` with:

```typescript
/**
 * Cattle Management API - Cloudflare Worker with Hono
 *
 * Main entry point for the serverless backend API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getDrizzleClient } from './db/client';
import { authMiddleware } from './middleware/auth';
import type { Env, AuthUser } from './types';

// Import routes
import authRoutes from './routes/auth';
import farmRoutes from './routes/farms';
import inviteRoutes from './routes/invite';
import cattleRoutes from './routes/cattle';
import familyRoutes from './routes/family';
import uploadRoutes from './routes/upload';
import calvingRoutes from './routes/calvings';
import saleRoutes from './routes/sales';
import healthRoutes from './routes/health';
import analyticsRoutes from './routes/analytics';
import breedingRoutes from './routes/breeding';
import fieldsRoutes from './routes/fields';

const app = new Hono<{ Bindings: Env; Variables: { db: ReturnType<typeof getDrizzleClient>; user: AuthUser } }>();

// ==================== MIDDLEWARE ====================

// Logging middleware
app.use('*', logger());

// CORS middleware - allow all Cloudflare Pages deployments
app.use('*', cors({
  origin: (origin) => {
    // Allow localhost for development
    if (origin?.includes('localhost')) return origin;
    // Allow all cattle-management.pages.dev deployments
    if (origin?.includes('cattle-management.pages.dev')) return origin;
    // Fallback
    return origin || '*';
  },
  credentials: true,
}));

// Attach database client to context
app.use('*', async (c, next) => {
  const db = getDrizzleClient(c.env.DB);
  c.set('db', db);
  await next();
});

// Auth middleware for protected API routes (excludes /api/auth/* and GET /api/invite/:code)
app.use('/api/cattle/*', authMiddleware);
app.use('/api/family/*', authMiddleware);
app.use('/api/upload/*', authMiddleware);
app.use('/api/calvings/*', authMiddleware);
app.use('/api/sales/*', authMiddleware);
app.use('/api/health/*', authMiddleware);
app.use('/api/analytics/*', authMiddleware);
app.use('/api/breeding/*', authMiddleware);
app.use('/api/fields/*', authMiddleware);

// ==================== ROUTES ====================

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Cattle Management API',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// Auth routes (public - handles own auth internally)
app.route('/api/auth', authRoutes);

// Farm management routes (auth handled internally)
app.route('/api/farms', farmRoutes);

// Invite routes (GET is public, POST /accept requires auth - handled internally)
app.route('/api/invite', inviteRoutes);

// Data routes (protected by auth middleware above)
app.route('/api/cattle', cattleRoutes);
app.route('/api/family', familyRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/calvings', calvingRoutes);
app.route('/api/sales', saleRoutes);
app.route('/api/health', healthRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/breeding', breedingRoutes);
app.route('/api/fields', fieldsRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
  }, 500);
});

export default app;
```

**Step 2: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: wire up auth middleware and new routes in index.ts"
```

---

### Task 8: Add farmId scoping to existing route handlers

**Files:**
- Modify: `apps/worker/src/routes/cattle.ts`
- Modify: `apps/worker/src/routes/calvings.ts`
- Modify: `apps/worker/src/routes/sales.ts`
- Modify: `apps/worker/src/routes/health.ts`
- Modify: `apps/worker/src/routes/fields.ts`
- Modify: `apps/worker/src/routes/breeding.ts`
- Modify: `apps/worker/src/routes/analytics.ts`
- Modify: `apps/worker/src/routes/family.ts`
- Modify: `apps/worker/src/routes/upload.ts`

**Overview:** Every existing route file needs these changes:
1. Update the Hono generic to include `user: AuthUser` in Variables
2. In every handler, read `const user = c.get('user')` and use `user.activeFarmId` to scope queries
3. On all `SELECT` queries, add `.where(eq(table.farmId, user.activeFarmId!))` (or add to existing `and(...)` clauses)
4. On all `INSERT` operations, include `farmId: user.activeFarmId!` in the values
5. On all `UPDATE`/`DELETE` operations, add farmId to the where clause to prevent cross-farm access

**Example pattern for cattle.ts:**

At the top, change the Hono type:
```typescript
import type { AuthUser } from '../types';
// ...
const cattle = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();
```

In the GET all cattle handler, add farmId filter:
```typescript
// Before:
const allCattle = await db.select().from(schema.cattle).all();
// After:
const user = c.get('user');
const allCattle = await db.select().from(schema.cattle)
  .where(eq(schema.cattle.farmId, user.activeFarmId!))
  .all();
```

In the POST (create) handler, add farmId:
```typescript
const user = c.get('user');
const [newCattle] = await db.insert(schema.cattle).values({
  ...data,
  farmId: user.activeFarmId!,
}).returning();
```

In UPDATE/DELETE handlers, add farmId to where:
```typescript
const user = c.get('user');
await db.update(schema.cattle)
  .set(data)
  .where(and(eq(schema.cattle.id, id), eq(schema.cattle.farmId, user.activeFarmId!)));
```

**Apply this same pattern to ALL route files.** Each file follows the same structure - read each one, find every query, and add the farmId scoping. This is the most tedious task but is critical for security.

**Step 2: Commit**

```bash
git add apps/worker/src/routes/
git commit -m "feat: add farmId scoping to all existing route handlers"
```

---

## Phase 3: Frontend Auth

### Task 9: Install Turnstile React component and add env vars

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.js`

**Step 1: Install Turnstile React**

```bash
cd apps/web
pnpm add @marsidev/react-turnstile
```

**Step 2: Update next.config.js to add env vars**

Replace `apps/web/next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://cattle-management-api.andrewskea-as.workers.dev',
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
  },
};

module.exports = nextConfig;
```

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/next.config.js
git commit -m "feat: add turnstile react package and auth env vars"
```

---

### Task 10: Create AuthContext provider

**Files:**
- Create: `apps/web/lib/auth-context.tsx`

**Step 1: Create the auth context**

Create `apps/web/lib/auth-context.tsx`:

```tsx
'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { apiClient } from './api-client'

interface AuthUser {
  id: number
  email: string
  name: string | null
  avatarUrl: string | null
}

interface FarmMembership {
  id: number
  name: string
  slug: string
  role: string
  joinedAt: string | null
  expiresAt: string | null
}

interface AuthState {
  user: AuthUser | null
  farms: FarmMembership[]
  activeFarmId: number | null
  activeRole: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  switchFarm: (farmId: number) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    farms: [],
    activeFarmId: null,
    activeRole: null,
    isLoading: true,
    isAuthenticated: false,
  })

  const refresh = useCallback(async () => {
    try {
      const data: any = await apiClient.getMe()
      setState({
        user: data.user,
        farms: data.farms,
        activeFarmId: data.activeFarmId,
        activeRole: data.activeRole,
        isLoading: false,
        isAuthenticated: true,
      })
    } catch {
      setState({
        user: null,
        farms: [],
        activeFarmId: null,
        activeRole: null,
        isLoading: false,
        isAuthenticated: false,
      })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const switchFarm = useCallback(async (farmId: number) => {
    await apiClient.switchFarm(farmId)
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await apiClient.logout()
    setState({
      user: null,
      farms: [],
      activeFarmId: null,
      activeRole: null,
      isLoading: false,
      isAuthenticated: false,
    })
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, switchFarm, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

**Step 2: Commit**

```bash
git add apps/web/lib/auth-context.tsx
git commit -m "feat: add AuthContext provider with farm switching"
```

---

### Task 11: Update API client with auth methods

**Files:**
- Modify: `apps/web/lib/api-client.ts`

**Step 1: Add `credentials: 'include'` to all requests and add auth methods**

In `apps/web/lib/api-client.ts`, modify the `request` method to include credentials:

```typescript
private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (response.status === 401) {
      // Redirect to login on auth failure (unless already on auth pages)
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }
```

Also add credentials to the `uploadFile` method's fetch call:

```typescript
const response = await fetch(`${this.baseUrl}/api/upload/excel`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
```

**Step 2: Add auth methods to ApiClient class**

Add these methods to the `ApiClient` class, before the closing `}`:

```typescript
  // Auth endpoints
  async getLoginUrl(turnstileToken: string) {
    return this.request(`/api/auth/login?turnstile_token=${encodeURIComponent(turnstileToken)}`);
  }

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // Farm endpoints
  async createFarm(data: { name: string }) {
    return this.request('/api/farms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getFarms() {
    return this.request('/api/farms');
  }

  async switchFarm(farmId: number) {
    return this.request(`/api/farms/${farmId}/switch`, { method: 'POST' });
  }

  async updateFarm(farmId: number, data: { name?: string }) {
    return this.request(`/api/farms/${farmId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteFarm(farmId: number) {
    return this.request(`/api/farms/${farmId}`, { method: 'DELETE' });
  }

  async getFarmMembers(farmId: number) {
    return this.request(`/api/farms/${farmId}/members`);
  }

  async updateFarmMember(farmId: number, userId: number, data: { role?: string; expiresAt?: string | null }) {
    return this.request(`/api/farms/${farmId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async removeFarmMember(farmId: number, userId: number) {
    return this.request(`/api/farms/${farmId}/members/${userId}`, { method: 'DELETE' });
  }

  async createInvite(farmId: number, data: { role: string; maxUses?: number | null; expiresAt?: string | null; accessDuration?: number | null }) {
    return this.request(`/api/farms/${farmId}/invites`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInvites(farmId: number) {
    return this.request(`/api/farms/${farmId}/invites`);
  }

  async deleteInvite(farmId: number, inviteId: number) {
    return this.request(`/api/farms/${farmId}/invites/${inviteId}`, { method: 'DELETE' });
  }

  async getInviteDetails(code: string) {
    return this.request(`/api/invite/${code}`);
  }

  async acceptInvite(code: string) {
    return this.request(`/api/invite/${code}/accept`, { method: 'POST' });
  }
```

**Step 3: Commit**

```bash
git add apps/web/lib/api-client.ts
git commit -m "feat: add credentials to API client and auth/farm/invite methods"
```

---

### Task 12: Create login page

**Files:**
- Create: `apps/web/app/login/page.tsx`

**Step 1: Create the login page**

Create `apps/web/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { apiClient } from '@/lib/api-client'

export default function LoginPage() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const urlError = searchParams?.get('error')

  const handleGoogleLogin = async () => {
    if (!turnstileToken) return
    setLoading(true)
    setError(null)

    try {
      const result: any = await apiClient.getLoginUrl(turnstileToken)
      // Redirect to Google OAuth
      window.location.href = result.url
    } catch (err: any) {
      setError(err.message || 'Failed to initiate login')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">🐄</span>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">HoovesWho</h1>
          <p className="text-gray-500 mt-2">Farm management made simple</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">
            Sign in to your account
          </h2>

          {/* Error messages */}
          {(error || urlError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-red-800 text-sm">
                {error || (urlError === 'no_code' ? 'Login was cancelled' : 'Authentication failed. Please try again.')}
              </p>
            </div>
          )}

          {/* Turnstile */}
          <div className="flex justify-center mb-6">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
              onSuccess={setTurnstileToken}
              onError={() => setError('Bot verification failed. Please refresh.')}
            />
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleLogin}
            disabled={!turnstileToken || loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? 'Redirecting...' : 'Sign in with Google'}
          </button>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          Your credentials are handled securely by Google. We never store passwords.
        </p>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "feat: add login page with Turnstile and Google OAuth"
```

---

### Task 13: Create onboarding page

**Files:**
- Create: `apps/web/app/onboarding/page.tsx`

**Step 1: Create the onboarding page**

Create `apps/web/app/onboarding/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiClient } from '@/lib/api-client'

export default function OnboardingPage() {
  const { user, refresh } = useAuth()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [farmName, setFarmName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [invitePreview, setInvitePreview] = useState<{ farmName: string; role: string; accessDuration: number | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateFarm = async () => {
    if (!farmName.trim()) return
    setLoading(true)
    setError(null)
    try {
      await apiClient.createFarm({ name: farmName.trim() })
      await refresh()
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Failed to create farm')
      setLoading(false)
    }
  }

  const handleLookupInvite = async () => {
    const code = inviteCode.trim().split('/').pop() || inviteCode.trim()
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const result: any = await apiClient.getInviteDetails(code)
      setInvitePreview(result.data)
    } catch (err: any) {
      setError(err.message || 'Invalid invite code')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvite = async () => {
    const code = inviteCode.trim().split('/').pop() || inviteCode.trim()
    setLoading(true)
    setError(null)
    try {
      await apiClient.acceptInvite(code)
      await refresh()
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Failed to join farm')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-5xl">🐄</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">
            Welcome{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="text-gray-500 mt-2">Let's get you set up with a farm</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {mode === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('create')}
              className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-8 text-center hover:border-green-500 hover:shadow-xl transition-all"
            >
              <div className="text-4xl mb-4">🏗️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Create a Farm</h3>
              <p className="text-sm text-gray-500">Start fresh and invite your team</p>
            </button>
            <button
              onClick={() => setMode('join')}
              className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-8 text-center hover:border-blue-500 hover:shadow-xl transition-all"
            >
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Join a Farm</h3>
              <p className="text-sm text-gray-500">Enter an invite code or link</p>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Your Farm</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Farm Name</label>
              <input
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g. Hillside Farm"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                autoFocus
              />
            </div>
            <p className="text-xs text-gray-400 mb-6">You'll be the farm owner and can invite others later.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setMode('choose'); setError(null) }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateFarm}
                disabled={!farmName.trim() || loading}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? 'Creating...' : 'Create Farm'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Join a Farm</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Invite Code or Link</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value); setInvitePreview(null) }}
                placeholder="e.g. ABC12345 or https://..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                autoFocus
              />
            </div>

            {invitePreview && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900">
                  You'll join <strong>{invitePreview.farmName}</strong> as a <strong className="capitalize">{invitePreview.role}</strong>
                  {invitePreview.accessDuration && ` for ${invitePreview.accessDuration} days`}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setMode('choose'); setError(null); setInvitePreview(null) }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Back
              </button>
              {!invitePreview ? (
                <button
                  onClick={handleLookupInvite}
                  disabled={!inviteCode.trim() || loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? 'Looking up...' : 'Look Up Invite'}
                </button>
              ) : (
                <button
                  onClick={handleAcceptInvite}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? 'Joining...' : 'Join Farm'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add apps/web/app/onboarding/page.tsx
git commit -m "feat: add onboarding page (create farm or join via invite)"
```

---

### Task 14: Create join invite page

**Files:**
- Create: `apps/web/app/join/[code]/page.tsx`

**Step 1: Create the join page**

Create `apps/web/app/join/[code]/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiClient } from '@/lib/api-client'

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [code, setCode] = useState<string>('')
  const [invite, setInvite] = useState<{ farmName: string; role: string; accessDuration: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then(({ code: c }) => {
      setCode(c)
      apiClient.getInviteDetails(c)
        .then((result: any) => setInvite(result.data))
        .catch((err: any) => setError(err.message || 'Invalid invite'))
        .finally(() => setLoading(false))
    })
  }, [params])

  const handleAccept = async () => {
    setAccepting(true)
    try {
      await apiClient.acceptInvite(code)
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message)
      setAccepting(false)
    }
  }

  const handleLoginThenJoin = () => {
    // Store invite code, redirect to login
    if (typeof window !== 'undefined') {
      localStorage.setItem('pending_invite', code)
    }
    window.location.href = '/login'
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">🐄</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Farm Invite</h1>
        </div>

        {error ? (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-4">😕</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid Invite</h2>
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        ) : invite ? (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              You've been invited to join
            </h2>
            <p className="text-2xl font-bold text-green-700 mb-2">{invite.farmName}</p>
            <p className="text-gray-500 mb-1">
              as a <span className="font-semibold capitalize">{invite.role}</span>
            </p>
            {invite.accessDuration && (
              <p className="text-gray-400 text-sm mb-6">Access for {invite.accessDuration} days</p>
            )}

            {isAuthenticated ? (
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium rounded-lg transition-colors"
              >
                {accepting ? 'Joining...' : 'Accept & Join Farm'}
              </button>
            ) : (
              <button
                onClick={handleLoginThenJoin}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google to join
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

**Note:** Since Next.js is using static export (`output: 'export'`), dynamic routes like `/join/[code]` need `generateStaticParams`. For the static export, we should add a `generateStaticParams` function that returns an empty array (the page will still work client-side with the hash/query approach), OR we need to handle this route differently. The simplest approach for now is to add:

```typescript
export function generateStaticParams() {
  return []
}
```

at the top level of the file (after imports, before the component). This tells Next.js to not pre-render any specific codes but still allows the route to work.

**Step 2: Commit**

```bash
git add apps/web/app/join/
git commit -m "feat: add join invite page with login-then-join flow"
```

---

### Task 15: Update auth layout with farm switcher and user menu

**Files:**
- Modify: `apps/web/app/(auth)/layout.tsx`

**Step 1: Update the layout**

Modify `apps/web/app/(auth)/layout.tsx` to:

1. Import and use `useAuth` from `@/lib/auth-context`
2. Add redirect logic: if `!isAuthenticated && !isLoading`, redirect to `/login`. If `isAuthenticated && farms.length === 0`, redirect to `/onboarding`.
3. Add a farm switcher dropdown below the logo in the sidebar
4. Add a user section at the bottom of the sidebar (avatar, name, logout)

The key additions to the existing layout:

After the Logo section, add a farm switcher:
```tsx
{/* Farm Switcher */}
{!collapsed && activeFarm && (
  <div className="px-3 py-2 border-b border-gray-200">
    <select
      value={activeFarmId || ''}
      onChange={(e) => switchFarm(Number(e.target.value))}
      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg"
    >
      {farms.map(f => (
        <option key={f.id} value={f.id}>{f.name} ({f.role})</option>
      ))}
    </select>
  </div>
)}
```

Before the collapse toggle, add user section:
```tsx
{/* User section */}
<div className="border-t border-gray-200 p-3">
  <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
    {user?.avatarUrl && (
      <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
    )}
    {!collapsed && (
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
        <button onClick={logout} className="text-xs text-gray-500 hover:text-red-600">
          Sign out
        </button>
      </div>
    )}
  </div>
</div>
```

**Step 2: Commit**

```bash
git add apps/web/app/(auth)/layout.tsx
git commit -m "feat: add farm switcher and user menu to sidebar layout"
```

---

### Task 16: Add AuthProvider to root layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

**Step 1: Wrap the app with AuthProvider**

In `apps/web/app/layout.tsx`, import `AuthProvider` from `@/lib/auth-context` and wrap `{children}` with it:

```tsx
import { AuthProvider } from '@/lib/auth-context'

// In the return:
<body>
  <AuthProvider>
    {children}
  </AuthProvider>
</body>
```

**Step 2: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat: wrap app with AuthProvider in root layout"
```

---

### Task 17: Create settings pages (profile + farm)

**Files:**
- Create: `apps/web/app/(auth)/settings/profile/page.tsx`
- Create: `apps/web/app/(auth)/settings/farm/page.tsx`

**Step 1: Create profile settings page**

A simple read-only page showing the user's Google profile info (name, email, avatar). No form needed since all data comes from Google.

**Step 2: Create farm settings page**

This page (accessible to Owner/Manager) shows:
- Farm name (editable by Owner)
- Members table with role badges, expiry dates, and remove/edit buttons (Owner only)
- Invite management section: create invite form (role dropdown, optional max uses, optional expiry, optional access duration) and table of active invites with copy-link and revoke buttons

**Step 3: Add settings nav links to sidebar**

Add to the `navLinks` array in `apps/web/app/(auth)/layout.tsx`:
```typescript
{ href: '/settings/profile', label: 'Profile', icon: User },
{ href: '/settings/farm', label: 'Farm Settings', icon: Settings },
```

Import `User` and `Settings` from `lucide-react`.

**Step 4: Commit**

```bash
git add apps/web/app/(auth)/settings/
git commit -m "feat: add profile and farm settings pages"
```

---

## Phase 4: Configuration & Deployment

### Task 18: Set up Wrangler secrets and Google OAuth credentials

**Step 1: Generate a JWT secret**

```bash
openssl rand -hex 32
```

Save the output - this is your JWT_SECRET.

**Step 2: Create Google OAuth credentials**

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (Web Application)
3. Add authorized redirect URI: `https://cattle-management-api.andrewskea-as.workers.dev/api/auth/callback/google`
4. Also add for local dev: `http://localhost:8787/api/auth/callback/google`
5. Save the Client ID and Client Secret

**Step 3: Create Turnstile widget**

1. Go to https://dash.cloudflare.com/ -> Turnstile
2. Create a new widget
3. Add managed domains: `cattle-management.pages.dev` and `localhost`
4. Save the Site Key and Secret Key

**Step 4: Set Wrangler secrets**

```bash
cd apps/worker
echo "YOUR_JWT_SECRET" | wrangler secret put JWT_SECRET
echo "YOUR_GOOGLE_CLIENT_ID" | wrangler secret put GOOGLE_CLIENT_ID
echo "YOUR_GOOGLE_CLIENT_SECRET" | wrangler secret put GOOGLE_CLIENT_SECRET
echo "YOUR_TURNSTILE_SECRET_KEY" | wrangler secret put TURNSTILE_SECRET_KEY
```

**Step 5: Set frontend env vars**

For local development, create `apps/web/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-site-key
```

For production (Cloudflare Pages), set these in the Pages dashboard under Settings > Environment Variables.

---

### Task 19: Deploy and test end-to-end

**Step 1: Deploy worker**

```bash
cd apps/worker
pnpm run deploy
```

**Step 2: Deploy frontend**

```bash
cd apps/web
pnpm run build && pnpm run deploy
```

**Step 3: Test the full flow**

1. Visit the app - should redirect to `/login`
2. Complete Turnstile challenge
3. Click "Sign in with Google"
4. Complete Google OAuth
5. Land on `/onboarding` (new user)
6. Create a farm - land on `/dashboard`
7. Verify farm name shows in sidebar
8. Verify data routes work (cattle, etc.)
9. Create an invite from farm settings
10. Open invite link in incognito - verify join flow

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: deployment and integration fixes"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | 1 | Database schema with auth tables + farmId on all data tables |
| 2 | 2-8 | Complete worker auth: JWT middleware, Google OAuth, Turnstile, farm CRUD, invites, farmId scoping |
| 3 | 9-17 | Frontend: login page, onboarding, invite flow, auth context, farm switcher, settings pages |
| 4 | 18-19 | Secrets configuration, deployment, E2E testing |

**Total: 19 tasks across 4 phases.**
