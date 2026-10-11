/**
 * Livestock domain logic: age, class (cow/heifer/steer…), and family-tree analytics.
 */

import { and, asc, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';

export interface AnimalLite {
  id: number;
  species: string;
  tagNo: string;
  managementTag: string | null;
  name: string | null;
  sex: string;
  castrated: boolean;
  breed: string | null;
  dob: string | null;
  birthYear: number | null;
  damId: number | null;
  sireId: number | null;
  sireName: string | null;
  status: string;
  exitDate: string | null;
  exitReason: string | null;
  salePrice: number | null;
  saleWeightKg: number | null;
}

export function ageMonths(dob: string | null, birthYear: number | null, at = new Date()): number | null {
  if (dob) {
    const d = new Date(dob + 'T00:00:00Z');
    return Math.max(0, (at.getUTCFullYear() - d.getUTCFullYear()) * 12 + (at.getUTCMonth() - d.getUTCMonth()) - (at.getUTCDate() < d.getUTCDate() ? 1 : 0));
  }
  if (birthYear) return Math.max(0, (at.getUTCFullYear() - birthYear) * 12);
  return null;
}

/** Class name used for categories ("Cows", "Heifers", "Lambs"…). */
export function classify(a: { species: string; sex: string; castrated: boolean }, age: number | null, hasGivenBirth: boolean): string {
  const young = (months: number) => age != null && age < months;
  switch (a.species) {
    case 'cattle':
      if (young(12)) return 'calf';
      if (a.sex === 'female') return hasGivenBirth ? 'cow' : 'heifer';
      return a.castrated ? 'steer' : 'bull';
    case 'sheep':
      if (young(12)) return 'lamb';
      if (a.sex === 'female') return hasGivenBirth || !young(24) ? 'ewe' : 'gimmer';
      return a.castrated ? 'wether' : 'ram';
    case 'goat':
      if (young(12)) return 'kid';
      if (a.sex === 'female') return 'doe';
      return a.castrated ? 'wether' : 'buck';
    case 'pig':
      if (young(3)) return 'piglet';
      if (a.sex === 'female') return hasGivenBirth ? 'sow' : 'gilt';
      return a.castrated ? 'barrow' : 'boar';
    case 'horse':
      if (young(12)) return 'foal';
      if (a.sex === 'female') return young(48) ? 'filly' : 'mare';
      if (a.castrated) return 'gelding';
      return young(48) ? 'colt' : 'stallion';
    case 'poultry':
      if (young(4)) return 'chick';
      return a.sex === 'female' ? 'hen' : 'cockerel';
    default:
      return a.sex === 'female' ? 'female' : 'male';
  }
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400_000);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round = (x: number | null, dp = 1) => (x == null ? null : Math.round(x * 10 ** dp) / 10 ** dp);

export interface FarmGraph {
  animals: Map<number, AnimalLite>;
  childrenOf: Map<number, number[]>;
  birthsByDam: Map<number, { date: string; outcome: string; ease: string | null }[]>;
  weights: Map<number, { date: string; weightKg: number }[]>;
  /** Date of the first birth recorded on the farm — animals born before it have incomplete histories. */
  recordsStart: string | null;
}

export async function loadFarmGraph(db: DrizzleD1Database, farmId: number): Promise<FarmGraph> {
  const [rows, births, weights] = await Promise.all([
    db.select({
      id: schema.animals.id, species: schema.animals.species, tagNo: schema.animals.tagNo,
      managementTag: schema.animals.managementTag, name: schema.animals.name, sex: schema.animals.sex,
      castrated: schema.animals.castrated, breed: schema.animals.breed, dob: schema.animals.dob,
      birthYear: schema.animals.birthYear, damId: schema.animals.damId, sireId: schema.animals.sireId,
      sireName: schema.animals.sireName, status: schema.animals.status, exitDate: schema.animals.exitDate, exitReason: schema.animals.exitReason,
      salePrice: schema.animals.salePrice, saleWeightKg: schema.animals.saleWeightKg,
    }).from(schema.animals).where(eq(schema.animals.farmId, farmId)).all(),
    db.select({ damId: schema.birthRecords.damId, date: schema.birthRecords.date, outcome: schema.birthRecords.outcome, ease: schema.birthRecords.ease })
      .from(schema.birthRecords).where(eq(schema.birthRecords.farmId, farmId)).orderBy(asc(schema.birthRecords.date)).all(),
    db.select({ animalId: schema.weightRecords.animalId, date: schema.weightRecords.date, weightKg: schema.weightRecords.weightKg })
      .from(schema.weightRecords).where(eq(schema.weightRecords.farmId, farmId)).orderBy(asc(schema.weightRecords.date)).all(),
  ]);

  const animals = new Map(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<number, number[]>();
  for (const a of rows) {
    for (const p of [a.damId, a.sireId]) {
      if (p && animals.has(p)) {
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p)!.push(a.id);
      }
    }
  }
  const birthsByDam = new Map<number, { date: string; outcome: string; ease: string | null }[]>();
  for (const b of births) {
    if (!birthsByDam.has(b.damId)) birthsByDam.set(b.damId, []);
    birthsByDam.get(b.damId)!.push(b);
  }
  const weightMap = new Map<number, { date: string; weightKg: number }[]>();
  for (const w of weights) {
    if (!weightMap.has(w.animalId)) weightMap.set(w.animalId, []);
    weightMap.get(w.animalId)!.push(w);
  }
  return { animals, childrenOf, birthsByDam, weights: weightMap, recordsStart: births[0]?.date ?? null };
}

/** Reproductive + performance metrics for one animal. */
function animalMetrics(g: FarmGraph, id: number) {
  const a = g.animals.get(id)!;
  const births = g.birthsByDam.get(id) || [];
  const intervals: number[] = [];
  for (let i = 1; i < births.length; i++) {
    const d = daysBetween(births[i - 1].date, births[i].date);
    if (d > 200) intervals.push(d); // ignore same-season twins / duplicate entries
  }
  // Only trust "age at first birth" when the animal was born after record keeping began.
  const fullHistory = !!a.dob && !!g.recordsStart && a.dob >= g.recordsStart;
  const firstBirthAge = births.length && fullHistory ? daysBetween(a.dob!, births[0].date) / 30.44 : null;
  const w = g.weights.get(id) || [];
  let adg: number | null = null;
  if (w.length >= 2) {
    const days = daysBetween(w[0].date, w[w.length - 1].date);
    if (days > 0) adg = (w[w.length - 1].weightKg - w[0].weightKg) / days;
  }
  const saleAge = a.dob && a.exitDate && a.status === 'sold' ? daysBetween(a.dob, a.exitDate) / 30.44 : null;
  return {
    births: births.length,
    losses: births.filter((b) => b.outcome !== 'alive').length,
    assisted: births.filter((b) => b.ease && b.ease !== 'unassisted').length,
    intervals,
    firstBirthAge,
    adg,
    salePrice: a.status === 'sold' ? a.salePrice : null,
    saleWeight: a.status === 'sold' ? a.saleWeightKg : null,
    saleAge,
    latestWeight: w.length ? w[w.length - 1].weightKg : null,
  };
}

function aggregate(g: FarmGraph, ids: number[]) {
  const ms = ids.map((id) => animalMetrics(g, id));
  const totalBirths = ms.reduce((s, m) => s + m.births, 0);
  const sold = ms.filter((m) => m.salePrice != null);
  return {
    count: ids.length,
    active: ids.filter((id) => g.animals.get(id)!.status === 'active').length,
    females: ids.filter((id) => g.animals.get(id)!.sex === 'female').length,
    males: ids.filter((id) => g.animals.get(id)!.sex === 'male').length,
    totalBirths,
    avgCalvingIntervalDays: round(avg(ms.flatMap((m) => m.intervals)), 0),
    avgAgeFirstBirthMonths: round(avg(ms.map((m) => m.firstBirthAge).filter((x): x is number => x != null))),
    birthLossRate: totalBirths ? round((ms.reduce((s, m) => s + m.losses, 0) / totalBirths) * 100) : null,
    assistedRate: totalBirths ? round((ms.reduce((s, m) => s + m.assisted, 0) / totalBirths) * 100) : null,
    avgDailyGainKg: round(avg(ms.map((m) => m.adg).filter((x): x is number => x != null)), 2),
    avgLatestWeightKg: round(avg(ms.map((m) => m.latestWeight).filter((x): x is number => x != null)), 0),
    soldCount: sold.length,
    avgSalePrice: round(avg(sold.map((m) => m.salePrice!)), 0),
    avgSaleWeightKg: round(avg(sold.map((m) => m.saleWeight).filter((x): x is number => x != null)), 0),
    avgSaleAgeMonths: round(avg(sold.map((m) => m.saleAge).filter((x): x is number => x != null))),
    totalSales: round(sold.reduce((s, m) => s + (m.salePrice || 0), 0), 0),
  };
}

export type FamilyStats = ReturnType<typeof aggregate>;

function node(g: FarmGraph, id: number) {
  const a = g.animals.get(id)!;
  return {
    id: a.id, tagNo: a.tagNo, managementTag: a.managementTag, name: a.name, sex: a.sex, breed: a.breed,
    dob: a.dob, status: a.status,
  };
}

export function descendantIds(g: FarmGraph, id: number, maxDepth = 10): { id: number; generation: number }[] {
  const out: { id: number; generation: number }[] = [];
  const seen = new Set([id]);
  let frontier = [id];
  for (let gen = 1; gen <= maxDepth && frontier.length; gen++) {
    const next: number[] = [];
    for (const p of frontier) {
      for (const child of g.childrenOf.get(p) || []) {
        if (seen.has(child)) continue;
        seen.add(child);
        out.push({ id: child, generation: gen });
        next.push(child);
      }
    }
    frontier = next;
  }
  return out;
}

type TreeNode = ReturnType<typeof node> & { children: TreeNode[] };

function descendantTree(g: FarmGraph, id: number, depth: number, seen = new Set<number>()): TreeNode {
  seen.add(id);
  const children = depth > 0
    ? (g.childrenOf.get(id) || []).filter((c) => !seen.has(c))
      .sort((x, y) => (g.animals.get(x)!.dob || '').localeCompare(g.animals.get(y)!.dob || ''))
      .map((c) => descendantTree(g, c, depth - 1, seen))
    : [];
  return { ...node(g, id), children };
}

type PedigreeNode = (ReturnType<typeof node> & { dam: PedigreeNode | null; sire: PedigreeNode | null; sireName?: string | null }) | null;

function pedigree(g: FarmGraph, id: number | null, depth: number): PedigreeNode {
  if (!id || !g.animals.has(id)) return null;
  const a = g.animals.get(id)!;
  return {
    ...node(g, id),
    sireName: a.sireName,
    dam: depth > 0 ? pedigree(g, a.damId, depth - 1) : null,
    sire: depth > 0 ? pedigree(g, a.sireId, depth - 1) : null,
  };
}

export function familyReport(g: FarmGraph, id: number) {
  const a = g.animals.get(id)!;
  const desc = descendantIds(g, id);
  const childIds = desc.filter((d) => d.generation === 1).map((d) => d.id);
  const siblings = a.damId
    ? (g.childrenOf.get(a.damId) || []).filter((s) => s !== id && g.animals.get(s)!.damId === a.damId)
    : [];
  // Herd baseline: every animal of the same species, for "vs herd" comparisons.
  const herd = [...g.animals.values()].filter((x) => x.species === a.species).map((x) => x.id);

  // Founding dam of this animal's maternal line.
  let founder = a;
  const guard = new Set<number>();
  while (founder.damId && g.animals.has(founder.damId) && !guard.has(founder.damId)) {
    guard.add(founder.damId);
    founder = g.animals.get(founder.damId)!;
  }

  return {
    pedigree: pedigree(g, id, 3),
    descendants: descendantTree(g, id, 6),
    siblings: siblings.map((s) => node(g, s)),
    founder: founder.id !== id ? node(g, founder.id) : null,
    generations: desc.reduce((m, d) => Math.max(m, d.generation), 0),
    self: aggregate(g, [id]),
    offspring: aggregate(g, childIds),
    descendantStats: aggregate(g, desc.map((d) => d.id)),
    herd: aggregate(g, herd),
  };
}

// ---------- Family tree diagram ----------

/** What the tree diagram shows when you hover over an animal. */
function treeCard(g: FarmGraph, id: number) {
  const a = g.animals.get(id)!;
  const w = g.weights.get(id);
  const last = w?.[w.length - 1];
  const gone = a.status !== 'active' && a.exitDate;
  return {
    id: a.id, tagNo: a.tagNo, managementTag: a.managementTag, name: a.name, sex: a.sex, castrated: a.castrated,
    breed: a.breed, dob: a.dob, birthYear: a.birthYear, status: a.status, exitDate: a.exitDate, exitReason: a.exitReason,
    // Age now, or at the time it left the farm
    ageMonths: ageMonths(a.dob, a.birthYear, gone ? new Date(a.exitDate + 'T00:00:00Z') : undefined),
    latestWeightKg: last?.weightKg ?? null, latestWeightDate: last?.date ?? null,
    salePrice: a.salePrice, saleWeightKg: a.saleWeightKg, sireName: a.sireName,
    offspring: (g.childrenOf.get(id) || []).length,
  };
}

type TreeUp = { id: number | null; sireName?: string | null; dam: TreeUp | null; sire: TreeUp | null };
type TreeDown = { id: number; children: TreeDown[] };

/**
 * Ancestors `up` generations above the animal and descendants `down` generations below, as id trees plus a
 * flat map of node details. The client lays it out.
 */
export function familyTree(g: FarmGraph, id: number, up = 3, down = 6) {
  const nodes = new Map<number, ReturnType<typeof treeCard>>();
  const add = (x: number) => { if (!nodes.has(x)) nodes.set(x, treeCard(g, x)); };
  const ancestors = (x: number | null, depth: number, seen: Set<number>): TreeUp | null => {
    if (!x || !g.animals.has(x) || seen.has(x)) return null;
    add(x);
    const a = g.animals.get(x)!;
    const next = new Set(seen).add(x);
    return {
      id: x, sireName: a.sireName,
      dam: depth > 0 ? ancestors(a.damId, depth - 1, next) : null,
      sire: depth > 0 ? ancestors(a.sireId, depth - 1, next) : null,
    };
  };
  const seen = new Set<number>([id]);
  const descendants = (x: number, depth: number): TreeDown => {
    add(x);
    const kids = depth > 0
      ? (g.childrenOf.get(x) || []).filter((c) => !seen.has(c))
        .sort((p, q) => (g.animals.get(p)!.dob || '').localeCompare(g.animals.get(q)!.dob || ''))
      : [];
    kids.forEach((c) => seen.add(c));
    return { id: x, children: kids.map((c) => descendants(c, depth - 1)) };
  };
  return { rootId: id, up: ancestors(id, up, new Set()), down: descendants(id, down), nodes: Object.fromEntries(nodes) };
}

/** Maternal families: founding females (no dam recorded on farm) ranked by descendants. */
export function families(g: FarmGraph, species?: string) {
  const founders = [...g.animals.values()].filter((a) =>
    a.sex === 'female' && (!a.damId || !g.animals.has(a.damId)) && (!species || a.species === species));
  return founders.map((f) => {
    const desc = descendantIds(g, f.id);
    const ids = [f.id, ...desc.map((d) => d.id)];
    return {
      founder: node(g, f.id),
      descendants: desc.length,
      generations: desc.reduce((m, d) => Math.max(m, d.generation), 0),
      stats: aggregate(g, ids),
    };
  }).sort((x, y) => y.descendants - x.descendants || x.founder.tagNo.localeCompare(y.founder.tagNo));
}

export async function animalInFarm(db: DrizzleD1Database, farmId: number, id: number) {
  return db.select().from(schema.animals).where(and(eq(schema.animals.id, id), eq(schema.animals.farmId, farmId))).get();
}
