/**
 * Family Routes - Maternal lineage and family tree operations
 */

import { Hono } from 'hono';
import { FamilyService } from '../services/family';
import type { Env } from '../types';
import type { DrizzleD1Database } from '../db/client';

const family = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();

/**
 * GET /api/family/lineage/:id
 * Get maternal lineage (ancestors) for a cattle
 */
family.get('/lineage/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));
  const generations = parseInt(c.req.query('generations') || '5');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const familyService = new FamilyService(db);
    const lineage = await familyService.getMaternalLineage(id, generations);

    return c.json({
      data: lineage,
      count: lineage.length,
    });
  } catch (error) {
    console.error('Error fetching lineage:', error);
    return c.json({ error: 'Failed to fetch lineage' }, 500);
  }
});

/**
 * GET /api/family/descendants/:id
 * Get all descendants (offspring tree) for a cattle
 */
family.get('/descendants/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));
  const generations = parseInt(c.req.query('generations') || '10');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const familyService = new FamilyService(db);
    const descendants = await familyService.getAllDescendants(id, generations);

    return c.json({
      data: descendants,
    });
  } catch (error) {
    console.error('Error fetching descendants:', error);
    return c.json({ error: 'Failed to fetch descendants' }, 500);
  }
});

/**
 * GET /api/family/tree/:id
 * Get full family tree (ancestors + descendants)
 */
family.get('/tree/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));
  const ancestorGens = parseInt(c.req.query('ancestorGens') || '5');
  const descendantGens = parseInt(c.req.query('descendantGens') || '10');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const familyService = new FamilyService(db);
    const tree = await familyService.getFullFamilyTree(id, ancestorGens, descendantGens);

    return c.json({ data: tree });
  } catch (error) {
    console.error('Error fetching family tree:', error);
    return c.json({ error: 'Failed to fetch family tree' }, 500);
  }
});

/**
 * GET /api/family/overview/:id
 * Get family overview (siblings, offspring count, generation depth)
 */
family.get('/overview/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const familyService = new FamilyService(db);
    const overview = await familyService.getFamilyOverview(id);

    return c.json({ data: overview });
  } catch (error) {
    console.error('Error fetching family overview:', error);
    return c.json({ error: 'Failed to fetch family overview' }, 500);
  }
});

/**
 * GET /api/family/foundation
 * Get foundation mothers (no dam but have offspring)
 */
family.get('/foundation', async (c) => {
  const db = c.get('db');

  try {
    const familyService = new FamilyService(db);
    const foundationMothers = await familyService.getFoundationMothers();

    return c.json({
      data: foundationMothers,
      count: foundationMothers.length,
    });
  } catch (error) {
    console.error('Error fetching foundation mothers:', error);
    return c.json({ error: 'Failed to fetch foundation mothers' }, 500);
  }
});

/**
 * GET /api/family/siblings/:id
 * Get siblings (same mother)
 */
family.get('/siblings/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const familyService = new FamilyService(db);
    const siblings = await familyService.getSiblings(id);

    return c.json({
      data: siblings,
      count: siblings.length,
    });
  } catch (error) {
    console.error('Error fetching siblings:', error);
    return c.json({ error: 'Failed to fetch siblings' }, 500);
  }
});

/**
 * GET /api/family/stats/:id
 * Get detailed family size statistics
 */
family.get('/stats/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const familyService = new FamilyService(db);
    const stats = await familyService.getFamilySizeStats(id);

    return c.json({ data: stats });
  } catch (error) {
    console.error('Error fetching family stats:', error);
    return c.json({ error: 'Failed to fetch family stats' }, 500);
  }
});

export default family;
