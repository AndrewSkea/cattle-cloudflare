/**
 * Farm-scoped CRUD routes for simple resources.
 */

import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import type { ZodObject, ZodRawShape } from 'zod';
import { type AppEnv, type Ctx, type Role, body, farmSession, idParam, logActivity, notFound, requireRole } from './context';

interface CrudOptions<S extends ZodRawShape> {
  table: any;
  input: ZodObject<S>;
  entity: string;
  label: (row: any) => string;
  read: Role;
  write: Role;
  remove?: Role;
  orderBy?: any;
  /** Validate / enrich input before write (e.g. check referenced ids belong to the farm). */
  prepare?: (c: Ctx, data: any, id?: number) => Promise<any> | any;
  afterWrite?: (c: Ctx, row: any, before?: any) => Promise<void>;
  afterDelete?: (c: Ctx, row: any) => Promise<void>;
  /** Override list output (e.g. add computed fields). */
  list?: (c: Ctx, rows: any[]) => Promise<any[]> | any[];
}

export function crud<S extends ZodRawShape>(o: CrudOptions<S>) {
  const app = new Hono<AppEnv>();
  const t = o.table;
  const scoped = (c: Ctx, id: number) => and(eq(t.id, id), eq(t.farmId, farmSession(c).farmId));

  app.get('/', requireRole(o.read), async (c) => {
    const s = farmSession(c);
    const rows = await c.get('db').select().from(t).where(eq(t.farmId, s.farmId)).orderBy(o.orderBy ?? desc(t.id)).all();
    return c.json({ data: o.list ? await o.list(c, rows) : rows });
  });

  app.get('/:id', requireRole(o.read), async (c) => {
    const row = await c.get('db').select().from(t).where(scoped(c, idParam(c))).get();
    if (!row) throw notFound();
    return c.json({ data: row });
  });

  app.post('/', requireRole(o.write), async (c) => {
    const s = farmSession(c);
    let data = await body(c, o.input);
    if (o.prepare) data = await o.prepare(c, data);
    const [row] = (await c.get('db').insert(t).values({ ...data, farmId: s.farmId, ...('createdBy' in t ? { createdBy: s.userId } : {}) }).returning()) as any[];
    if (o.afterWrite) await o.afterWrite(c, row);
    await logActivity(c, 'created', o.entity, row.id, `Added ${o.label(row)}`);
    return c.json({ data: row }, 201);
  });

  app.put('/:id', requireRole(o.write), async (c) => {
    const id = idParam(c);
    const before = await c.get('db').select().from(t).where(scoped(c, id)).get();
    if (!before) throw notFound();
    let data = await body(c, o.input.partial());
    if (o.prepare) data = await o.prepare(c, data, id);
    const [row] = (await c.get('db').update(t).set({ ...data, ...('updatedAt' in t ? { updatedAt: new Date().toISOString() } : {}) })
      .where(scoped(c, id)).returning()) as any[];
    if (o.afterWrite) await o.afterWrite(c, row, before);
    await logActivity(c, 'updated', o.entity, id, `Updated ${o.label(row)}`);
    return c.json({ data: row });
  });

  app.delete('/:id', requireRole(o.remove ?? o.write), async (c) => {
    const id = idParam(c);
    const [row] = (await c.get('db').delete(t).where(scoped(c, id)).returning()) as any[];
    if (!row) throw notFound();
    if (o.afterDelete) await o.afterDelete(c, row);
    await logActivity(c, 'deleted', o.entity, id, `Deleted ${o.label(row)}`);
    return c.json({ ok: true });
  });

  return app;
}
