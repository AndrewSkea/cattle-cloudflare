/**
 * DVSA MOT History API — https://documentation.history.mot.api.gov.uk/
 *
 * OAuth2 client credentials (Microsoft Entra) for a bearer token, plus an X-API-Key on every call.
 * Returns make, model, dates, colour, fuel and MOT history for a UK registration. Vehicles that never need an
 * MOT (most tractors on agricultural use, trailers) usually aren't listed, so a miss is not an error.
 * Env: DVSA_CLIENT_ID, DVSA_CLIENT_SECRET, DVSA_API_KEY, DVSA_SCOPE, DVSA_TOKEN_URL (all secrets).
 */

import type { Env } from '../lib/context';

const API = 'https://history.mot.api.gov.uk/v1/trade/vehicles/registration/';

export class DvsaError extends Error {
  constructor(message: string, public status: 404 | 422 = 422) { super(message); }
}

export interface VehicleLookup {
  registration: string;
  make: string | null;
  model: string | null;
  year: number | null;
  firstUsedDate: string | null;
  fuelType: string | null;
  colour: string | null;
  engineSize: string | null;
  motDue: string | null; // expiry of the latest pass, or the first-MOT due date for a new vehicle
  lastMotResult: string | null;
  lastMotDate: string | null;
  odometer: string | null; // e.g. "43244 mi" from the latest test
  outstandingRecall: string | null; // Yes | No | Unknown
}

export function dvsaAvailable(env: Env): boolean {
  return !!(env.DVSA_CLIENT_ID && env.DVSA_CLIENT_SECRET && env.DVSA_API_KEY && env.DVSA_SCOPE && env.DVSA_TOKEN_URL);
}

export function normaliseReg(reg: string): string {
  return reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Tokens last about an hour; keep one per isolate.
let cached: { token: string; expires: number } | null = null;

async function token(env: Env): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetch(env.DVSA_TOKEN_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: env.DVSA_CLIENT_ID!, client_secret: env.DVSA_CLIENT_SECRET!, scope: env.DVSA_SCOPE!,
    }),
  });
  const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new DvsaError('Could not sign in to the DVSA vehicle lookup');
  cached = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function lookupVehicle(env: Env, rawReg: string): Promise<VehicleLookup> {
  if (!dvsaAvailable(env)) throw new DvsaError('Registration lookup isn’t set up');
  const reg = normaliseReg(rawReg);
  if (reg.length < 2 || reg.length > 8) throw new DvsaError('That doesn’t look like a UK registration', 422);

  const call = async () => fetch(API + encodeURIComponent(reg), {
    headers: { Authorization: `Bearer ${await token(env)}`, 'X-API-Key': env.DVSA_API_KEY!, Accept: 'application/json' },
  });
  let res = await call();
  if (res.status === 401) { cached = null; res = await call(); }
  if (res.status === 404) {
    throw new DvsaError(`No DVSA record for ${reg}. Tractors and other MOT-exempt vehicles usually aren’t listed.`, 404);
  }
  if (res.status === 400) throw new DvsaError('That doesn’t look like a UK registration', 422);
  if (!res.ok) throw new DvsaError(`DVSA lookup failed (${res.status})`);

  const v = await res.json() as any;
  const tests: any[] = Array.isArray(v.motTests) ? v.motTests : [];
  const latest = tests[0];
  const lastPass = tests.find((t) => t.testResult === 'PASSED' && t.expiryDate);
  const first = v.firstUsedDate || v.registrationDate || v.manufactureDate || null;
  const titled = (s?: string | null) => s ? s.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase()) : null;
  return {
    registration: v.registration ?? reg,
    make: titled(v.make),
    model: v.model ?? null,
    year: first ? Number(first.slice(0, 4)) : null,
    firstUsedDate: first,
    fuelType: v.fuelType ?? null,
    colour: v.primaryColour ?? null,
    engineSize: v.engineSize ?? null,
    motDue: lastPass?.expiryDate ?? v.motTestDueDate ?? null,
    lastMotResult: latest?.testResult ?? null,
    lastMotDate: latest?.completedDate?.slice(0, 10) ?? null,
    odometer: latest?.odometerValue ? `${latest.odometerValue} ${String(latest.odometerUnit ?? '').toLowerCase()}`.trim() : null,
    outstandingRecall: v.hasOutstandingRecall ?? null,
  };
}
