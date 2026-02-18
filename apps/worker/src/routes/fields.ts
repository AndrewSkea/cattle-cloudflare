/**
 * Fields Routes - CRUD operations for field/paddock management
 * and cattle assignment to fields
 */

import { Hono } from 'hono';
import { eq, isNull, and, desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../types';
import type { DrizzleD1Database } from '../db/client';

const fieldsRoutes = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();

// ==================== ROUTES ====================

/**
 * GET /api/fields
 * List all fields with current cattle assignments
 */
fieldsRoutes.get('/', async (c) => {
  const db = c.get('db');

  try {
    const allFields = await db.query.fields.findMany({
      with: {
        assignments: {
          where: isNull(schema.fieldAssignments.removedDate),
          with: { cattle: true },
        },
      },
    });

    const data = allFields.map(f => ({
      ...f,
      currentCattle: f.assignments.map(a => a.cattle),
      cattleCount: f.assignments.length,
    }));

    return c.json({ data });
  } catch (error) {
    console.error('Error fetching fields:', error);
    return c.json({ error: 'Failed to fetch fields' }, 500);
  }
});

/**
 * GET /api/fields/:id
 * Get single field with current cattle assignments
 */
fieldsRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const field = await db.query.fields.findFirst({
      where: eq(schema.fields.id, id),
      with: {
        assignments: {
          where: isNull(schema.fieldAssignments.removedDate),
          with: { cattle: true },
        },
      },
    });

    if (!field) {
      return c.json({ error: 'Field not found' }, 404);
    }

    const data = {
      ...field,
      currentCattle: field.assignments.map(a => a.cattle),
      cattleCount: field.assignments.length,
    };

    return c.json({ data });
  } catch (error) {
    console.error('Error fetching field:', error);
    return c.json({ error: 'Failed to fetch field' }, 500);
  }
});

/**
 * POST /api/fields
 * Create a new field
 */
fieldsRoutes.post('/', async (c) => {
  const db = c.get('db');

  try {
    const body = await c.req.json();
    const { name, fieldType, polygon, centerLat, centerLng, area, capacity, color, notes } = body;

    if (!name) {
      return c.json({ error: 'Field name is required' }, 400);
    }

    const [newField] = await db.insert(schema.fields).values({
      name,
      fieldType: fieldType || 'grazing',
      polygon,
      centerLat,
      centerLng,
      area,
      capacity,
      color: color || '#22c55e',
      notes,
    }).returning();

    return c.json({ data: newField }, 201);
  } catch (error) {
    console.error('Error creating field:', error);
    return c.json({ error: 'Failed to create field' }, 500);
  }
});

/**
 * PUT /api/fields/:id
 * Update an existing field
 */
fieldsRoutes.put('/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const body = await c.req.json();
    const { name, fieldType, polygon, centerLat, centerLng, area, capacity, color, notes } = body;

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (fieldType !== undefined) updates.fieldType = fieldType;
    if (polygon !== undefined) updates.polygon = polygon;
    if (centerLat !== undefined) updates.centerLat = centerLat;
    if (centerLng !== undefined) updates.centerLng = centerLng;
    if (area !== undefined) updates.area = area;
    if (capacity !== undefined) updates.capacity = capacity;
    if (color !== undefined) updates.color = color;
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db.update(schema.fields)
      .set(updates)
      .where(eq(schema.fields.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: 'Field not found' }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error('Error updating field:', error);
    return c.json({ error: 'Failed to update field' }, 500);
  }
});

/**
 * DELETE /api/fields/:id
 * Delete a field
 */
fieldsRoutes.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const [deleted] = await db.delete(schema.fields)
      .where(eq(schema.fields.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Field not found' }, 404);
    }

    return c.json({ data: deleted });
  } catch (error) {
    console.error('Error deleting field:', error);
    return c.json({ error: 'Failed to delete field' }, 500);
  }
});

/**
 * POST /api/fields/:id/assign
 * Assign cattle to a field
 * Body: { cattleIds: number[], assignedDate: string }
 */
fieldsRoutes.post('/:id/assign', async (c) => {
  const db = c.get('db');
  const fieldId = parseInt(c.req.param('id'));

  if (isNaN(fieldId)) {
    return c.json({ error: 'Invalid field ID' }, 400);
  }

  try {
    const body = await c.req.json();
    const { cattleIds, assignedDate } = body;

    if (!cattleIds || !Array.isArray(cattleIds) || cattleIds.length === 0) {
      return c.json({ error: 'cattleIds array is required' }, 400);
    }

    if (!assignedDate) {
      return c.json({ error: 'assignedDate is required' }, 400);
    }

    // Verify the field exists
    const field = await db.query.fields.findFirst({
      where: eq(schema.fields.id, fieldId),
    });

    if (!field) {
      return c.json({ error: 'Field not found' }, 404);
    }

    const assignments = [];

    for (const cattleId of cattleIds) {
      // Close any existing assignment for this cattle (set removedDate)
      await db.update(schema.fieldAssignments)
        .set({ removedDate: assignedDate })
        .where(
          and(
            eq(schema.fieldAssignments.cattleId, cattleId),
            isNull(schema.fieldAssignments.removedDate),
          )
        );

      // Create new assignment
      const [assignment] = await db.insert(schema.fieldAssignments).values({
        cattleId,
        fieldId,
        assignedDate,
      }).returning();

      assignments.push(assignment);
    }

    return c.json({ data: assignments }, 201);
  } catch (error) {
    console.error('Error assigning cattle to field:', error);
    return c.json({ error: 'Failed to assign cattle to field' }, 500);
  }
});

/**
 * POST /api/fields/:id/remove
 * Remove cattle from a field
 * Body: { cattleIds: number[], removedDate?: string }
 */
fieldsRoutes.post('/:id/remove', async (c) => {
  const db = c.get('db');
  const fieldId = parseInt(c.req.param('id'));

  if (isNaN(fieldId)) {
    return c.json({ error: 'Invalid field ID' }, 400);
  }

  try {
    const body = await c.req.json();
    const { cattleIds, removedDate } = body;

    if (!cattleIds || !Array.isArray(cattleIds) || cattleIds.length === 0) {
      return c.json({ error: 'cattleIds array is required' }, 400);
    }

    const dateToUse = removedDate || new Date().toISOString().split('T')[0];
    const updated = [];

    for (const cattleId of cattleIds) {
      const [assignment] = await db.update(schema.fieldAssignments)
        .set({ removedDate: dateToUse })
        .where(
          and(
            eq(schema.fieldAssignments.cattleId, cattleId),
            eq(schema.fieldAssignments.fieldId, fieldId),
            isNull(schema.fieldAssignments.removedDate),
          )
        )
        .returning();

      if (assignment) {
        updated.push(assignment);
      }
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error('Error removing cattle from field:', error);
    return c.json({ error: 'Failed to remove cattle from field' }, 500);
  }
});

/**
 * GET /api/fields/:id/history
 * Get assignment history for a field
 */
fieldsRoutes.get('/:id/history', async (c) => {
  const db = c.get('db');
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const history = await db.query.fieldAssignments.findMany({
      where: eq(schema.fieldAssignments.fieldId, id),
      with: { cattle: true },
      orderBy: [desc(schema.fieldAssignments.assignedDate)],
    });

    return c.json({ data: history });
  } catch (error) {
    console.error('Error fetching field history:', error);
    return c.json({ error: 'Failed to fetch field history' }, 500);
  }
});

export default fieldsRoutes;
