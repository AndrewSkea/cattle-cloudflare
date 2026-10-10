/**
 * Keeps auto-generated transactions (animal sales/purchases, vet costs, equipment costs) in step
 * with the records that create them. The transactions table is the single source of truth for money.
 */

import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';

type Source = 'animal_sale' | 'animal_purchase' | 'health' | 'equipment_log';

export interface SourceTxn {
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  description: string;
  counterparty?: string | null;
  animalId?: number | null;
  equipmentId?: number | null;
}

/** Creates, updates or (when `txn` is null / amount ≤ 0) deletes the transaction for a source record. */
export async function syncSourceTxn(
  db: DrizzleD1Database, farmId: number, userId: number, source: Source, sourceId: number, txn: SourceTxn | null,
) {
  const where = and(eq(schema.transactions.farmId, farmId), eq(schema.transactions.source, source), eq(schema.transactions.sourceId, sourceId));
  const existing = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(where).get();
  if (!txn || !(txn.amount > 0)) {
    if (existing) await db.delete(schema.transactions).where(eq(schema.transactions.id, existing.id));
    return;
  }
  const values = {
    type: txn.type, category: txn.category, amount: txn.amount, date: txn.date, description: txn.description,
    counterparty: txn.counterparty ?? null, animalId: txn.animalId ?? null, equipmentId: txn.equipmentId ?? null,
  };
  if (existing) {
    await db.update(schema.transactions).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(schema.transactions.id, existing.id));
  } else {
    await db.insert(schema.transactions).values({ ...values, farmId, source, sourceId, createdBy: userId });
  }
}

export async function deleteSourceTxn(db: DrizzleD1Database, farmId: number, source: Source, sourceId: number) {
  await db.delete(schema.transactions).where(and(
    eq(schema.transactions.farmId, farmId), eq(schema.transactions.source, source), eq(schema.transactions.sourceId, sourceId)));
}
