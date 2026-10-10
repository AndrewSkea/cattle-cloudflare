/**
 * Taking an animal out of the herd (sale, death, cull, missing) and undoing it. Shared by the animal
 * routes and the mart-sale import so both apply the same withdrawal check and finance entries.
 */

import { and, eq, gte } from 'drizzle-orm';
import * as schema from '../db/schema';
import { type Ctx, HttpError, farmSession, logActivity, now } from '../lib/context';
import { deleteSourceTxn, syncSourceTxn } from './finance';

export interface ExitInput {
  status: 'sold' | 'died' | 'culled' | 'missing';
  exitDate: string;
  exitReason?: string | null;
  salePrice?: number | null;
  saleWeightKg?: number | null;
  buyer?: string | null;
  carcaseWeightKg?: number | null;
  carcaseGrade?: string | null;
  overrideWithdrawal?: boolean;
}

export async function exitAnimal(c: Ctx, a: schema.Animal, data: ExitInput) {
  const s = farmSession(c);
  const db = c.get('db');
  if (a.dob && data.exitDate < a.dob) throw new HttpError(422, `${a.tagNo}: exit date is before the date of birth`);
  const isSale = data.status === 'sold' || data.status === 'culled';
  if (isSale && !data.overrideWithdrawal) {
    const w = await db.select({ until: schema.healthRecords.withdrawalMeatUntil, title: schema.healthRecords.title }).from(schema.healthRecords)
      .where(and(eq(schema.healthRecords.animalId, a.id), gte(schema.healthRecords.withdrawalMeatUntil, data.exitDate))).get();
    if (w) throw new HttpError(409, `${a.tagNo} is under a meat withdrawal period until ${w.until} (${w.title}).`, { code: 'withdrawal' });
  }
  const [updated] = await db.update(schema.animals).set({
    status: data.status, exitDate: data.exitDate, exitReason: data.exitReason ?? null,
    salePrice: isSale ? data.salePrice ?? null : null, saleWeightKg: isSale ? data.saleWeightKg ?? null : null,
    buyer: isSale ? data.buyer ?? null : null,
    carcaseWeightKg: data.carcaseWeightKg ?? null, carcaseGrade: data.carcaseGrade ?? null,
    parcelId: null, structureId: null, updatedAt: now(),
  }).where(eq(schema.animals.id, a.id)).returning();
  await syncSourceTxn(db, s.farmId, s.userId, 'animal_sale', a.id, isSale && data.salePrice ? {
    type: 'income', category: 'livestock_sales', amount: data.salePrice, date: data.exitDate,
    description: `Sale of ${a.tagNo}`, counterparty: data.buyer, animalId: a.id,
  } : null);
  await logActivity(c, data.status, 'animal', a.id, `${a.tagNo} marked as ${data.status}`);
  return updated;
}

export async function reinstateAnimal(c: Ctx, a: schema.Animal) {
  const s = farmSession(c);
  const db = c.get('db');
  await db.update(schema.animals).set({
    status: 'active', exitDate: null, exitReason: null, salePrice: null, saleWeightKg: null, buyer: null,
    carcaseWeightKg: null, carcaseGrade: null, updatedAt: now(),
  }).where(eq(schema.animals.id, a.id));
  await deleteSourceTxn(db, s.farmId, 'animal_sale', a.id);
  await logActivity(c, 'reinstated', 'animal', a.id, `${a.tagNo} returned to the herd`);
}
