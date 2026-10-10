# Orkney Mart sales, traceability, and the feature roadmap (2026-10-10)

## What was built

**Orkney Mart sales** (`/mart`)
- Source: the mart's public WordPress API, `https://orkneymart.com/wp-json/tribe/events/v1/events?categories=sales-report`
  (596 reports in the "Sales Report" category; 165 since January 2024). No HTML scraping.
- Parser (`apps/worker/src/services/mart/parse.ts`): lot rows (`Farm,Parish  weight  £price  p/kg  BREED`), alternative
  column orders, show-and-sale tables with buyers, and narrative "topped at …" sentences. Lots listed under both
  "per kilo" and "per head" are de-duplicated. Market averages ("Store Steers averaged 394.1 p/kg") are stored too.
  Coverage on all 165 reports: 98.6% of price lines; the rest is show-champion prose.
- Farms set the seller names they trade under ("Staye, Deerness"). Search over every seller seen in the reports.
- Each matching lot can be imported against chosen animals. Animals are ranked by class (steer/heifer/cow/OTM/calf),
  breed code, age and last weight. Import marks them sold on the sale date with price, weight and buyer, books the
  income, and records the sale weight. Undo reverses all of it.
- Each lot shows p/kg against that day's average for the same class (Prime against Prime, Store against Store).
- Market price chart: monthly p/kg by class over two years, with the farm's own sales as dots.
- Cron every 3 hours; "Check for new reports" button; dashboard alert for lots to review.

**Traceability** (`/traceability`)
- Reporting deadlines from the ScotEID keeper guide: tag beef calves ≤20 days, register births ≤27 days, moves ≤3 days
  (Scottish marts/abattoirs report for you), deaths ≤7 days.
- UK ear tag check digit: `((herd mark + animal number) mod 7) + 1`, verified on the herd (146 of 148 pass; the 2 failures
  and one incomplete tag are real data errors).
- Holding register per year, on screen and as CSV.
- ScotEID connection (built against the published WSDL, schema 1.7.12): keeper login stored encrypted;
  `SMGetCattleHoldings`, `SMGetCattleOnHoldings`, `GetCPHCattleEventHistory`; reconciliation (on ScotEID only, here only,
  gone here but still on the holding, differing DOB/sex/dam), import of missing cattle, and deadlines marked as reported.
  Tested end to end against a local fake. **Dormant in production until ScotEID issues a vendor ApplicationKey.**

Also: carcase weight and EUROP grade on sales/deaths; herd mark in farm settings; hooveswho.andrewskea.com.

## Getting the ScotEID key (needs the farm owner)

ScotEID's guide: "To request a username and password for the test site, please contact support@scoteid.com", and
production access follows successful testing. Suggested email:

> Subject: API access for farm software — HoovesWho
>
> Hello, I keep cattle in Orkney (herd mark 523801) and use farm-management software I develop, HoovesWho
> (https://hooveswho.andrewskea.com). I'd like to integrate it with the ScotEID web services so it can read my holding's
> cattle and event history (SMGetCattleHoldings, SMGetCattleOnHoldings, GetCPHCattleEventHistory) and, later, submit
> births, deaths and movements. Could you please issue test-site credentials and a vendor ApplicationKey?
> Thank you.

Then: `wrangler secret put SCOTEID_APP_KEY`, `wrangler secret put SCOTEID_ENDPOINT` = `https://api.test.scoteid.com/api`,
connect on the Traceability page, sync, compare with ScotEID.com, then switch the endpoint to production.

## Feature sweep — what established tools do that HoovesWho doesn't yet

Compared against Herdwatch, Breedr, AgriWebb, Farmbrite and the AHDB / ICBF KPI tools.

| Feature | Who has it | Value here | Effort |
| --- | --- | --- | --- |
| Report births, deaths and moves *to* ScotEID / BCMS from the app | Herdwatch, AgriWebb (CTS-certified) | High — removes double entry | Medium, after the ScotEID key (write operations exist in the WSDL) |
| Bluetooth EID reader and weigh-head capture | Breedr, Herdwatch | High once EID tags are mandatory in Scotland | Medium (Web Bluetooth / Web Serial; device-specific) |
| Offline use in the field (PWA) | Herdwatch | High in Orkney | Medium |
| Herd KPIs vs AHDB benchmarks (calving interval, 6-week calving rate, calves reared per cow, age at first calving) | Breedr, ICBF HerdPlus | High | Low–medium (data is already here) |
| Finishing forecast (date to reach target weight from growth rate) | Breedr | Medium | Low |
| Medicine book export for QMS / Red Tractor audits | Herdwatch | Medium | Low |
| BVD status per animal (ScotEID `GetAnimalBVDCategory`) | ScotEID-integrated tools | Medium (Scotland BVD scheme) | Low after the key |
| Grazing rotation (days grazed and rested per field) | AgriWebb | Medium | Medium |
| Carcase feedback import from abattoirs | Breedr | Medium | Depends on abattoir |
