/**
 * JSON → D1 Import Script
 *
 * Imports data from migration-export.json into Cloudflare D1 database.
 * Handles foreign key constraints by importing in the correct order.
 *
 * Prerequisites:
 * 1. Run: wrangler d1 create cattle-management-db
 * 2. Update database_id in wrangler.toml
 * 3. Run: pnpm db:migrate (to create tables)
 * 4. Run: pnpm migrate:export (to create migration-export.json)
 *
 * Run: pnpm migrate:import
 */

import * as fs from 'fs';
import * as path from 'path';

async function importToD1() {
  console.log('🐄 Cattle Management System - D1 Import');
  console.log('========================================\n');

  // Read export file
  const exportPath = path.join(__dirname, '../migration-export.json');

  if (!fs.existsSync(exportPath)) {
    console.error(`❌ Error: Export file not found at ${exportPath}`);
    console.error('Please run: pnpm migrate:export first');
    process.exit(1);
  }

  console.log(`📂 Reading export file: ${exportPath}\n`);
  const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

  console.log('📊 Data Summary:');
  console.log(`   Cattle: ${exportData.cattle.length}`);
  console.log(`   Calving Events: ${exportData.calving_events.length}`);
  console.log(`   Service Events: ${exportData.service_events.length}`);
  console.log(`   Sale Events: ${exportData.sale_events.length}`);
  console.log(`   Health Events: ${exportData.health_events.length}\n`);

  // Generate SQL statements
  const sqlStatements: string[] = [];

  // CRITICAL: Import order matters due to foreign key constraints
  console.log('🔄 Generating SQL statements...\n');

  // Phase 1: Import cattle WITHOUT dam_tag relationships
  console.log('Phase 1: Importing cattle records (without maternal links)...');
  for (const cattle of exportData.cattle) {
    const values = [
      cattle.id,
      `'${cattle.tag_no.replace(/'/g, "''")}'`,
      cattle.management_tag ? `'${cattle.management_tag.replace(/'/g, "''")}'` : 'NULL',
      cattle.yob,
      `'${cattle.dob}'`,
      cattle.breed ? `'${cattle.breed.replace(/'/g, "''")}'` : 'NULL',
      cattle.sex ? `'${cattle.sex.replace(/'/g, "''")}'` : 'NULL',
      cattle.size || 'NULL',
      'NULL', // dam_tag set in Phase 2
      cattle.on_farm,
      cattle.current_status ? `'${cattle.current_status.replace(/'/g, "''")}'` : 'NULL',
      cattle.notes ? `'${cattle.notes.replace(/'/g, "''")}'` : 'NULL',
      `'${cattle.created_at}'`,
      `'${cattle.updated_at}'`,
    ];

    sqlStatements.push(
      `INSERT INTO cattle (id, tag_no, management_tag, yob, dob, breed, sex, size, dam_tag, on_farm, current_status, notes, created_at, updated_at) VALUES (${values.join(', ')});`
    );
  }

  // Phase 2: Update dam_tag relationships
  console.log('Phase 2: Linking maternal relationships...');
  for (const cattle of exportData.cattle) {
    if (cattle.dam_tag !== null) {
      sqlStatements.push(
        `UPDATE cattle SET dam_tag = ${cattle.dam_tag} WHERE id = ${cattle.id};`
      );
    }
  }

  // Phase 3: Import calving events
  console.log('Phase 3: Importing calving events...');
  for (const event of exportData.calving_events) {
    const values = [
      event.id,
      event.mother_id,
      event.calf_id || 'NULL',
      `'${event.calving_date}'`,
      event.calving_year,
      event.calving_month ? `'${event.calving_month.replace(/'/g, "''")}'` : 'NULL',
      event.calf_sex ? `'${event.calf_sex.replace(/'/g, "''")}'` : 'NULL',
      event.sire ? `'${event.sire.replace(/'/g, "''")}'` : 'NULL',
      event.days_since_last_calving || 'NULL',
      event.notes ? `'${event.notes.replace(/'/g, "''")}'` : 'NULL',
      `'${event.created_at}'`,
      `'${event.updated_at}'`,
    ];

    sqlStatements.push(
      `INSERT INTO calving_events (id, mother_id, calf_id, calving_date, calving_year, calving_month, calf_sex, sire, days_since_last_calving, notes, created_at, updated_at) VALUES (${values.join(', ')});`
    );
  }

  // Phase 4: Import service events
  console.log('Phase 4: Importing service events...');
  for (const event of exportData.service_events) {
    const values = [
      event.id,
      event.cow_id,
      `'${event.service_date}'`,
      event.sire ? `'${event.sire.replace(/'/g, "''")}'` : 'NULL',
      event.expected_calving_date ? `'${event.expected_calving_date}'` : 'NULL',
      event.expected_calving_period ? `'${event.expected_calving_period.replace(/'/g, "''")}'` : 'NULL',
      event.calving_event_id || 'NULL',
      event.successful !== null ? event.successful : 'NULL',
      event.notes ? `'${event.notes.replace(/'/g, "''")}'` : 'NULL',
      `'${event.created_at}'`,
      `'${event.updated_at}'`,
    ];

    sqlStatements.push(
      `INSERT INTO service_events (id, cow_id, service_date, sire, expected_calving_date, expected_calving_period, calving_event_id, successful, notes, created_at, updated_at) VALUES (${values.join(', ')});`
    );
  }

  // Phase 5: Import sale events
  console.log('Phase 5: Importing sale events...');
  for (const event of exportData.sale_events) {
    const values = [
      event.id,
      event.animal_id,
      `'${event.event_date}'`,
      event.event_type ? `'${event.event_type.replace(/'/g, "''")}'` : 'NULL',
      event.age_months || 'NULL',
      event.weight_kg || 'NULL',
      event.sale_price || 'NULL',
      event.kg_per_month || 'NULL',
      event.price_per_month || 'NULL',
      event.notes ? `'${event.notes.replace(/'/g, "''")}'` : 'NULL',
      `'${event.created_at}'`,
      `'${event.updated_at}'`,
    ];

    sqlStatements.push(
      `INSERT INTO sale_events (id, animal_id, event_date, event_type, age_months, weight_kg, sale_price, kg_per_month, price_per_month, notes, created_at, updated_at) VALUES (${values.join(', ')});`
    );
  }

  // Phase 6: Import health events
  console.log('Phase 6: Importing health events...');
  for (const event of exportData.health_events) {
    const values = [
      event.id,
      event.animal_id,
      `'${event.event_date}'`,
      event.event_type ? `'${event.event_type.replace(/'/g, "''")}'` : 'NULL',
      event.description ? `'${event.description.replace(/'/g, "''")}'` : 'NULL',
      `'${event.created_at}'`,
      `'${event.updated_at}'`,
    ];

    sqlStatements.push(
      `INSERT INTO health_events (id, animal_id, event_date, event_type, description, created_at, updated_at) VALUES (${values.join(', ')});`
    );
  }

  // Write SQL file
  const sqlPath = path.join(__dirname, '../migration-import.sql');
  fs.writeFileSync(sqlPath, sqlStatements.join('\n'));

  console.log(`\n✅ SQL file generated: ${sqlPath}`);
  console.log(`📊 Total statements: ${sqlStatements.length}\n`);

  console.log('📋 Next steps:');
  console.log('1. Ensure D1 database is created: wrangler d1 create cattle-management-db');
  console.log('2. Update database_id in apps/worker/wrangler.toml');
  console.log('3. Apply migrations: cd apps/worker && pnpm db:migrate');
  console.log('4. Import data: wrangler d1 execute cattle-management-db --file=../../migration-import.sql --remote');
  console.log('5. Verify: wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) FROM cattle" --remote\n');

  console.log('🎉 Ready for D1 import!\n');
}

// Run import
importToD1().catch(console.error);
