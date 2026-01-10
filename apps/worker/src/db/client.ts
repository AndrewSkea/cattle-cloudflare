/**
 * Database client utilities for D1
 */

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type DrizzleD1Database = ReturnType<typeof drizzle<typeof schema>>;

export function getDrizzleClient(d1: D1Database) {
  return drizzle(d1, { schema });
}
