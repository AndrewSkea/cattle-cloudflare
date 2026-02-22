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
import machineryRoutes from './routes/machinery';
import workersRoutes from './routes/workers';
import suppliesRoutes from './routes/supplies';
import costsRoutes from './routes/costs';
import exportRoutes from './routes/export';

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
app.use('/api/machinery/*', authMiddleware);
app.use('/api/workers/*', authMiddleware);
app.use('/api/supplies/*', authMiddleware);
app.use('/api/costs/*', authMiddleware);
app.use('/api/export/*', authMiddleware);

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
app.route('/api/machinery', machineryRoutes);
app.route('/api/workers', workersRoutes);
app.route('/api/supplies', suppliesRoutes);
app.route('/api/costs', costsRoutes);
app.route('/api/export', exportRoutes);

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
