/**
 * Shared TypeScript types for Cloudflare Worker
 */

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
}

export interface AuthUser {
  userId: number;
  email: string;
  activeFarmId: number | null;
  role: string | null;
}

export interface UploadStats {
  cattleAdded: number;
  cattleSkipped: number;
  cattleUpdated: number;
  maternalLinks: number;
  calvingsAdded: number;
  servicesAdded: number;
  salesAdded: number;
  healthAdded: number;
  errors: string[];
}

export interface FamilyTreeNode {
  generation: number;
  cattle: any;
  descendants?: FamilyTreeNode[];
}

export interface BreedingScore {
  cattleId: number;
  score: number;
  offspringCount: number;
  retentionRate: number;
  revenue: number;
  age: number;
  bloodlineStrength: number;
}
