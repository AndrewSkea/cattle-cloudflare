/**
 * Shared Hono context types, errors, validation and permission helpers.
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { ZodSchema, z } from 'zod';
import type { DrizzleD1Database } from '../db/client';
import * as schema from '../db/schema';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  DEV_AUTH_ENABLED?: string; // local .dev.vars only — never set in production
  SCOTEID_APP_KEY?: string; // vendor key issued by ScotEID; the integration is dormant without it
  SCOTEID_ENDPOINT?: string; // defaults to https://api.scoteid.com/api/ (test: https://api.test.scoteid.com/api)
  GITHUB_FEEDBACK_TOKEN?: string; // fine-grained token, Issues read/write on FEEDBACK_REPO; feedback is only stored without it
  FEEDBACK_REPO?: string; // owner/name, defaults to AndrewSkea/cattle-cloudflare
  VAPID_PUBLIC_KEY?: string; // Web Push: raw P-256 public key (base64url), in wrangler.toml [vars]
  VAPID_PRIVATE_KEY?: string; // Web Push: the private scalar d (base64url), a secret; reminders are off without it
  DVSA_CLIENT_ID?: string; // DVSA MOT History API (equipment reg lookup): OAuth client credentials + API key, all secrets
  DVSA_CLIENT_SECRET?: string;
  DVSA_API_KEY?: string;
  DVSA_SCOPE?: string;
  DVSA_TOKEN_URL?: string;
}

export type Role = 'viewer' | 'worker' | 'manager' | 'owner';
export const ROLES: Role[] = ['viewer', 'worker', 'manager', 'owner'];

export interface Session {
  userId: number;
  email: string;
  farmId: number | null;
  role: Role | null;
}

export type AppEnv = { Bindings: Env; Variables: { db: DrizzleD1Database; session: Session } };
export type Ctx = Context<AppEnv>;

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 422, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

export function roleAtLeast(role: Role | null, min: Role): boolean {
  return !!role && ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/** Session with an active farm; throws if none. */
export function farmSession(c: Ctx): Session & { farmId: number; role: Role } {
  const s = c.get('session');
  if (!s?.farmId || !s.role) throw new HttpError(403, 'No active farm');
  return s as Session & { farmId: number; role: Role };
}

/** Middleware: require an active farm and at least `min` role. */
export function requireRole(min: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const s = farmSession(c);
    if (!roleAtLeast(s.role, min)) throw new HttpError(403, 'You do not have permission to do that');
    await next();
  };
}

/** Read methods need `read`, mutating methods need `write`. */
export function requireAccess(read: Role, write: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const s = farmSession(c);
    const min = c.req.method === 'GET' ? read : write;
    if (!roleAtLeast(s.role, min)) throw new HttpError(403, 'You do not have permission to do that');
    await next();
  };
}

export async function body<S extends ZodSchema>(c: Ctx, s: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
  const parsed = s.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join('.');
    throw new HttpError(422, field ? `${field}: ${issue.message}` : issue.message, parsed.error.flatten());
  }
  return parsed.data;
}

export function idParam(c: Ctx, name = 'id'): number {
  const id = Number(c.req.param(name));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function now(): string {
  return new Date().toISOString();
}

export async function logActivity(c: Ctx, action: string, entity: string, entityId: number | null, summary: string) {
  const s = c.get('session');
  if (!s?.farmId) return;
  await c.get('db').insert(schema.activityLog).values({
    farmId: s.farmId, userId: s.userId, action, entity, entityId, summary,
  });
}
