# CLAUDE.md - Cattle Management System

> Documentation for Claude Code instances working on this project

## Project Overview

This is a **full-stack cattle management system** built with Next.js 15, React 19, Cloudflare Workers (Hono), Drizzle ORM, and D1 Database. It provides comprehensive herd management, breeding tracking, financial analytics, and lineage visualization.

**Live Deployment:**
- Frontend (Cloudflare Pages): https://968dfec6.cattle-management.pages.dev
- Backend API (Cloudflare Workers): https://cattle-management-api.andrewskea-as.workers.dev

---

## Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router) with React 19
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Data**: TanStack Query (future), date-fns, papaparse
- **Build Mode**: Static export (`output: 'export'`)
- **Deployment**: Cloudflare Pages

### Backend
- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **ORM**: Drizzle ORM
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (for file uploads)
- **Deployment**: Wrangler CLI

### Testing
- **E2E Tests**: Playwright
- **Test File**: `test-pages.spec.ts` (13 tests, all passing)

---

## Architecture

### Monorepo Structure
```
cattle-cloudflare/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/     # Authenticated pages
│   │   │   │   ├── dashboard/
│   │   │   │   ├── cattle/
│   │   │   │   ├── analytics/
│   │   │   │   ├── breeding/
│   │   │   │   ├── financials/
│   │   │   │   ├── lineage/
│   │   │   │   ├── health/
│   │   │   │   └── upload/
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   └── charts/     # Recharts components
│   │   └── lib/
│   │       └── api-client.ts
│   └── worker/             # Cloudflare Worker API
│       ├── src/
│       │   ├── db/
│       │   │   ├── schema.ts
│       │   │   └── migrations/
│       │   ├── routes/
│       │   │   ├── cattle.ts
│       │   │   ├── family.ts
│       │   │   ├── analytics.ts
│       │   │   ├── breeding.ts
│       │   │   ├── calvings.ts
│       │   │   ├── sales.ts
│       │   │   ├── health.ts
│       │   │   └── upload.ts
│       │   └── index.ts
│       └── wrangler.toml
├── scripts/
│   └── export-sqlite-to-sql.py
├── test-pages.spec.ts
└── pnpm-workspace.yaml
```

---

## Database Schema

### Core Tables
1. **cattle** - Main cattle records
   - id, tagNo, managementTag, yob, breed, sex, dam, sire, etc.
2. **calving_events** - Birth records
   - id, dam, calf, calvingDate, assistanceLevel, etc.
3. **service_events** - Breeding services
   - id, cow, bull, serviceDate, outcome, etc.
4. **sale_events** - Sales transactions
   - id, cattle, saleDate, price, buyer, etc.
5. **health_records** - Health events
   - id, cattle, date, event, notes, etc.

### Relations
- Cattle → CalvingEvents (as dam)
- Cattle → ServiceEvents (as cow)
- Cattle → SaleEvents
- Cattle → HealthRecords
- Full lineage tracking through dam/sire relationships

**Current Data**: 149 cattle, 89 calvings, 39 services, 6 health records

---

## API Endpoints

### Base URL
`https://cattle-management-api.andrewskea-as.workers.dev`

### Routes
```typescript
// Cattle Management
GET    /api/cattle                    // List all cattle
GET    /api/cattle/:id                // Get single cattle
POST   /api/cattle                    // Create cattle
PUT    /api/cattle/:id                // Update cattle
DELETE /api/cattle/:id                // Delete cattle

// Analytics
GET    /api/analytics/dashboard       // Dashboard KPIs
GET    /api/analytics/herd            // Herd statistics
GET    /api/analytics/breeding        // Breeding metrics
GET    /api/analytics/financial       // Financial summary
GET    /api/analytics/trends          // Trends over time

// Breeding
GET    /api/breeding/predictions      // Calving predictions
GET    /api/breeding/calendar         // Breeding calendar
GET    /api/breeding/performance      // Breeding performance
GET    /api/breeding/services         // Service records
POST   /api/breeding/services         // Create service
PUT    /api/breeding/services/:id     // Update service
DELETE /api/breeding/services/:id     // Delete service

// Calvings
GET    /api/calvings                  // List calvings
POST   /api/calvings                  // Create calving
PUT    /api/calvings/:id              // Update calving
DELETE /api/calvings/:id              // Delete calving

// Sales
GET    /api/sales                     // List sales
GET    /api/sales/summary             // Sales summary
POST   /api/sales                     // Create sale
PUT    /api/sales/:id                 // Update sale

// Health
GET    /api/health                    // List health records
GET    /api/health/:cattleId          // Records by animal
POST   /api/health                    // Create health record
PUT    /api/health/:id                // Update health record
DELETE /api/health/:id                // Delete health record

// Lineage
GET    /api/family/foundation-mothers // Foundation mothers with offspring counts

// Upload
POST   /api/upload                    // CSV upload (R2)
```

---

## Deployment Guide

### Prerequisites
- Node.js 18+ and pnpm
- Cloudflare account
- Wrangler CLI installed globally

### Initial Setup
```bash
# Install dependencies
pnpm install --ignore-scripts  # Skip better-sqlite3 native compilation

# Create D1 database
wrangler d1 create cattle-management-db

# Update wrangler.toml with database_id
# Line: database_id = "your-db-id-here"

# Generate migrations
cd apps/worker
pnpm run db:generate

# Apply migrations
wrangler d1 migrations apply cattle-management-db --remote
```

### Data Migration (if importing from SQLite)
```bash
# Export SQLite to SQL
python scripts/export-sqlite-to-sql.py

# Import to D1
wrangler d1 execute cattle-management-db --remote --file=migration-import.sql
```

### Deploy Worker
```bash
cd apps/worker
pnpm run deploy
```

### Deploy Frontend
```bash
cd apps/web
pnpm run build
pnpm run pages:deploy
```

### Run Production Tests (against deployed app)
```bash
npx playwright test test-pages.spec.ts
```

### Run Local E2E Tests (72 tests, all user flows)
```bash
# The config auto-starts both servers if not already running.
# First time: ensure apps/web/out/ is built with local API URL:
#   cd apps/web && pnpm build   (requires apps/web/.env.local with NEXT_PUBLIC_API_URL=http://localhost:8787)
npx playwright test test-local.spec.ts --config=playwright.local.config.ts --reporter=list
```

**Key notes for local testing:**
- `apps/worker/.dev.vars` must have `DEV_AUTH_ENABLED=true` (bypasses Google OAuth/Turnstile)
- `apps/web/.env.local` must have `NEXT_PUBLIC_API_URL=http://localhost:8787`
- Tests serve the static `apps/web/out/` build (not `next dev`) for reliable chunk loading
- Re-run `cd apps/web && pnpm build` after any frontend changes

---

## Important Configuration Notes

### 1. CORS Configuration
**Location**: `apps/worker/src/index.ts`

The CORS middleware dynamically allows all Cloudflare Pages deployments:
```typescript
app.use('*', cors({
  origin: (origin) => {
    if (origin?.includes('localhost')) return origin;
    if (origin?.includes('cattle-management.pages.dev')) return origin;
    return origin || '*';
  },
  credentials: true,
}));
```

### 2. Wrangler Configuration
**Location**: `apps/worker/wrangler.toml`

Key settings:
```toml
name = "cattle-management-api"
compatibility_flags = ["nodejs_compat"]  # NOT node_compat (Wrangler v4)
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "cattle-management-db"
database_id = "2ea35c9f-57a9-4866-b118-5d8cd7a2375e"
migrations_dir = "src/db/migrations"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "cattle-management-uploads"
```

### 3. Next.js Static Export
**Location**: `apps/web/next.config.ts`

```typescript
const nextConfig: NextConfig = {
  output: 'export',  // Static site generation
  images: {
    unoptimized: true,
  },
};
```

**Important**: Dynamic routes like `/cattle/[id]` require `generateStaticParams()` or must be disabled for static builds.

### 4. API Client Configuration
**Location**: `apps/web/lib/api-client.ts`

```typescript
const API_BASE_URL = 'https://cattle-management-api.andrewskea-as.workers.dev';
```

### 5. Schema Relations Fix
**Location**: `apps/worker/src/db/schema.ts:185`

Critical fix - must import both `one` and `many`:
```typescript
export const calvingEventsRelations = relations(calvingEvents, ({ one, many }) => ({
  // relations here
}));
```

---

## Known Issues & Workarounds

### 1. better-sqlite3 Compilation Failure
**Issue**: On Windows, `better-sqlite3` requires Visual Studio Build Tools.

**Workaround**: Use `pnpm install --ignore-scripts` to skip native compilation. Local SQLite development won't work, but D1 database works fine.

### 2. Foreign Key Constraints on Import
**Issue**: D1 enforces foreign keys during bulk imports.

**Solution**: Wrap SQL imports with pragmas:
```sql
PRAGMA foreign_keys = OFF;
-- INSERT statements
PRAGMA foreign_keys = ON;
```

### 3. Dynamic Routes in Static Export
**Issue**: `/cattle/[id]/page.tsx` fails static build without `generateStaticParams()`.

**Current State**: Disabled by renaming directory to `detail-disabled/`.

**Future Fix**: Either implement `generateStaticParams()` or switch to dynamic rendering.

### 4. Management Tag Format Not Implemented
**User Request**: Tags should follow format `tag_num-[twin_num-]YY` (e.g., "13-1" or "21-5-1" for twins).

**Current State**: Not validated or auto-generated yet.

**Future Implementation**: Add validation in cattle create/update endpoints and auto-generate format.

---

## Testing

### Playwright Test Coverage
**File**: `test-pages.spec.ts`

**Test Results**: 13/13 passing ✓

Tests cover:
- All page loads (Dashboard, Cattle, Analytics, Breeding, Financials, Lineage, Health, Upload)
- Navigation between pages
- API health checks
- Data fetching from API endpoints

**Run Tests**:
```bash
npx playwright test test-pages.spec.ts --reporter=list
```

---

## Development Workflow

### Local Development
```bash
# Terminal 1 - Worker
cd apps/worker
pnpm run dev

# Terminal 2 - Frontend
cd apps/web
pnpm run dev
```

**Note**: Update `apps/web/lib/api-client.ts` to use `http://localhost:8787` for local development.

### Database Changes
```bash
# 1. Modify schema in apps/worker/src/db/schema.ts
# 2. Generate migration
cd apps/worker
pnpm run db:generate

# 3. Apply to remote
wrangler d1 migrations apply cattle-management-db --remote

# 4. Deploy worker
pnpm run deploy
```

### Adding New Pages
1. Create page in `apps/web/app/(auth)/[page-name]/page.tsx`
2. Add navigation link in `apps/web/app/(auth)/layout.tsx`
3. Create API endpoint in `apps/worker/src/routes/[route-name].ts`
4. Register route in `apps/worker/src/index.ts`
5. Add API methods to `apps/web/lib/api-client.ts`
6. Build, deploy, and test

---

## Completed Features

✓ Complete cattle records management (CRUD)
✓ Dashboard with KPI cards
✓ Analytics with herd statistics and charts (Recharts)
✓ Breeding management with calving predictions
✓ Service records tracking
✓ Financial tracking with sales data
✓ Family lineage visualization with foundation mothers
✓ Health records system (basic)
✓ CSV upload functionality
✓ Full navigation between all pages
✓ Comprehensive API with 25+ endpoints
✓ CORS configuration for Cloudflare Pages
✓ D1 database with 5 tables and relations
✓ Playwright E2E tests (13 tests passing)
✓ Static site generation with Next.js
✓ Deployed to production (Worker + Pages)

---

## Future Enhancements

### High Priority
- [ ] Implement management tag format validation (`tag_num-[twin_num-]YY`)
- [ ] Re-enable cattle detail page with generateStaticParams
- [ ] Complete health records functionality (currently placeholder)
- [ ] Add authentication (Cloudflare Access or custom)

### Medium Priority
- [ ] Add data export functionality (CSV/PDF reports)
- [ ] Implement search and filtering across all pages
- [ ] Add pagination for large datasets
- [ ] Create mobile-responsive design improvements
- [ ] Add data validation and error messages throughout

### Low Priority
- [ ] Add dark mode theme
- [ ] Implement real-time updates (WebSockets)
- [ ] Add user roles and permissions
- [ ] Create dashboard customization
- [ ] Add email notifications for breeding events

---

## Troubleshooting

### API Not Responding
1. Check Worker deployment: `wrangler tail cattle-management-api`
2. Verify CORS allows your origin
3. Check API_BASE_URL in `apps/web/lib/api-client.ts`

### Frontend Shows "No Data"
1. Verify API endpoints return data (test with curl/Postman)
2. Check browser console for CORS or fetch errors
3. Ensure database has data: `wrangler d1 execute cattle-management-db --remote --command "SELECT COUNT(*) FROM cattle"`

### Build Failures
1. TypeScript errors: Run `pnpm run typecheck` in affected app
2. Dynamic route errors: Check for missing `generateStaticParams()`
3. Dependency issues: Delete `node_modules` and `pnpm-lock.yaml`, run `pnpm install --ignore-scripts`

### Deployment Issues
1. Worker: Check `wrangler.toml` bindings match dashboard resources
2. Pages: Ensure build output is in `apps/web/out/` directory
3. Database: Verify migrations applied: `wrangler d1 migrations list cattle-management-db --remote`

---

## Contact & Resources

**Repository**: https://github.com/AndrewSkea/cattle-cloudflare

**Cloudflare Dashboard**:
- Workers: https://dash.cloudflare.com/workers
- D1 Database: https://dash.cloudflare.com/d1
- R2 Storage: https://dash.cloudflare.com/r2
- Pages: https://dash.cloudflare.com/pages

**Documentation**:
- Next.js: https://nextjs.org/docs
- Hono: https://hono.dev/
- Drizzle: https://orm.drizzle.team/docs
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Playwright: https://playwright.dev/

---

## Version History

**v1.0.0** (2026-01-10) - Initial implementation
- Full-stack cattle management system
- 8 functional pages with data visualization
- 25+ API endpoints
- D1 database with 283+ records
- Deployed to production
- 13 E2E tests passing

---

*Last updated: 2026-01-10*
*Created by: Claude Code*
