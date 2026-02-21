/**
 * Bulk Upload Service - 6-Pass Excel/CSV Processing
 *
 * Matches Python implementation from bulk_upload_service.py
 * Uses SheetJS instead of pandas for Excel parsing in Workers
 */

import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DrizzleD1Database } from '../db/client';
import type { UploadStats } from '../types';

export class BulkUploadService {
  private db: DrizzleD1Database;
  private farmId: number;
  private stats: UploadStats;
  private cattleMap: Map<string, { id: number }>;

  constructor(db: DrizzleD1Database, farmId: number) {
    this.db = db;
    this.farmId = farmId;
    this.stats = {
      cattleAdded: 0,
      cattleSkipped: 0,
      cattleUpdated: 0,
      maternalLinks: 0,
      calvingsAdded: 0,
      servicesAdded: 0,
      salesAdded: 0,
      healthAdded: 0,
      errors: [],
    };
    this.cattleMap = new Map();
  }

  /**
   * Process Excel/CSV file with 6-pass strategy
   */
  async processFile(arrayBuffer: ArrayBuffer, fileName: string): Promise<UploadStats> {
    try {
      console.log(`Processing file: ${fileName}`);

      // Parse Excel/CSV using SheetJS
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON (array of objects with column names as keys)
      const data = XLSX.utils.sheet_to_json(worksheet);

      console.log(`Parsed ${data.length} rows from ${sheetName}`);

      // 6-pass processing (matches Python implementation)
      await this.pass1ImportCattle(data);
      await this.pass2LinkMaternalRelationships(data);
      await this.pass3ImportCalvingEvents(data);
      await this.pass4ImportServiceEvents(data);
      await this.pass5ImportSaleEvents(data);
      await this.pass6ImportHealthEvents(data);

      return this.stats;
    } catch (error) {
      console.error('Bulk upload error:', error);
      this.stats.errors.push(`Processing error: ${error.message}`);
      throw error;
    }
  }

  // ==================== PASS 1: IMPORT CATTLE ====================

  private async pass1ImportCattle(data: any[]) {
    console.log('Pass 1: Importing cattle records');

    for (let idx = 0; idx < data.length; idx++) {
      try {
        const row = data[idx];

        // Validate required fields
        if (!row['Tag No']) {
          this.stats.cattleSkipped++;
          continue;
        }

        const tagNo = String(row['Tag No']).trim();
        const mgmtTag = String(row['Management Tag'] || row['mngt tag'] || '').trim();

        // Check if cattle already exists
        const existing = await this.db.query.cattle.findFirst({
          where: eq(schema.cattle.tagNo, tagNo),
        });

        if (existing) {
          this.cattleMap.set(mgmtTag, { id: existing.id });
          this.stats.cattleSkipped++;
          continue;
        }

        // Parse data
        const yob = this.parseInt(row['YOB']) || new Date().getFullYear();
        const dob = this.parseDate(row['DOB']);

        if (!dob) {
          console.warn(`Skipping row ${idx}: No valid DOB for tag ${tagNo}`);
          this.stats.cattleSkipped++;
          continue;
        }

        // Create cattle record
        const [newCattle] = await this.db.insert(schema.cattle).values({
          tagNo,
          managementTag: mgmtTag,
          yob,
          dob,
          breed: row['Breed'] || null,
          sex: row['sex'] || null,
          size: this.parseInt(row['size\n1 - large\n2 - med l\n3 - med s\n4 - small']),
          onFarm: this.parseOnFarm(row),
          currentStatus: this.determineStatus(row),
          notes: this.buildNotes(row),
          farmId: this.farmId,
        }).returning();

        this.cattleMap.set(mgmtTag, { id: newCattle.id });
        this.stats.cattleAdded++;

        if (this.stats.cattleAdded % 50 === 0) {
          console.log(`Processed ${this.stats.cattleAdded} cattle...`);
        }
      } catch (error) {
        this.stats.errors.push(`Row ${idx}: ${error.message}`);
      }
    }

    console.log(`Pass 1 complete: Added ${this.stats.cattleAdded}, Skipped ${this.stats.cattleSkipped}`);
  }

  // ==================== PASS 2: LINK MATERNAL RELATIONSHIPS ====================

  private async pass2LinkMaternalRelationships(data: any[]) {
    console.log('Pass 2: Linking maternal relationships');

    for (let idx = 0; idx < data.length; idx++) {
      try {
        const row = data[idx];

        const mgmtTag = String(row['Management Tag'] || row['mngt tag'] || '').trim();
        const damTag = String(row['DAM tag'] || row['DAM'] || '').trim();

        if (!mgmtTag || !damTag) continue;

        const cattle = this.cattleMap.get(mgmtTag);
        const dam = this.cattleMap.get(damTag);

        if (cattle && dam) {
          await this.db.update(schema.cattle)
            .set({ damTag: dam.id })
            .where(eq(schema.cattle.id, cattle.id));

          this.stats.maternalLinks++;
        }
      } catch (error) {
        this.stats.errors.push(`Maternal link row ${idx}: ${error.message}`);
      }
    }

    console.log(`Pass 2 complete: Linked ${this.stats.maternalLinks} maternal relationships`);
  }

  // ==================== PASS 3: IMPORT CALVING EVENTS ====================

  private async pass3ImportCalvingEvents(data: any[]) {
    console.log('Pass 3: Importing calving events');

    for (let idx = 0; idx < data.length; idx++) {
      try {
        const row = data[idx];
        const mgmtTag = String(row['Management Tag'] || row['mngt tag'] || '').trim();
        const cattle = this.cattleMap.get(mgmtTag);

        if (!cattle) continue;

        // Import 2024 calving
        await this.addCalvingIfExists(cattle.id, row, {
          dateCol: 'Calfed date 2024',
          year: 2024,
          monthCol: 'Month 2024',
          sireCol: 'Sire 2025 calf',
        });

        // Import 2025 calving
        await this.addCalvingIfExists(cattle.id, row, {
          dateCol: 'Calf date 2025',
          year: 2025,
          sexCol: 'calf sex',
          sireCol: 'Sire 2025 calf',
          deltaCol: 'delta',
        });
      } catch (error) {
        this.stats.errors.push(`Calving event row ${idx}: ${error.message}`);
      }
    }

    console.log(`Pass 3 complete: Added ${this.stats.calvingsAdded} calving events`);
  }

  // ==================== PASS 4: IMPORT SERVICE EVENTS ====================

  private async pass4ImportServiceEvents(data: any[]) {
    console.log('Pass 4: Importing service events');

    for (let idx = 0; idx < data.length; idx++) {
      try {
        const row = data[idx];
        const mgmtTag = String(row['Management Tag'] || row['mngt tag'] || '').trim();
        const cattle = this.cattleMap.get(mgmtTag);

        if (!cattle) continue;

        const serviceDate = this.parseDate(row['service date 2025 for 2026']);

        if (serviceDate) {
          await this.db.insert(schema.serviceEvents).values({
            cowId: cattle.id,
            serviceDate,
            sire: row['Sire 2026 calf'] || null,
            expectedCalvingDate: this.parseDate(row['calf due date from service date']),
            expectedCalvingPeriod: row['calf due date Julia 2025.11.08'] || null,
            farmId: this.farmId,
          });

          this.stats.servicesAdded++;
        }
      } catch (error) {
        this.stats.errors.push(`Service event row ${idx}: ${error.message}`);
      }
    }

    console.log(`Pass 4 complete: Added ${this.stats.servicesAdded} service events`);
  }

  // ==================== PASS 5: IMPORT SALE EVENTS ====================

  private async pass5ImportSaleEvents(data: any[]) {
    console.log('Pass 5: Importing sale and death events');

    for (let idx = 0; idx < data.length; idx++) {
      try {
        const row = data[idx];
        const mgmtTag = String(row['Management Tag'] || row['mngt tag'] || '').trim();
        const cattle = this.cattleMap.get(mgmtTag);

        if (!cattle) continue;

        if (row['Date sold / died']) {
          const eventDate = this.parseDate(row['Date sold / died']);

          if (eventDate) {
            const eventType = String(row['Date sold / died']).toLowerCase().includes('died')
              ? 'Died'
              : 'Sold';

            await this.db.insert(schema.saleEvents).values({
              animalId: cattle.id,
              eventDate,
              eventType,
              ageMonths: this.parseInt(row['Age sold / died']),
              weightKg: this.parseFloat(row['sale weight kg']),
              salePrice: this.parseFloat(row['Sale price £']),
              kgPerMonth: this.parseFloat(row['kg/ month']),
              pricePerMonth: this.parseFloat(row['£/month']),
              farmId: this.farmId,
            });

            this.stats.salesAdded++;
          }
        }
      } catch (error) {
        this.stats.errors.push(`Sale event row ${idx}: ${error.message}`);
      }
    }

    console.log(`Pass 5 complete: Added ${this.stats.salesAdded} sale/death events`);
  }

  // ==================== PASS 6: IMPORT HEALTH EVENTS ====================

  private async pass6ImportHealthEvents(data: any[]) {
    console.log('Pass 6: Importing health events');

    const feetCol = 'feet trimmed 2025-05-20';

    for (let idx = 0; idx < data.length; idx++) {
      try {
        const row = data[idx];
        const mgmtTag = String(row['Management Tag'] || row['mngt tag'] || '').trim();
        const cattle = this.cattleMap.get(mgmtTag);

        if (!cattle) continue;

        if (row[feetCol]) {
          await this.db.insert(schema.healthEvents).values({
            animalId: cattle.id,
            eventDate: '2025-05-20',
            eventType: 'feet trimmed',
            description: String(row[feetCol]),
            farmId: this.farmId,
          });

          this.stats.healthAdded++;
        }
      } catch (error) {
        // Silent fail for health events
      }
    }

    console.log(`Pass 6 complete: Added ${this.stats.healthAdded} health events`);
  }

  // ==================== HELPER METHODS ====================

  private async addCalvingIfExists(
    motherId: number,
    row: any,
    config: {
      dateCol: string;
      year: number;
      monthCol?: string;
      sexCol?: string;
      sireCol?: string;
      deltaCol?: string;
    }
  ) {
    const calvingDate = this.parseDate(row[config.dateCol]);

    if (calvingDate) {
      await this.db.insert(schema.calvingEvents).values({
        motherId,
        calvingDate,
        calvingYear: config.year,
        calvingMonth: config.monthCol ? row[config.monthCol] : null,
        calfSex: config.sexCol ? row[config.sexCol] : null,
        sire: config.sireCol ? row[config.sireCol] : null,
        daysSinceLastCalving: config.deltaCol ? this.parseInt(row[config.deltaCol]) : null,
        farmId: this.farmId,
      });

      this.stats.calvingsAdded++;
    }
  }

  private parseDate(value: any): string | null {
    if (!value) return null;

    // SheetJS converts Excel dates to JavaScript Date objects
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    // Handle string dates
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch {}
    }

    return null;
  }

  private parseInt(value: any): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return isNaN(parsed) ? null : Math.floor(parsed);
  }

  private parseFloat(value: any): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  }

  private parseOnFarm(row: any): boolean {
    const value = row['on farm'] || row['on farm?'] || 'yes';
    return ['yes', 'y', 'true', '1'].includes(String(value).toLowerCase());
  }

  private determineStatus(row: any): string {
    const onFarm = this.parseOnFarm(row);

    if (!onFarm) {
      const saleData = row['Date sold / died'];
      if (saleData && String(saleData).toLowerCase().includes('died')) {
        return 'Died';
      }
      return 'Sold';
    }

    return 'Active';
  }

  private buildNotes(row: any): string | null {
    const notes: string[] = [];

    if (row['Date sold / died']) {
      notes.push(`Sale/Death: ${row['Date sold / died']}`);
    }

    const feetCol = 'feet trimmed 2025-05-20';
    if (row[feetCol]) {
      notes.push(`Feet trimming: ${row[feetCol]}`);
    }

    if (row['cattle turned out...']) {
      notes.push(String(row['cattle turned out...']));
    }

    return notes.length > 0 ? notes.join('; ') : null;
  }
}
