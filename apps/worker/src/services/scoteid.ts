/**
 * ScotEID web services (SOAP, document style) — https://api.scoteid.com/api?wsdl, guide v1.7.13.
 *
 * Authentication is HTTP basic with the keeper's ScotEID username/password, plus a vendor ApplicationKey that
 * ScotEID issues to approved software (env SCOTEID_APP_KEY). Without the key the integration stays dormant.
 * Read-only for now: holdings, cattle on the holding and the holding's event history.
 */

import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';
import type { Env } from '../lib/context';
import { normaliseTag } from './compliance';

const NS = 'http://api.scoteid.com/api/';
const SCHEMA_VERSION = '1.7.12';
export const SCOTEID_PROVIDER = 'scoteid';

export interface ScotEIDCreds { username: string; password: string }

export class ScotEIDError extends Error {
  constructor(message: string, public auth = false) { super(message); }
}

export function scoteidAvailable(env: Env): boolean {
  return !!env.SCOTEID_APP_KEY;
}

function esc(s: string) {
  return s.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]!));
}

function envelope(env: Env, op: string, inner: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="${NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <api:${op}Request>
      <ApplicationName>HoovesWho</ApplicationName>
      <ApplicationVersion>2.0</ApplicationVersion>
      <ApplicationKey>${esc(env.SCOTEID_APP_KEY || '')}</ApplicationKey>
      <SchemaVersion>${SCHEMA_VERSION}</SchemaVersion>
      <Timestamp>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</Timestamp>${inner}
    </api:${op}Request>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function call(env: Env, creds: ScotEIDCreds, op: string, inner = ''): Promise<string> {
  const endpoint = env.SCOTEID_ENDPOINT || 'https://api.scoteid.com/api/';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${NS}${op}"`,
      Authorization: `Basic ${btoa(`${creds.username}:${creds.password}`)}`,
    },
    body: envelope(env, op, inner),
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new ScotEIDError('ScotEID rejected the username or password', true);
  const fault = text.match(/<(?:\w+:)?ErrorDescription>([\s\S]*?)<\/(?:\w+:)?ErrorDescription>/)?.[1]
    ?? text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/)?.[1];
  if (fault) throw new ScotEIDError(`ScotEID: ${fault.trim()}`, /security|auth|permission/i.test(text));
  if (!res.ok) throw new ScotEIDError(`ScotEID returned HTTP ${res.status}`);
  return text;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function child(xml: string, name: string): string | null {
  return xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1]?.trim() ?? null;
}

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);

export interface ScotEIDAnimal {
  tag: string; sex: string | null; dob: string | null; breedCode: string | null; damTag: string | null; sireTag: string | null;
  birthCph: string | null; currentCph: string | null; dateOnMainCph: string | null;
}

export interface ScotEIDEvent { tag: string; eventType: number; date: string; notificationDate: string | null; cph: string | null; otherCph: string | null }

export async function getHoldings(env: Env, creds: ScotEIDCreds) {
  const xml = await call(env, creds, 'SMGetCattleHoldings');
  return [...xml.matchAll(/<(?:\w+:)?Holding\s([^>]*?)\/?>/g)].map((m) => {
    const a = attrs(m[1]);
    return { cph: a.CPH, mainCph: a.MainCPH, startDate: day(a.StartDate), endDate: day(a.EndDate) };
  });
}

export async function getCattleOnHoldings(env: Env, creds: ScotEIDCreds): Promise<ScotEIDAnimal[]> {
  const xml = await call(env, creds, 'SMGetCattleOnHoldings');
  return [...xml.matchAll(/<(?:\w+:)?Animal\s([^>]*?)\/?>/g)].map((m) => {
    const a = attrs(m[1]);
    return {
      tag: normaliseTag(a.AnimalID || ''), sex: a.Sex ? a.Sex.toLowerCase() : null, dob: day(a.DOB), breedCode: a.BreedCode || null,
      damTag: a.GeneticDamID || a.DamID ? normaliseTag(a.GeneticDamID || a.DamID) : null, sireTag: a.SireID ? normaliseTag(a.SireID) : null,
      birthCph: a.BirthCPH || null, currentCph: a.CurrentCPH || null, dateOnMainCph: day(a.DateOnMainCPH),
    };
  }).filter((a) => a.tag);
}

/** Births, moves and deaths recorded against the holding (synchronous calls return at most two years). */
export async function getEventHistory(env: Env, creds: ScotEIDCreds, mainCph: string, start: string, stop: string): Promise<ScotEIDEvent[]> {
  const xml = await call(env, creds, 'GetCPHCattleEventHistory',
    `\n      <MainCPH>${esc(mainCph)}</MainCPH>\n      <StartDate>${start}</StartDate>\n      <StopDate>${stop}</StopDate>`);
  const out: ScotEIDEvent[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?Events>([\s\S]*?)<\/(?:\w+:)?Events>/g)) {
    const e = m[1];
    const tag = child(e, 'AnimalID');
    const type = child(e, 'EventType');
    const date = day(child(e, 'Date'));
    if (!tag || type == null || !date) continue;
    out.push({
      tag: normaliseTag(tag), eventType: Number(type), date, notificationDate: day(child(e, 'NotificationDate')),
      cph: child(e, 'CPH'), otherCph: child(e, 'AdvisedDepartureCPH') || child(e, 'AdvisedDestinationCPH'),
    });
  }
  return out;
}

export const EVENT_LABELS: Record<number, string> = {
  0: 'Birth', 1: 'Import', 2: 'Moved on', 3: 'Moved off', 5: 'Re-import', 7: 'Death', 10: 'Placement', 11: 'Displacement',
  12: 'Inferred on', 22: 'Summary on', 23: 'Summary off', 32: 'Determined on',
};

/** Pulls the holding's cattle and two years of events into the local snapshot tables. */
export async function syncScotEID(db: DrizzleD1Database, env: Env, farmId: number, creds: ScotEIDCreds, mainCph: string) {
  const stop = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 729 * 86_400_000).toISOString().slice(0, 10);
  const [animals, events] = await Promise.all([getCattleOnHoldings(env, creds), getEventHistory(env, creds, mainCph, start, stop)]);
  const syncedAt = new Date().toISOString();
  const stmts: any[] = [
    db.delete(schema.scoteidAnimals).where(eq(schema.scoteidAnimals.farmId, farmId)),
    db.delete(schema.scoteidEvents).where(eq(schema.scoteidEvents.farmId, farmId)),
  ];
  for (let i = 0; i < animals.length; i += 8) {
    stmts.push(db.insert(schema.scoteidAnimals).values(animals.slice(i, i + 8).map((a) => ({ ...a, farmId, syncedAt }))).onConflictDoNothing());
  }
  for (let i = 0; i < events.length; i += 10) {
    stmts.push(db.insert(schema.scoteidEvents).values(events.slice(i, i + 10).map((e) => ({ ...e, farmId, syncedAt }))).onConflictDoNothing());
  }
  await db.batch(stmts as [any, ...any[]]);
  return { animals: animals.length, events: events.length };
}
