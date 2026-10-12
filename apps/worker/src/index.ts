/**
 * Farm management — Cloudflare Worker.
 *
 * Serves the static Next.js app (Workers Static Assets) and the JSON API under /api from one
 * origin, so the session cookie is first-party and no CORS is needed in production.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDrizzleClient } from './db/client';
import { authMiddleware } from './lib/auth';
import { type AppEnv, type Env, HttpError } from './lib/context';

import authRoutes from './routes/auth';
import farmRoutes, { farmsCreate, invitesPublic } from './routes/farm';
import animalRoutes from './routes/animals';
import { births, breeding, health, movements, weights } from './routes/records';
import { equipment, inventory, parcels, staffRoutes, structures, tasks } from './routes/resources';
import financeRoutes from './routes/finance';
import dashboardRoutes from './routes/dashboard';
import martRoutes from './routes/mart';
import feedbackRoutes from './routes/feedback';
import pushRoutes from './routes/push';
import { sendDailyReminders } from './services/reminders';
import { compliance, scoteid, scoteidMock } from './routes/compliance';
import { syncOrkneyMart } from './services/mart/orkney';

const app = new Hono<AppEnv>();

// Local development only: allow the Next.js dev server on another port.
app.use('/api/*', async (c, next) => {
  if (c.env.ENVIRONMENT === 'production') return next();
  return cors({ origin: (o) => (o && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o) ? o : null), credentials: true })(c, next);
});

// CSRF: state-changing requests must come from our own origin (cookie is also SameSite=Lax).
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    const self = new URL(c.req.url).origin;
    const devOk = c.env.ENVIRONMENT !== 'production' && origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    if (origin && origin !== self && !devOk) return c.json({ error: 'Cross-site request blocked' }, 403);
  }
  await next();
});

app.use('/api/*', async (c, next) => {
  c.set('db', getDrizzleClient(c.env.DB));
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

// Public
app.get('/api/health-check', (c) => c.json({ status: 'ok', environment: c.env.ENVIRONMENT, time: new Date().toISOString() }));
app.route('/api/auth', authRoutes);
app.route('/api/invites', invitesPublic);
app.route('/api/dev/scoteid', scoteidMock); // 404 in production

// Everything below requires a session
app.use('/api/*', authMiddleware);
app.route('/api/farms', farmsCreate);
app.route('/api/farm', farmRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/animals', animalRoutes);
app.route('/api/health', health);
app.route('/api/weights', weights);
app.route('/api/breeding', breeding);
app.route('/api/births', births);
app.route('/api/movements', movements);
app.route('/api/land', parcels);
app.route('/api/structures', structures);
app.route('/api/equipment', equipment);
app.route('/api/staff', staffRoutes);
app.route('/api/tasks', tasks);
app.route('/api/inventory', inventory);
app.route('/api/finance', financeRoutes);
app.route('/api/mart', martRoutes);
app.route('/api/compliance', compliance);
app.route('/api/scoteid', scoteid);
app.route('/api/feedback', feedbackRoutes);
app.route('/api/push', pushRoutes);

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Non-API paths fall through to the static app.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, details: err.details }, err.status);
  console.error(`${c.req.method} ${c.req.path}`, err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

/** 07:00 UTC: 8am in summer, 7am in winter — before the day's work starts either way. Must match wrangler.toml. */
const DAILY_CRON = '0 7 * * *';

export default {
  fetch: app.fetch,
  /** Crons: the morning reminder (DAILY_CRON), otherwise pick up new Orkney Mart sales reports and match them to farms. */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === DAILY_CRON) {
      ctx.waitUntil(sendDailyReminders(getDrizzleClient(env.DB), env).then(
        (r) => console.log('reminders', JSON.stringify(r)),
        (e) => console.error('reminders failed', e),
      ));
      return;
    }
    ctx.waitUntil(syncOrkneyMart(getDrizzleClient(env.DB), { days: 21 }).then(
      (r) => console.log('mart sync', JSON.stringify(r)),
      (e) => console.error('mart sync failed', e),
    ));
  },
} satisfies ExportedHandler<Env>;
