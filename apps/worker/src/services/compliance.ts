/**
 * Cattle traceability helpers (Scotland / ScotEID rules, which match the rest of GB in the main):
 *  - UK ear tag validation (format + check digit),
 *  - reporting deadlines for births, deaths and movements,
 *  - the holding register (statutory on-farm record).
 *
 * Deadlines (ScotEID "Cattle Traceability and Record Keeping" keeper guide):
 *  beef calves tagged within 20 days of birth; birth registered within 27 days;
 *  movements on/off reported within 3 days (approved Scottish marts/abattoirs report on the keeper's behalf);
 *  deaths reported within 7 days.
 */

import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';
import { addDays, today } from '../lib/context';

export const DEADLINES = { tagging: 20, birth: 27, movement: 3, death: 7 } as const;

/** "UK 523801 2 00788", "uk523801-200788" → "UK523801200788". */
export function normaliseTag(tag: string): string {
  return tag.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Formats a normalised UK tag the way it is printed: "UK 523801 2 00788". */
export function displayTag(tag: string): string {
  const t = normaliseTag(tag);
  return /^UK\d{12}$/.test(t) ? `UK ${t.slice(2, 8)} ${t.slice(8, 9)} ${t.slice(9)}` : tag;
}

export interface TagCheck { ok: boolean; issue?: string; herdMark?: string; checkDigit?: number; expected?: number }

/**
 * UK cattle tags: "UK" + 6-digit herd mark + check digit + 5-digit animal number. The check digit is
 * ((herd mark & animal number as one 11-digit number) mod 7) + 1.
 */
export function checkUkTag(tag: string): TagCheck {
  const t = normaliseTag(tag);
  if (!t.startsWith('UK')) return /^[A-Z]{2}\d{6,14}$/.test(t) ? { ok: true } : { ok: false, issue: 'Not a recognised ear tag number' };
  const digits = t.slice(2);
  if (!/^\d+$/.test(digits)) return { ok: false, issue: 'Contains letters after "UK"' };
  if (digits.length !== 12) return { ok: false, issue: `Has ${digits.length} digits after "UK" — UK cattle tags have 12` };
  const herdMark = digits.slice(0, 6);
  const checkDigit = Number(digits[6]);
  const expected = (Number(herdMark + digits.slice(7)) % 7) + 1;
  if (checkDigit !== expected) return { ok: false, issue: `Check digit is ${checkDigit} but should be ${expected} — probably a typo`, herdMark, checkDigit, expected };
  return { ok: true, herdMark, checkDigit };
}

export interface TagIssue { animalId: number; tagNo: string; managementTag: string | null; status: string; issue: string }

export async function tagIssues(db: DrizzleD1Database, farmId: number): Promise<TagIssue[]> {
  const farm = await db.select({ herdMark: schema.farms.herdMark }).from(schema.farms).where(eq(schema.farms.id, farmId)).get();
  const rows = await db.select({
    id: schema.animals.id, tagNo: schema.animals.tagNo, managementTag: schema.animals.managementTag, status: schema.animals.status,
    origin: schema.animals.origin,
  }).from(schema.animals).where(and(eq(schema.animals.farmId, farmId), eq(schema.animals.species, 'cattle'))).all();
  const out: TagIssue[] = [];
  const seen = new Map<string, number>();
  for (const a of rows) {
    const n = normaliseTag(a.tagNo);
    const check = checkUkTag(a.tagNo);
    if (!check.ok) out.push({ animalId: a.id, tagNo: a.tagNo, managementTag: a.managementTag, status: a.status, issue: check.issue! });
    else if (farm?.herdMark && check.herdMark && a.origin === 'born' && check.herdMark !== farm.herdMark.replace(/\D/g, '')) {
      out.push({ animalId: a.id, tagNo: a.tagNo, managementTag: a.managementTag, status: a.status, issue: `Born here but herd mark is ${check.herdMark}, not ${farm.herdMark}` });
    }
    if (seen.has(n)) out.push({ animalId: a.id, tagNo: a.tagNo, managementTag: a.managementTag, status: a.status, issue: 'Same tag number as another animal' });
    seen.set(n, a.id);
  }
  return out;
}

export type DeadlineKind = 'tagging' | 'birth' | 'death' | 'move_off' | 'move_on';
export type DeadlineState = 'reported' | 'by_mart' | 'due' | 'overdue';

export interface Deadline {
  kind: DeadlineKind; animalId: number; tagNo: string; managementTag: string | null;
  eventDate: string; dueDate: string; state: DeadlineState; note?: string;
}

const MART_OR_ABATTOIR = /mart|auction|abattoir|slaughter|meat|butcher|dunbia|scotbeef|donaldson|williamson|flett/i;

/**
 * Reporting obligations for cattle events in the last `days` days. When ScotEID has been synced, events it
 * already holds are marked as reported.
 */
export async function deadlines(db: DrizzleD1Database, farmId: number, days = 60): Promise<Deadline[]> {
  const t = today();
  const since = addDays(t, -days);
  const animals = await db.select().from(schema.animals).where(and(eq(schema.animals.farmId, farmId), eq(schema.animals.species, 'cattle'))).all();
  const synced = await db.select({ tag: schema.scoteidEvents.tag, type: schema.scoteidEvents.eventType, date: schema.scoteidEvents.date })
    .from(schema.scoteidEvents).where(eq(schema.scoteidEvents.farmId, farmId)).all();
  const onScotEID = new Set((await db.select({ tag: schema.scoteidAnimals.tag }).from(schema.scoteidAnimals).where(eq(schema.scoteidAnimals.farmId, farmId)).all()).map((r) => r.tag));
  const hasEvent = (tag: string, types: number[], date: string) =>
    synced.some((e) => e.tag === tag && types.includes(e.type) && Math.abs(Date.parse(e.date) - Date.parse(date)) <= 3 * 86_400_000);
  const state = (due: string, reported: boolean): DeadlineState => reported ? 'reported' : due < t ? 'overdue' : 'due';
  const out: Deadline[] = [];

  for (const a of animals) {
    const tag = normaliseTag(a.tagNo);
    const base = { animalId: a.id, tagNo: a.tagNo, managementTag: a.managementTag };
    if (a.origin === 'born' && a.dob && a.dob >= since) {
      const registered = onScotEID.has(tag) || hasEvent(tag, [0], a.dob);
      const tagged = checkUkTag(a.tagNo).ok;
      if (!tagged) out.push({ ...base, kind: 'tagging', eventDate: a.dob, dueDate: addDays(a.dob, DEADLINES.tagging), state: state(addDays(a.dob, DEADLINES.tagging), false), note: 'Fit both ear tags' });
      out.push({ ...base, kind: 'birth', eventDate: a.dob, dueDate: addDays(a.dob, DEADLINES.birth), state: state(addDays(a.dob, DEADLINES.birth), registered) });
    }
    if (a.origin === 'purchased' && a.purchaseDate && a.purchaseDate >= since) {
      const viaMart = MART_OR_ABATTOIR.test(a.purchaseSource || '');
      const reported = hasEvent(tag, [2, 22, 32], a.purchaseDate);
      out.push({ ...base, kind: 'move_on', eventDate: a.purchaseDate, dueDate: addDays(a.purchaseDate, DEADLINES.movement),
        state: reported ? 'reported' : viaMart ? 'by_mart' : state(addDays(a.purchaseDate, DEADLINES.movement), false),
        note: viaMart ? 'Bought through a mart — the mart reports the move' : undefined });
    }
    if (a.exitDate && a.exitDate >= since) {
      if (a.status === 'died') {
        out.push({ ...base, kind: 'death', eventDate: a.exitDate, dueDate: addDays(a.exitDate, DEADLINES.death), state: state(addDays(a.exitDate, DEADLINES.death), hasEvent(tag, [7], a.exitDate)) });
      } else if (a.status === 'sold' || a.status === 'culled') {
        const viaMart = MART_OR_ABATTOIR.test(`${a.buyer || ''} ${a.exitReason || ''}`);
        const reported = hasEvent(tag, [3, 23], a.exitDate);
        out.push({ ...base, kind: 'move_off', eventDate: a.exitDate, dueDate: addDays(a.exitDate, DEADLINES.movement),
          state: reported ? 'reported' : viaMart ? 'by_mart' : state(addDays(a.exitDate, DEADLINES.movement), false),
          note: viaMart ? 'Sold through a mart or abattoir — they report the move' : 'Private sale — report the move off' });
      }
    }
  }
  const order: Record<DeadlineState, number> = { overdue: 0, due: 1, by_mart: 2, reported: 3 };
  return out.sort((x, y) => order[x.state] - order[y.state] || x.dueDate.localeCompare(y.dueDate));
}

export async function complianceSummary(db: DrizzleD1Database, farmId: number) {
  const [d, tags] = await Promise.all([deadlines(db, farmId), tagIssues(db, farmId)]);
  const soon = addDays(today(), 3);
  return {
    overdue: d.filter((x) => x.state === 'overdue').length,
    dueSoon: d.filter((x) => x.state === 'due' && x.dueDate <= soon).length,
    tagIssues: tags.length,
  };
}

export interface RegisterRow {
  animalId: number; tagNo: string; managementTag: string | null; sex: string; breed: string | null; dob: string | null;
  damTag: string | null; dateOn: string | null; onFrom: string; dateOff: string | null; offTo: string | null; offReason: string | null;
}

/** Holding register for a calendar year: every bovine on the holding at any point in that year. */
export async function holdingRegister(db: DrizzleD1Database, farmId: number, year: number): Promise<RegisterRow[]> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const rows = await db.select().from(schema.animals).where(and(eq(schema.animals.farmId, farmId), eq(schema.animals.species, 'cattle'))).all();
  const damIds = [...new Set(rows.map((r) => r.damId).filter((x): x is number => !!x))];
  const dams = new Map(rows.filter((r) => damIds.includes(r.id)).map((r) => [r.id, r.tagNo]));
  const missing = damIds.filter((id) => !dams.has(id));
  if (missing.length) {
    for (const d of await db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo }).from(schema.animals).where(inArray(schema.animals.id, missing)).all()) dams.set(d.id, d.tagNo);
  }
  return rows
    .map((a) => {
      const on = a.origin === 'purchased' ? a.purchaseDate : a.dob ?? (a.birthYear ? `${a.birthYear}-01-01` : null);
      return {
        animalId: a.id, tagNo: a.tagNo, managementTag: a.managementTag,
        sex: a.sex === 'male' ? (a.castrated ? 'Steer' : 'Bull') : 'Female', breed: a.breed, dob: a.dob,
        damTag: a.damId ? dams.get(a.damId) ?? null : null,
        dateOn: on, onFrom: a.origin === 'purchased' ? (a.purchaseSource || 'Purchased') : 'Born on holding',
        dateOff: a.status === 'active' ? null : a.exitDate,
        offTo: a.status === 'active' ? null : a.status === 'died' ? 'Died' : a.status === 'missing' ? 'Missing' : (a.buyer || 'Sold'),
        offReason: a.status === 'active' ? null : a.status,
      };
    })
    .filter((r) => (!r.dateOn || r.dateOn <= end) && (!r.dateOff || r.dateOff >= start))
    .sort((x, y) => (x.dateOn ?? '').localeCompare(y.dateOn ?? '') || x.tagNo.localeCompare(y.tagNo));
}
