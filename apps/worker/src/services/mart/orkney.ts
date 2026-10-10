/**
 * Orkney Auction Mart: fetches sales reports from the mart's public WordPress events API, stores the parsed
 * lots (shared by every farm), and creates per-farm "matches" for lots sold under the farm's seller names.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { DrizzleD1Database } from '../../db/client';
import { decodeEntities, parseAverages, parseReport, reportSummary, sellerKey } from './parse';

const API = 'https://orkneymart.com/wp-json/tribe/events/v1/events';
const UA = 'HoovesWho farm records (+https://hooveswho.andrewskea.com)';
export const MART_PROVIDER = 'orkney_mart';

interface WpEvent { id: number; title: string; start_date: string; url: string; description: string }

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sales reports between two dates (inclusive), newest pages first. */
export async function fetchReports(start: string, end: string, maxPages = 6): Promise<WpEvent[]> {
  const out: WpEvent[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${API}?categories=sales-report&per_page=50&page=${page}&start_date=${start}&end_date=${end}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 400 || res.status === 404) break; // past the last page
    if (!res.ok) throw new Error(`Orkney Mart returned ${res.status}`);
    const json = await res.json() as { events?: WpEvent[]; total_pages?: number };
    out.push(...(json.events ?? []));
    if (!json.total_pages || page >= json.total_pages) break;
  }
  return out;
}

/** D1 allows 100 bound parameters per statement. */
function chunk<T>(rows: T[], perRow: number): T[][] {
  const size = Math.max(1, Math.floor(99 / perRow));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Stores (or refreshes, when the text changed) one report. Returns true when lots were (re)written. */
export async function storeReport(db: DrizzleD1Database, ev: WpEvent): Promise<boolean> {
  const hash = await sha(ev.description);
  const existing = await db.select({ hash: schema.martReports.contentHash }).from(schema.martReports).where(eq(schema.martReports.id, ev.id)).get();
  if (existing?.hash === hash) return false;
  const date = ev.start_date.slice(0, 10);
  const title = decodeEntities(ev.title);
  const lots = parseReport(ev.description, title);
  const averages = parseAverages(ev.description);
  const report = { id: ev.id, source: 'orkney', date, title, url: ev.url, summary: reportSummary(ev.description), contentHash: hash, lotCount: lots.length, fetchedAt: new Date().toISOString() };

  const stmts: any[] = [];
  if (existing) {
    stmts.push(db.delete(schema.martLots).where(eq(schema.martLots.reportId, ev.id)));
    stmts.push(db.delete(schema.martAverages).where(eq(schema.martAverages.reportId, ev.id)));
    stmts.push(db.update(schema.martReports).set(report).where(eq(schema.martReports.id, ev.id)));
  } else {
    stmts.push(db.insert(schema.martReports).values(report));
  }
  for (const part of chunk(lots, 17)) {
    stmts.push(db.insert(schema.martLots).values(part.map((l) => ({ ...l, reportId: ev.id, date }))));
  }
  for (const part of chunk(averages, 8)) {
    stmts.push(db.insert(schema.martAverages).values(part.map((a) => ({ ...a, reportId: ev.id, date }))));
  }
  await db.batch(stmts as [any, ...any[]]);
  return true;
}

/** Creates "new" matches for every stored lot sold under one of the farm's seller names. */
export async function matchFarm(db: DrizzleD1Database, farmId: number, sellers: string[]) {
  const keys = [...new Set(sellers.map(sellerKey).filter(Boolean))];
  if (!keys.length) return 0;
  const res = await db.run(sql`
    INSERT INTO mart_matches (farm_id, lot_id, status)
    SELECT ${farmId}, l.id, 'new' FROM mart_lots l
    WHERE l.seller_key IN (SELECT value FROM json_each(${JSON.stringify(keys)}))
    ON CONFLICT (farm_id, lot_id) DO NOTHING`);
  return res.meta.changes ?? 0;
}

/** Removes undecided matches whose seller is no longer one of the farm's names. */
export async function pruneMatches(db: DrizzleD1Database, farmId: number, sellers: string[]) {
  const keys = [...new Set(sellers.map(sellerKey).filter(Boolean))];
  await db.run(sql`
    DELETE FROM mart_matches WHERE farm_id = ${farmId} AND status = 'new'
    AND lot_id IN (SELECT id FROM mart_lots WHERE seller_key NOT IN (SELECT value FROM json_each(${JSON.stringify(keys)})))`);
}

export function martConfig(row: { config: string } | undefined | null): { sellers: string[] } {
  try {
    const c = JSON.parse(row?.config || '{}');
    return { sellers: Array.isArray(c.sellers) ? c.sellers.filter((x: unknown) => typeof x === 'string') : [] };
  } catch {
    return { sellers: [] };
  }
}

/**
 * Fetches reports from the last `days` days (new or edited ones only), then matches them for every farm that
 * has seller names configured. Small enough to run inside a cron invocation.
 */
export async function syncOrkneyMart(db: DrizzleD1Database, opts: { days?: number; start?: string; maxReports?: number } = {}) {
  const end = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const start = opts.start ?? new Date(Date.now() - (opts.days ?? 21) * 86_400_000).toISOString().slice(0, 10);
  const events = await fetchReports(start, end);
  let updated = 0;
  for (const ev of events.slice(0, opts.maxReports ?? 40)) {
    if (!ev.description) continue;
    if (await storeReport(db, ev)) updated++;
  }
  let matched = 0;
  if (updated) {
    const farms = await db.select({ farmId: schema.farmIntegrations.farmId, config: schema.farmIntegrations.config })
      .from(schema.farmIntegrations).where(eq(schema.farmIntegrations.provider, MART_PROVIDER)).all();
    for (const f of farms) matched += await matchFarm(db, f.farmId, martConfig(f).sellers);
  }
  return { reports: events.length, updated, matched };
}

// ---------------- Candidate animals for a lot ----------------

const BREED_CODES: [RegExp, string][] = [
  [/^(AA|ABA|AAX|ANG|ABERDEEN)/, 'aberdeen angus'], [/^(CH|CHAR|CHX)$/, 'charolais'], [/^(LIM|LIMX|LM)$/, 'limousin'],
  [/^(SIM|SM|SIMX|SIMM)$/, 'simmental'], [/^(BB|BRB|BBX|BRI ?BLU|BLU|BLUE)/, 'british blue'], [/^(SAL|SALX)$/, 'salers'],
  [/^(SH|SHX|SHORT)/, 'shorthorn'], [/^(HER|HFD|HEX)/, 'hereford'], [/^(BA|BAQ|BLONDE)/, 'blonde'], [/^(STAB)/, 'stabiliser'],
  [/^(GAL|BG)/, 'galloway'], [/^(HIGH|HL)/, 'highland'], [/^(FR|HOL|FRX)/, 'holstein'], [/^(TEX|TEXX)/, 'texel'],
  [/^(SUF)/, 'suffolk'], [/^(CHEV)/, 'cheviot'], [/^(BELT)/, 'beltex'],
];

export function breedName(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.toUpperCase().trim();
  return BREED_CODES.find(([re]) => re.test(c))?.[1] ?? null;
}

export interface Candidate {
  id: number; tagNo: string; managementTag: string | null; name: string | null; sex: string; castrated: boolean;
  breed: string | null; dob: string | null; status: string; ageMonths: number | null; lastWeightKg: number | null;
  score: number; reasons: string[];
}

function monthsBetween(dob: string | null, at: string): number | null {
  if (!dob) return null;
  const a = new Date(dob + 'T00:00:00Z'); const b = new Date(at + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

/** Ranks the farm's animals by how likely each is to be the animal in this lot. */
export async function lotCandidates(db: DrizzleD1Database, farmId: number, lot: schema.MartLot): Promise<Candidate[]> {
  const species = lot.species === 'sheep' ? 'sheep' : 'cattle';
  const rows = await db.select().from(schema.animals).where(and(eq(schema.animals.farmId, farmId), eq(schema.animals.species, species))).all();
  // Animals already tied to an imported lot are taken.
  const taken = new Set<number>();
  const imported = await db.select({ ids: schema.martMatches.animalIds }).from(schema.martMatches)
    .where(and(eq(schema.martMatches.farmId, farmId), eq(schema.martMatches.status, 'imported'))).all();
  for (const r of imported) for (const id of JSON.parse(r.ids || '[]')) taken.add(id);
  const dams = new Set((await db.select({ id: schema.birthRecords.damId }).from(schema.birthRecords).where(eq(schema.birthRecords.farmId, farmId)).all()).map((r) => r.id));
  const ids = rows.map((r) => r.id);
  const weights = new Map<number, number>();
  if (ids.length) {
    const w = await db.all<{ animal_id: number; weight_kg: number }>(sql`
      SELECT animal_id, weight_kg FROM weight_records w WHERE farm_id = ${farmId} AND date <= ${lot.date}
      AND date = (SELECT MAX(date) FROM weight_records w2 WHERE w2.animal_id = w.animal_id AND w2.date <= ${lot.date})`);
    for (const r of w) weights.set(r.animal_id, r.weight_kg);
  }
  const breed = breedName(lot.breedCode);
  const out: Candidate[] = [];
  for (const a of rows) {
    if (taken.has(a.id)) continue;
    const soldThatDay = a.status !== 'active' && a.exitDate === lot.date;
    if (a.status !== 'active' && !soldThatDay) continue;
    if (a.dob && a.dob > lot.date) continue;
    const age = monthsBetween(a.dob, lot.date) ?? (a.birthYear ? (Number(lot.date.slice(0, 4)) - a.birthYear) * 12 : null);
    const reasons: string[] = [];
    let score = 0;
    const calved = dams.has(a.id);
    switch (lot.category) {
      case 'steers':
        if (a.sex !== 'male') continue;
        score += a.castrated ? 3 : 1; reasons.push(a.castrated ? 'Steer' : 'Male');
        break;
      case 'heifers':
        if (a.sex !== 'female') continue;
        if (calved) score -= 2; else { score += 3; reasons.push('Heifer, never calved'); }
        break;
      case 'bulls':
        if (a.sex !== 'male') continue;
        if (!a.castrated) { score += 3; reasons.push('Entire male'); }
        break;
      case 'cows': case 'breeding':
        if (a.sex !== 'female') continue;
        if (calved) { score += 3; reasons.push('Has calved'); }
        break;
      case 'otm':
        if (age != null && age < 30) continue;
        score += a.sex === 'female' && calved ? 2 : 1;
        break;
      case 'calves':
        if (age != null && age > 14) continue;
        score += 2;
        break;
    }
    if (breed && a.breed) {
      if (a.breed.toLowerCase().includes(breed)) { score += 3; reasons.push(`Breed ${a.breed}`); } else score -= 1;
    }
    if (age != null && ['steers', 'heifers'].includes(lot.category)) {
      if (age >= 8 && age <= 30) { score += 1; reasons.push(`${age} months old`); } else if (age < 6 || age > 40) score -= 2;
    }
    const lw = weights.get(a.id) ?? null;
    if (lw && lot.weightKg) {
      const diff = Math.abs(lw - lot.weightKg) / lot.weightKg;
      if (diff < 0.08) { score += 2; reasons.push(`Last weighed ${lw} kg`); } else if (diff < 0.2) score += 1;
    }
    if (soldThatDay) { score += 2; reasons.push('Already marked sold that day'); }
    out.push({
      id: a.id, tagNo: a.tagNo, managementTag: a.managementTag, name: a.name, sex: a.sex, castrated: a.castrated,
      breed: a.breed, dob: a.dob, status: a.status, ageMonths: age, lastWeightKg: lw, score, reasons,
    });
  }
  return out.sort((x, y) => y.score - x.score || (x.dob ?? '').localeCompare(y.dob ?? '')).slice(0, 40);
}

export async function lotsByIds(db: DrizzleD1Database, ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(schema.martLots).where(inArray(schema.martLots.id, ids)).all();
}
