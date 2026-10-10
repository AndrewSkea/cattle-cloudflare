/**
 * Builds SQL that loads Orkney Mart sales reports into D1 (the Worker's cron keeps it current afterwards).
 *
 *   npx tsx scripts/mart-backfill.ts --since 2024-01-01 > /tmp/mart.sql          # fetch live reports
 *   npx tsx scripts/mart-backfill.ts --file e2e/fixtures/mart-reports.json > …     # from saved reports
 *   cd apps/worker && npx wrangler d1 execute cattle-management-db --remote --file=/tmp/mart.sql
 *
 * Re-running is safe: each report's lots and averages are replaced.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeEntities, parseAverages, parseReport, reportSummary } from '../apps/worker/src/services/mart/parse';

interface WpEvent { id: number; title: string; start_date: string; url: string; description: string }

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

async function fetchAll(since: string): Promise<WpEvent[]> {
  const end = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const out: WpEvent[] = [];
  for (let page = 1; page < 40; page++) {
    const res = await fetch(`https://orkneymart.com/wp-json/tribe/events/v1/events?categories=sales-report&per_page=50&page=${page}&start_date=${since}&end_date=${end}`,
      { headers: { 'User-Agent': 'HoovesWho farm records (+https://hooveswho.andrewskea.com)' } });
    if (!res.ok) break;
    const json = await res.json() as { events: WpEvent[]; total_pages: number };
    out.push(...json.events);
    if (page >= json.total_pages) break;
  }
  return out;
}

const q = (v: unknown) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replace(/'/g, "''")}'`;

async function main() {
  const file = opt('file');
  const events: WpEvent[] = file ? JSON.parse(readFileSync(file, 'utf8')) : await fetchAll(opt('since') ?? '2024-01-01');
  const out: string[] = [];
  const fetchedAt = new Date().toISOString();
  let lots = 0;
  for (const ev of events) {
    if (!ev.description) continue;
    const date = ev.start_date.slice(0, 10);
    const title = decodeEntities(ev.title);
    const parsed = parseReport(ev.description, title);
    const averages = parseAverages(ev.description);
    const hash = createHash('sha256').update(ev.description).digest('hex').slice(0, 24);
    lots += parsed.length;
    out.push(`DELETE FROM mart_lots WHERE report_id = ${ev.id};`, `DELETE FROM mart_averages WHERE report_id = ${ev.id};`);
    out.push(`INSERT OR REPLACE INTO mart_reports (id, source, date, title, url, summary, content_hash, lot_count, fetched_at) VALUES (${[ev.id, 'orkney', date, title, ev.url, reportSummary(ev.description), hash, parsed.length, fetchedAt].map(q).join(', ')});`);
    for (let i = 0; i < parsed.length; i += 50) {
      out.push(`INSERT INTO mart_lots (report_id, date, section, category, species, basis, seller_key, seller, weight_kg, price, price_per_kg, breed_code, head_count, buyer, top, raw) VALUES\n${parsed.slice(i, i + 50).map((l) =>
        `(${[ev.id, date, l.section, l.category, l.species, l.basis, l.sellerKey, l.seller, l.weightKg, l.price, l.pricePerKg, l.breedCode, l.headCount, l.buyer, l.top, l.raw].map(q).join(', ')})`).join(',\n')};`);
    }
    if (averages.length) {
      out.push(`INSERT INTO mart_averages (report_id, date, label, category, species, unit, value) VALUES\n${averages.map((a) =>
        `(${[ev.id, date, a.label, a.category, a.species, a.unit, a.value].map(q).join(', ')})`).join(',\n')};`);
    }
  }
  // Match every farm that has seller names configured.
  out.push(`INSERT INTO mart_matches (farm_id, lot_id, status)
SELECT i.farm_id, l.id, 'new' FROM farm_integrations i, json_each(json_extract(i.config, '$.sellers')) s
JOIN mart_lots l ON l.seller_key = lower(replace(replace(trim(s.value), ', ', ','), ' ,', ','))
WHERE i.provider = 'orkney_mart'
ON CONFLICT (farm_id, lot_id) DO NOTHING;`);
  console.log(out.join('\n'));
  console.error(`${events.length} reports, ${lots} lots`);
}

main();
