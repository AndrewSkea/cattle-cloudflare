/**
 * Family Service - Maternal Lineage and Descendant Calculations
 *
 * Matches Python implementation from family_service.py
 * Handles recursive queries with circular reference protection
 */

import { eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';
import type { FamilyTreeNode } from '../types';

export class FamilyService {
  private db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  // ==================== MATERNAL LINEAGE (ANCESTORS) ====================

  /**
   * Get maternal lineage (ancestors) up to maxGenerations
   * Matches Python: get_maternal_lineage()
   */
  async getMaternalLineage(cattleId: number, maxGenerations: number = 5): Promise<FamilyTreeNode[]> {
    const lineage: FamilyTreeNode[] = [];
    let currentId: number | null = cattleId;
    let generation = 0;
    const visited = new Set<number>();

    while (currentId && generation < maxGenerations) {
      // Prevent circular references
      if (visited.has(currentId)) {
        console.warn(`Circular reference detected at cattle ID ${currentId}`);
        break;
      }
      visited.add(currentId);

      // Fetch cattle with dam relationship
      const cattle = await this.db.query.cattle.findFirst({
        where: eq(schema.cattle.id, currentId),
        with: {
          dam: true,
        },
      });

      if (!cattle || !cattle.dam) {
        break;
      }

      lineage.push({
        generation: generation + 1,
        cattle: cattle.dam,
      });

      currentId = cattle.dam.damTag;
      generation++;
    }

    return lineage;
  }

  // ==================== DESCENDANTS (OFFSPRING TREE) ====================

  /**
   * Get all descendants up to maxGenerations
   * Matches Python: get_all_descendants()
   */
  async getAllDescendants(cattleId: number, maxGenerations: number = 10): Promise<FamilyTreeNode[]> {
    return this._getDescendantsRecursive(cattleId, 1, maxGenerations, new Set());
  }

  private async _getDescendantsRecursive(
    parentId: number,
    currentGen: number,
    maxGen: number,
    visited: Set<number>
  ): Promise<FamilyTreeNode[]> {
    // Base cases
    if (currentGen > maxGen) return [];
    if (visited.has(parentId)) {
      console.warn(`Circular reference detected at cattle ID ${parentId}`);
      return [];
    }

    visited.add(parentId);

    // Get direct offspring
    const offspring = await this.db.query.cattle.findMany({
      where: eq(schema.cattle.damTag, parentId),
    });

    const result: FamilyTreeNode[] = [];

    for (const child of offspring) {
      // Clone visited set for this branch to allow siblings to share ancestors
      const branchVisited = new Set(visited);

      const childDescendants = await this._getDescendantsRecursive(
        child.id,
        currentGen + 1,
        maxGen,
        branchVisited
      );

      result.push({
        generation: currentGen,
        cattle: child,
        descendants: childDescendants,
      });
    }

    return result;
  }

  // ==================== DESCENDANT COUNT (OPTIMIZED) ====================

  /**
   * Count total descendants without building full tree
   * Matches Python: get_descendant_count()
   */
  async getDescendantCount(cattleId: number, maxGenerations: number = 10): Promise<number> {
    return this._countDescendantsRecursive(cattleId, 1, maxGenerations, new Set());
  }

  private async _countDescendantsRecursive(
    parentId: number,
    currentGen: number,
    maxGen: number,
    visited: Set<number>
  ): Promise<number> {
    if (currentGen > maxGen) return 0;
    if (visited.has(parentId)) return 0;

    visited.add(parentId);

    const offspring = await this.db.query.cattle.findMany({
      where: eq(schema.cattle.damTag, parentId),
      columns: { id: true }, // Only fetch ID for performance
    });

    let count = offspring.length;

    for (const child of offspring) {
      const branchVisited = new Set(visited);
      count += await this._countDescendantsRecursive(
        child.id,
        currentGen + 1,
        maxGen,
        branchVisited
      );
    }

    return count;
  }

  // ==================== FAMILY OVERVIEW ====================

  /**
   * Get family overview with siblings, offspring, and generation depth
   * Matches Python: get_family_overview()
   */
  async getFamilyOverview(cattleId: number) {
    const cattle = await this.db.query.cattle.findFirst({
      where: eq(schema.cattle.id, cattleId),
      with: {
        dam: true,
        offspring: true,
      },
    });

    if (!cattle) {
      throw new Error(`Cattle not found: ${cattleId}`);
    }

    // Get siblings (same mother)
    let siblings = [];
    if (cattle.damTag) {
      siblings = await this.db.query.cattle.findMany({
        where: eq(schema.cattle.damTag, cattle.damTag),
      });
      // Exclude self from siblings
      siblings = siblings.filter(s => s.id !== cattleId);
    }

    // Get descendant count
    const descendantCount = await this.getDescendantCount(cattleId);

    // Get generation depth (how many generations from foundation)
    const lineage = await this.getMaternalLineage(cattleId, 10);
    const generationDepth = lineage.length;

    return {
      cattle,
      siblings,
      offspringCount: cattle.offspring.length,
      descendantCount,
      generationDepth,
    };
  }

  // ==================== FOUNDATION MOTHERS ====================

  /**
   * Get foundation mothers (no dam but have offspring)
   * Matches Python: get_foundation_mothers()
   */
  async getFoundationMothers() {
    // Get all cattle with no dam
    const allCattle = await this.db.query.cattle.findMany({
      where: isNull(schema.cattle.damTag),
    });

    const foundationMothers = [];

    for (const cattle of allCattle) {
      // Check if this cattle has offspring
      const offspring = await this.db.query.cattle.findMany({
        where: eq(schema.cattle.damTag, cattle.id),
        columns: { id: true },
      });

      if (offspring.length > 0) {
        // Get full descendant count
        const descendantCount = await this.getDescendantCount(cattle.id);

        foundationMothers.push({
          cattle,
          offspringCount: offspring.length,
          descendantCount,
        });
      }
    }

    // Sort by descendant count (largest families first)
    foundationMothers.sort((a, b) => b.descendantCount - a.descendantCount);

    return foundationMothers;
  }

  // ==================== SIBLINGS ====================

  /**
   * Get siblings (cattle with same mother)
   * Matches Python: get_siblings()
   */
  async getSiblings(cattleId: number) {
    const cattle = await this.db.query.cattle.findFirst({
      where: eq(schema.cattle.id, cattleId),
      columns: { damTag: true },
    });

    if (!cattle || !cattle.damTag) {
      return [];
    }

    const siblings = await this.db.query.cattle.findMany({
      where: eq(schema.cattle.damTag, cattle.damTag),
    });

    // Exclude self from siblings
    return siblings.filter(s => s.id !== cattleId);
  }

  // ==================== FULL FAMILY TREE ====================

  /**
   * Get both ancestors and descendants in a single call
   * Matches Python: get_full_family_tree()
   */
  async getFullFamilyTree(cattleId: number, ancestorGens: number = 5, descendantGens: number = 10) {
    const [ancestors, descendants] = await Promise.all([
      this.getMaternalLineage(cattleId, ancestorGens),
      this.getAllDescendants(cattleId, descendantGens),
    ]);

    return {
      ancestors,
      descendants,
    };
  }

  // ==================== FAMILY SIZE STATS ====================

  /**
   * Get detailed family size statistics
   * Matches Python: get_family_size_stats()
   */
  async getFamilySizeStats(cattleId: number) {
    const cattle = await this.db.query.cattle.findFirst({
      where: eq(schema.cattle.id, cattleId),
      with: {
        offspring: true,
      },
    });

    if (!cattle) {
      throw new Error(`Cattle not found: ${cattleId}`);
    }

    // Direct offspring
    const directOffspring = cattle.offspring.length;

    // Grandchildren (offspring of offspring)
    let grandchildrenCount = 0;
    for (const child of cattle.offspring) {
      const childOffspring = await this.db.query.cattle.findMany({
        where: eq(schema.cattle.damTag, child.id),
        columns: { id: true },
      });
      grandchildrenCount += childOffspring.length;
    }

    // Total descendants
    const totalDescendants = await this.getDescendantCount(cattleId);

    // Generation depth
    const maxDepth = await this._getMaxDescendantDepth(cattleId);

    return {
      directOffspring,
      grandchildrenCount,
      totalDescendants,
      generationDepth: maxDepth,
    };
  }

  private async _getMaxDescendantDepth(cattleId: number, currentDepth: number = 0, visited: Set<number> = new Set()): Promise<number> {
    if (visited.has(cattleId)) return currentDepth;
    visited.add(cattleId);

    const offspring = await this.db.query.cattle.findMany({
      where: eq(schema.cattle.damTag, cattleId),
      columns: { id: true },
    });

    if (offspring.length === 0) {
      return currentDepth;
    }

    let maxDepth = currentDepth;
    for (const child of offspring) {
      const branchVisited = new Set(visited);
      const depth = await this._getMaxDescendantDepth(child.id, currentDepth + 1, branchVisited);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }
}
