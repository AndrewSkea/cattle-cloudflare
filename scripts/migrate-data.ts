/**
 * SQLite → JSON Export Script
 *
 * Exports all data from the existing Flask SQLite database (cattle.db)
 * into a JSON file for migration to Cloudflare D1.
 *
 * Run: pnpm migrate:export
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

interface CattleRecord {
  id: number;
  tag_no: string;
  management_tag: string | null;
  yob: number;
  dob: string;
  breed: string | null;
  sex: string | null;
  size: number | null;
  dam_tag: number | null;
  on_farm: number;
  current_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CalvingEventRecord {
  id: number;
  mother_id: number;
  calf_id: number | null;
  calving_date: string;
  calving_year: number;
  calving_month: string | null;
  calf_sex: string | null;
  sire: string | null;
  days_since_last_calving: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ServiceEventRecord {
  id: number;
  cow_id: number;
  service_date: string;
  sire: string | null;
  expected_calving_date: string | null;
  expected_calving_period: string | null;
  calving_event_id: number | null;
  successful: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SaleEventRecord {
  id: number;
  animal_id: number;
  event_date: string;
  event_type: string | null;
  age_months: number | null;
  weight_kg: number | null;
  sale_price: number | null;
  kg_per_month: number | null;
  price_per_month: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface HealthEventRecord {
  id: number;
  animal_id: number;
  event_date: string;
  event_type: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface ExportData {
  cattle: CattleRecord[];
  calving_events: CalvingEventRecord[];
  service_events: ServiceEventRecord[];
  sale_events: SaleEventRecord[];
  health_events: HealthEventRecord[];
  metadata: {
    exported_at: string;
    source_database: string;
    record_counts: {
      cattle: number;
      calving_events: number;
      service_events: number;
      sale_events: number;
      health_events: number;
    };
  };
}

function exportSQLiteToJSON() {
  console.log('🐄 Cattle Management System - SQLite Export');
  console.log('==========================================\n');

  // Path to existing Flask SQLite database
  const dbPath = path.join(__dirname, '../../cattle_excel/cattle.db');

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Error: Database not found at ${dbPath}`);
    console.error('Please ensure the Flask app database exists.');
    process.exit(1);
  }

  console.log(`📂 Opening database: ${dbPath}\n`);

  const db = new Database(dbPath, { readonly: true });

  try {
    // Export all tables
    console.log('📤 Exporting data...\n');

    const cattle = db.prepare('SELECT * FROM cattle ORDER BY id').all() as CattleRecord[];
    console.log(`✓ Cattle: ${cattle.length} records`);

    const calvingEvents = db.prepare('SELECT * FROM calving_events ORDER BY id').all() as CalvingEventRecord[];
    console.log(`✓ Calving Events: ${calvingEvents.length} records`);

    const serviceEvents = db.prepare('SELECT * FROM service_events ORDER BY id').all() as ServiceEventRecord[];
    console.log(`✓ Service Events: ${serviceEvents.length} records`);

    const saleEvents = db.prepare('SELECT * FROM sale_events ORDER BY id').all() as SaleEventRecord[];
    console.log(`✓ Sale Events: ${saleEvents.length} records`);

    const healthEvents = db.prepare('SELECT * FROM health_events ORDER BY id').all() as HealthEventRecord[];
    console.log(`✓ Health Events: ${healthEvents.length} records`);

    // Create export data object
    const exportData: ExportData = {
      cattle,
      calving_events: calvingEvents,
      service_events: serviceEvents,
      sale_events: saleEvents,
      health_events: healthEvents,
      metadata: {
        exported_at: new Date().toISOString(),
        source_database: dbPath,
        record_counts: {
          cattle: cattle.length,
          calving_events: calvingEvents.length,
          service_events: serviceEvents.length,
          sale_events: saleEvents.length,
          health_events: healthEvents.length,
        },
      },
    };

    // Write to JSON file
    const outputPath = path.join(__dirname, '../migration-export.json');
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

    console.log(`\n✅ Export complete!`);
    console.log(`📄 Output file: ${outputPath}`);
    console.log(`📊 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB\n`);

    // Display summary
    console.log('Summary:');
    console.log('--------');
    console.log(`Total records exported: ${
      exportData.metadata.record_counts.cattle +
      exportData.metadata.record_counts.calving_events +
      exportData.metadata.record_counts.service_events +
      exportData.metadata.record_counts.sale_events +
      exportData.metadata.record_counts.health_events
    }`);

    // Validate critical relationships
    console.log('\nValidating relationships...');
    const cattleWithDam = cattle.filter(c => c.dam_tag !== null).length;
    console.log(`✓ ${cattleWithDam} cattle have maternal relationships`);

    const foundationMothers = cattle.filter(c =>
      c.dam_tag === null && calvingEvents.some(ce => ce.mother_id === c.id)
    ).length;
    console.log(`✓ ${foundationMothers} foundation mothers identified`);

    console.log('\n🎉 Ready for import to D1! Run: pnpm migrate:import\n');

  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run export
exportSQLiteToJSON();
