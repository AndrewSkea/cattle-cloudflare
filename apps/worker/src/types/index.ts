/**
 * Shared TypeScript types for Cloudflare Worker
 */

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
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
