/**
 * Cattle Management API - Cloudflare Worker with Hono
 *
 * Main entry point for the serverless backend API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getDrizzleClient } from './db/client';
import type { Env } from './types';

// Import routes
import cattleRoutes from './routes/cattle';
import familyRoutes from './routes/family';
import uploadRoutes from './routes/upload';
import calvingRoutes from './routes/calvings';
import saleRoutes from './routes/sales';
import healthRoutes from './routes/health';
import analyticsRoutes from './routes/analytics';
import breedingRoutes from './routes/breeding';
import fieldsRoutes from './routes/fields';

const app = new Hono<{ Bindings: Env }>();

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

// TODO: Cloudflare Access authentication middleware
// app.use('/api/*', async (c, next) => {
//   const cfAccessJWT = c.req.header('Cf-Access-Jwt-Assertion');
//   if (!cfAccessJWT) {
//     return c.json({ error: 'Unauthorized' }, 401);
//   }
//   // Verify JWT with Cloudflare Access
//   await next();
// });

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

// API routes
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
