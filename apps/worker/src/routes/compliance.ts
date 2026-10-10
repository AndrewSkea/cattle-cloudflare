/**
 * Traceability: reporting deadlines, ear tag checks, the holding register, and the ScotEID connection.
 */

import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, type Ctx, HttpError, body, farmSession, logActivity, now, requireAccess, requireRole, today } from '../lib/context';
import { decryptJson, encryptJson } from '../lib/crypto';
import { deadlines, displayTag, holdingRegister, normaliseTag, tagIssues } from '../services/compliance';
import { breedName } from '../services/mart/orkney';
import {
  EVENT_LABELS, SCOTEID_PROVIDER, type ScotEIDCreds, ScotEIDError, getHoldings, scoteidAvailable, syncScotEID,
} from '../services/scoteid';

export const compliance = new Hono<AppEnv>();
compliance.use('*', requireAccess('viewer', 'manager'));

compliance.get('/deadlines', async (c) => {
  const s = farmSession(c);
  return c.json({ data: await deadlines(c.get('db'), s.farmId) });
});

compliance.get('/tags', async (c) => {
  const s = farmSession(c);
  return c.json({ data: await tagIssues(c.get('db'), s.farmId) });
});

function year(c: Ctx) {
  const y = Number(c.req.query('year') || today().slice(0, 4));
  if (!Number.isInteger(y) || y < 1990 || y > 2100) throw new HttpError(400, 'Invalid year');
  return y;
}

compliance.get('/register', async (c) => {
  const s = farmSession(c);
  return c.json({ data: await holdingRegister(c.get('db'), s.farmId, year(c)) });
});

compliance.get('/register.csv', async (c) => {
  const s = farmSession(c);
  const y = year(c);
  const rows = await holdingRegister(c.get('db'), s.farmId, y);
  const farm = await c.get('db').select({ name: schema.farms.name, cph: schema.farms.holdingNumber }).from(schema.farms).where(eq(schema.farms.id, s.farmId)).get();
  const esc = (v: unknown) => {
    const str = v == null ? '' : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = ['Ear tag', 'Management tag', 'Sex', 'Breed', 'Date of birth', 'Dam ear tag', 'Date on holding', 'Arrived from', 'Date off holding', 'Moved to / reason'];
  const lines = [
    `Holding register ${y}${farm?.name ? ` — ${farm.name}` : ''}${farm?.cph ? ` (CPH ${farm.cph})` : ''}`,
    head.join(','),
    ...rows.map((r) => [displayTag(r.tagNo), r.managementTag, r.sex, r.breed, r.dob, r.damTag ? displayTag(r.damTag) : '', r.dateOn, r.onFrom, r.dateOff, r.offTo].map(esc).join(',')),
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="holding-register-${y}.csv"` },
  });
});

// ---------------- ScotEID ----------------

export const scoteid = new Hono<AppEnv>();
scoteid.use('*', requireAccess('viewer', 'manager'));

interface ScotEIDConfig { mainCph?: string; username?: string; holdings?: { cph: string; mainCph: string }[] }

async function integration(c: Ctx, farmId: number) {
  return c.get('db').select().from(schema.farmIntegrations)
    .where(and(eq(schema.farmIntegrations.farmId, farmId), eq(schema.farmIntegrations.provider, SCOTEID_PROVIDER))).get();
}

const config = (row: { config: string } | undefined): ScotEIDConfig => {
  try { return JSON.parse(row?.config || '{}'); } catch { return {}; }
};

scoteid.get('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const row = await integration(c, s.farmId);
  const cfg = config(row);
  const [animals, events] = await Promise.all([
    db.$count(schema.scoteidAnimals, eq(schema.scoteidAnimals.farmId, s.farmId)),
    db.$count(schema.scoteidEvents, eq(schema.scoteidEvents.farmId, s.farmId)),
  ]);
  return c.json({ data: {
    available: scoteidAvailable(c.env),
    connected: !!row?.secret,
    mainCph: cfg.mainCph ?? null,
    username: cfg.username ?? null,
    holdings: cfg.holdings ?? [],
    lastSyncAt: row?.lastSyncAt ?? null,
    lastError: row?.lastError ?? null,
    animals, events,
  } });
});

const cph = z.string().trim().regex(/^\d{2}\/\d{3}\/\d{4}$/, 'should look like 85/123/4567');

scoteid.put('/credentials', requireRole('owner'), async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  if (!scoteidAvailable(c.env)) throw new HttpError(422, 'The ScotEID connection is not switched on yet');
  const data = await body(c, z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200), mainCph: cph }));
  const creds: ScotEIDCreds = { username: data.username, password: data.password };
  let holdings;
  try {
    holdings = await getHoldings(c.env, creds);
  } catch (e) {
    throw new HttpError(422, e instanceof ScotEIDError ? e.message : 'Could not reach ScotEID');
  }
  const cfg = JSON.stringify({ mainCph: data.mainCph, username: data.username, holdings });
  const secret = await encryptJson(c.env.JWT_SECRET, creds);
  const row = await integration(c, s.farmId);
  if (row) await db.update(schema.farmIntegrations).set({ config: cfg, secret, status: 'active', lastError: null, updatedAt: now() }).where(eq(schema.farmIntegrations.id, row.id));
  else await db.insert(schema.farmIntegrations).values({ farmId: s.farmId, provider: SCOTEID_PROVIDER, config: cfg, secret });
  if (!(await db.select({ cph: schema.farms.holdingNumber }).from(schema.farms).where(eq(schema.farms.id, s.farmId)).get())?.cph) {
    await db.update(schema.farms).set({ holdingNumber: data.mainCph, updatedAt: now() }).where(eq(schema.farms.id, s.farmId));
  }
  await logActivity(c, 'connected', 'scoteid', null, `Connected ScotEID for holding ${data.mainCph}`);
  return c.json({ data: { holdings } });
});

scoteid.delete('/credentials', requireRole('owner'), async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  await db.delete(schema.farmIntegrations).where(and(eq(schema.farmIntegrations.farmId, s.farmId), eq(schema.farmIntegrations.provider, SCOTEID_PROVIDER)));
  await db.delete(schema.scoteidAnimals).where(eq(schema.scoteidAnimals.farmId, s.farmId));
  await db.delete(schema.scoteidEvents).where(eq(schema.scoteidEvents.farmId, s.farmId));
  await logActivity(c, 'disconnected', 'scoteid', null, 'Disconnected ScotEID');
  return c.json({ ok: true });
});

scoteid.post('/sync', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const row = await integration(c, s.farmId);
  const cfg = config(row);
  if (!row?.secret || !cfg.mainCph) throw new HttpError(422, 'Connect ScotEID first');
  if (!scoteidAvailable(c.env)) throw new HttpError(422, 'The ScotEID connection is not switched on yet');
  try {
    const creds = await decryptJson<ScotEIDCreds>(c.env.JWT_SECRET, row.secret);
    const result = await syncScotEID(db, c.env, s.farmId, creds, cfg.mainCph);
    await db.update(schema.farmIntegrations).set({ lastSyncAt: now(), lastError: null, status: 'active' }).where(eq(schema.farmIntegrations.id, row.id));
    await logActivity(c, 'synced', 'scoteid', null, `Synced ScotEID: ${result.animals} cattle, ${result.events} events`);
    return c.json({ data: result });
  } catch (e) {
    const msg = e instanceof ScotEIDError ? e.message : 'Could not reach ScotEID';
    await db.update(schema.farmIntegrations).set({ lastError: msg, status: 'error' }).where(eq(schema.farmIntegrations.id, row.id));
    throw new HttpError(422, msg);
  }
});

/** Compares the farm's cattle with what ScotEID holds for the holding. */
scoteid.get('/reconcile', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const [remote, events, local] = await Promise.all([
    db.select().from(schema.scoteidAnimals).where(eq(schema.scoteidAnimals.farmId, s.farmId)).all(),
    db.select().from(schema.scoteidEvents).where(eq(schema.scoteidEvents.farmId, s.farmId)).all(),
    db.select().from(schema.animals).where(and(eq(schema.animals.farmId, s.farmId), eq(schema.animals.species, 'cattle'))).all(),
  ]);
  const byTag = new Map(local.map((a) => [normaliseTag(a.tagNo), a]));
  const byId = new Map(local.map((a) => [a.id, a]));
  const remoteTags = new Set(remote.map((r) => r.tag));
  const onlyScotEID = remote.filter((r) => !byTag.has(r.tag)).map((r) => ({ ...r, breed: breedName(r.breedCode) }));
  const onlyHere = local.filter((a) => a.status === 'active' && !remoteTags.has(normaliseTag(a.tagNo)))
    .map((a) => ({ animalId: a.id, tagNo: a.tagNo, managementTag: a.managementTag, dob: a.dob, sex: a.sex }));
  const stillOnHolding = local.filter((a) => a.status !== 'active' && remoteTags.has(normaliseTag(a.tagNo)))
    .map((a) => ({ animalId: a.id, tagNo: a.tagNo, managementTag: a.managementTag, status: a.status, exitDate: a.exitDate }));
  const differences: { animalId: number; tagNo: string; field: string; here: string | null; scoteid: string | null }[] = [];
  for (const r of remote) {
    const a = byTag.get(r.tag);
    if (!a) continue;
    if (r.dob && a.dob && r.dob !== a.dob) differences.push({ animalId: a.id, tagNo: a.tagNo, field: 'Date of birth', here: a.dob, scoteid: r.dob });
    if (r.sex && r.sex !== a.sex) differences.push({ animalId: a.id, tagNo: a.tagNo, field: 'Sex', here: a.sex, scoteid: r.sex });
    const damTag = a.damId ? byId.get(a.damId)?.tagNo : null;
    if (r.damTag && damTag && normaliseTag(damTag) !== r.damTag) differences.push({ animalId: a.id, tagNo: a.tagNo, field: 'Dam', here: damTag, scoteid: displayTag(r.damTag) });
    if (r.damTag && !a.damId && byTag.has(r.damTag)) differences.push({ animalId: a.id, tagNo: a.tagNo, field: 'Dam', here: null, scoteid: displayTag(r.damTag) });
  }
  return c.json({ data: {
    onlyScotEID, onlyHere, stillOnHolding, differences,
    events: events.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 300).map((e) => ({
      ...e, label: EVENT_LABELS[e.eventType] ?? `Event ${e.eventType}`, animalId: byTag.get(e.tag)?.id ?? null,
    })),
  } });
});

/** Creates animals for cattle that ScotEID has on the holding but this farm hasn't recorded. */
scoteid.post('/import', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const { tags } = await body(c, z.object({ tags: z.array(z.string()).min(1).max(500) }));
  const wanted = new Set(tags.map(normaliseTag));
  const remote = (await db.select().from(schema.scoteidAnimals).where(eq(schema.scoteidAnimals.farmId, s.farmId)).all()).filter((r) => wanted.has(r.tag));
  const local = await db.select({ id: schema.animals.id, tagNo: schema.animals.tagNo }).from(schema.animals).where(eq(schema.animals.farmId, s.farmId)).all();
  const byTag = new Map(local.map((a) => [normaliseTag(a.tagNo), a.id]));
  const created: string[] = [];
  // Dams first so calves can link to them.
  remote.sort((x, y) => (x.dob ?? '').localeCompare(y.dob ?? ''));
  for (const r of remote) {
    if (byTag.has(r.tag)) continue;
    const breed = breedName(r.breedCode);
    const [a] = await db.insert(schema.animals).values({
      farmId: s.farmId, species: 'cattle', tagNo: displayTag(r.tag), sex: r.sex === 'male' ? 'male' : 'female',
      breed: breed ? breed.replace(/\b\w/g, (ch) => ch.toUpperCase()) : r.breedCode, dob: r.dob,
      birthYear: r.dob ? Number(r.dob.slice(0, 4)) : null, damId: r.damTag ? byTag.get(r.damTag) ?? null : null,
      origin: r.birthCph && r.currentCph && r.birthCph === r.currentCph ? 'born' : 'purchased',
      purchaseDate: r.birthCph && r.birthCph !== r.currentCph ? r.dateOnMainCph : null,
      notes: 'Imported from ScotEID',
    }).returning({ id: schema.animals.id });
    byTag.set(r.tag, a.id);
    created.push(displayTag(r.tag));
  }
  if (created.length) await logActivity(c, 'imported', 'animal', null, `Imported ${created.length} cattle from ScotEID`);
  return c.json({ data: { created: created.length } });
});

// ---------------- Local development: a fake ScotEID so the flow can be exercised end to end ----------------

export const scoteidMock = new Hono<AppEnv>();

scoteidMock.post('/', async (c) => {
  if (c.env.ENVIRONMENT === 'production') return c.notFound();
  const action = (c.req.header('SOAPAction') || '').replace(/"/g, '').split('/').pop();
  const auth = c.req.header('Authorization') || '';
  const user = auth.startsWith('Basic ') ? atob(auth.slice(6)).split(':') : [];
  const reqBody = await c.req.text();
  const xml = (inner: string) => c.body(`<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://api.scoteid.com/api/"><SOAP-ENV:Body>${inner}</SOAP-ENV:Body></SOAP-ENV:Envelope>`, 200, { 'Content-Type': 'text/xml' });
  if (user[1] !== 'demo-password' || !/<ApplicationKey>.+<\/ApplicationKey>/.test(reqBody)) {
    return xml('<SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode><faultstring>SecurityFault</faultstring><detail><ns1:SecurityFault><ErrorDescription>Invalid username or password</ErrorDescription></ns1:SecurityFault></detail></SOAP-ENV:Fault>');
  }
  const ts = new Date().toISOString();
  if (action === 'SMGetCattleHoldings') {
    return xml(`<ns1:SMGetCattleHoldingsResponse><Timestamp>${ts}</Timestamp><Holdings><Holding CPH="85/123/4567" MainCPH="85/123/4567" StartDate="2020-01-01Z"/></Holdings></ns1:SMGetCattleHoldingsResponse>`);
  }
  // Mirror the first farm's active cattle, with one DOB disagreement, one missing animal and one extra.
  const rows = await c.get('db').select().from(schema.animals).where(and(eq(schema.animals.farmId, 1), eq(schema.animals.status, 'active'), eq(schema.animals.species, 'cattle'))).all();
  const shown = rows.filter((a) => /^UK\d{12}$/.test(normaliseTag(a.tagNo))).slice(1);
  if (action === 'SMGetCattleOnHoldings') {
    const animals = shown.map((a, i) => `<Animal AnimalID="${normaliseTag(a.tagNo)}" InitialCPH="85/123/4567" CurrentCPH="85/123/4567" Sex="${a.sex === 'male' ? 'Male' : 'Female'}" DOB="${i === 0 && a.dob ? '2001-01-01' : a.dob ?? ''}" BirthCPH="85/123/4567" BreedCode="LIMX"/>`).join('');
    return xml(`<ns1:SMGetCattleOnHoldingsResponse><Timestamp>${ts}</Timestamp><Animals>${animals}<Animal AnimalID="UK523801600001" InitialCPH="85/123/4567" CurrentCPH="85/123/4567" Sex="Female" DOB="2026-04-02" BirthCPH="85/123/4567" BreedCode="AAX"/></Animals></ns1:SMGetCattleOnHoldingsResponse>`);
  }
  if (action === 'GetCPHCattleEventHistory') {
    const events = shown.slice(0, 5).map((a) => `<Events><CPH>85/123/4567</CPH><Date>${a.dob ?? '2024-01-01'}</Date><NotificationDate>${a.dob ?? '2024-01-01'}</NotificationDate><EventType>0</EventType><AnimalID>${normaliseTag(a.tagNo)}</AnimalID></Events>`).join('');
    return xml(`<ns1:GetCPHCattleEventHistoryResponse><Timestamp>${ts}</Timestamp><MainCPH>85/123/4567</MainCPH><CattleEvents>${events}</CattleEvents></ns1:GetCPHCattleEventHistoryResponse>`);
  }
  return xml(`<SOAP-ENV:Fault><faultstring>Unknown operation ${action}</faultstring></SOAP-ENV:Fault>`);
});
