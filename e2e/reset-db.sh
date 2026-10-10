#!/usr/bin/env bash
# Resets the LOCAL D1 database to the seeded v1 data. Never touches the remote database.
set -euo pipefail
cd "$(dirname "$0")/../apps/worker"
mkdir -p ../../test-results
TABLES="mart_matches mart_averages mart_lots mart_reports scoteid_events scoteid_animals farm_integrations activity_log transactions tasks movements weight_records breeding_records birth_records health_records equipment_logs equipment inventory_items staff structures land_parcels animals farm_invites farm_members farms users"
SQL="PRAGMA defer_foreign_keys = ON;"
for t in $TABLES; do SQL="$SQL DELETE FROM $t;"; done
SQL="$SQL DELETE FROM sqlite_sequence;"
npx wrangler d1 migrations apply cattle-management-db --local >/dev/null
npx wrangler d1 execute cattle-management-db --local --command "$SQL" >/dev/null
npx wrangler d1 execute cattle-management-db --local --file=../../scripts/seed-v2.sql >/dev/null
# A fixed sample of Orkney Mart reports (real data) so mart tests run offline.
npx tsx ../../scripts/mart-backfill.ts --file ../../e2e/fixtures/mart-reports.json > ../../test-results/.mart-fixture.sql 2>/dev/null
npx wrangler d1 execute cattle-management-db --local --file=../../test-results/.mart-fixture.sql >/dev/null
echo "local database reset"
