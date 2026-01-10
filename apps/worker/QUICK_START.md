# Quick Start Guide - Cattle Management API

## Available Routes

### Base URL
- Local: `http://localhost:8787/api`
- Production: `https://your-worker.workers.dev/api`

## Route Summary

| Category | Base Path | Endpoints | Description |
|----------|-----------|-----------|-------------|
| **Cattle** | `/cattle` | 5 | Core CRUD for cattle records |
| **Family** | `/family` | 7 | Lineage & family tree operations |
| **Calvings** | `/calvings` | 5 | Calving event management |
| **Sales** | `/sales` | 6 | Sales & death events |
| **Health** | `/health` | 8 | Health event tracking |
| **Breeding** | `/breeding` | 8 | Service events & predictions |
| **Analytics** | `/analytics` | 5 | Metrics & business intelligence |

## Common Operations

### 1. Get Dashboard Overview
```bash
GET /api/analytics/dashboard
```
Returns: Total cattle, breeding females, upcoming calvings, revenue YTD

### 2. List All Cattle
```bash
GET /api/cattle?onFarm=true
```
Optional filters: `search`, `breed`, `sex`, `onFarm`

### 3. Get Cattle with Full Details
```bash
GET /api/cattle/:id
```
Includes: Dam, offspring, calvings, services, sale, health events

### 4. Create Calving Event
```bash
POST /api/calvings
{
  "motherId": 123,
  "calfId": 456,
  "calvingDate": "2024-03-15",
  "calvingYear": 2024,
  "calfSex": "fem",
  "sire": "Char"
}
```
Auto-calculates: Days since last calving, calving month

### 5. Create Service Event
```bash
POST /api/breeding/services
{
  "cowId": 123,
  "serviceDate": "2023-09-15",
  "sire": "Char"
}
```
Auto-calculates: Expected calving date (+ 283 days), calving period

### 6. Get Breeding Predictions
```bash
GET /api/breeding/predictions
```
Returns: Pending services, due soon, overdue, upcoming calvings

### 7. Create Sale Event
```bash
POST /api/sales
{
  "animalId": 789,
  "eventDate": "2024-06-20",
  "eventType": "Sold",
  "weightKg": 450.0,
  "salePrice": 1500.00
}
```
Auto-calculates: Age, kg/month, price/month, updates cattle status

### 8. Get Health History
```bash
GET /api/health/animal/:id
```
Returns: Complete health timeline, events by type, summary stats

### 9. Get Herd Statistics
```bash
GET /api/analytics/herd-stats
```
Returns: Breakdown by breed, sex, age, size, on-farm status

### 10. Get Family Tree
```bash
GET /api/family/tree/:id
```
Returns: Ancestors + descendants with configurable generations

## Response Format

### Success (200, 201)
```json
{
  "data": { ... },
  "count": 10  // Optional for lists
}
```

### Error (400, 404, 500)
```json
{
  "error": "Error message"
}
```

## Key Features

### Auto-Calculations
- ✅ Calving intervals
- ✅ Expected calving dates (service + 283 days)
- ✅ Age at sale
- ✅ Growth rates (kg/month)
- ✅ Financial metrics (price/month)

### Smart Linking
- ✅ Service → Calving (automatic linking)
- ✅ Sale → Cattle (status sync)
- ✅ Mother → Calf relationships

### Filtering
- ✅ Date ranges
- ✅ Status (pending/successful/failed)
- ✅ Type (Sold/Died)
- ✅ Multi-field search

## Development

### Start Local Server
```bash
cd apps/worker
npm run dev
```
Server runs at: `http://localhost:8787`

### Test Endpoint
```bash
curl http://localhost:8787/api/analytics/dashboard
```

### Deploy to Cloudflare
```bash
npm run deploy
```

## Common Queries

### Get breeding females on farm
```bash
GET /api/cattle?sex=fem&onFarm=true
```

### Get calvings this year
```bash
GET /api/calvings?year=2024
```

### Get sales summary for 2024
```bash
GET /api/sales/summary?year=2024
```

### Get overdue calvings
```bash
GET /api/breeding/calendar?status=pending
```
Filter results where `isOverdue: true`

### Get health events by type
```bash
GET /api/health?eventType=Vaccination
```

### Get financial trends (5 years)
```bash
GET /api/analytics/trends?startYear=2019&endYear=2024
```

## Database Schema Reference

### Tables
- `cattle` - Main cattle records
- `calving_events` - Birth records
- `service_events` - Breeding services
- `sale_events` - Sales/deaths (one-to-one with cattle)
- `health_events` - Health records

### Key Relationships
```
cattle (mother) → calving_events (many)
cattle (calf) ← calving_events (one)
cattle (cow) → service_events (many)
service_events → calving_events (optional link)
cattle → sale_events (one-to-one)
cattle → health_events (many)
```

## Validation Rules

### Cattle
- `tagNo` - Required, unique
- `yob` - 1900 to current year
- `dob` - YYYY-MM-DD format
- `sex` - fem/male/steer/hief/fem-clf

### Calving Events
- `motherId` - Must exist in cattle
- `calfId` - Optional, must exist if provided
- `calvingDate` - YYYY-MM-DD format

### Service Events
- `cowId` - Must exist and be female
- `serviceDate` - YYYY-MM-DD format

### Sale Events
- `animalId` - Must exist, one sale per animal
- `eventType` - Sold or Died

### Health Events
- `animalId` - Must exist
- `eventType` - Required

## Tips

1. **Create cattle first** before creating events
2. **Use service events** for breeding tracking and predictions
3. **Link calvings** to service events automatically by creating calving after service
4. **Check analytics** regularly for business insights
5. **Filter by date ranges** for performance with large datasets
6. **Use the family routes** for pedigree analysis

## Support

For issues or questions:
1. Check API_ROUTES.md for detailed documentation
2. Check IMPLEMENTATION_SUMMARY.md for technical details
3. Review the schema in src/db/schema.ts
4. Check route implementation in src/routes/

## Next Steps

1. ✅ Routes implemented
2. 🔲 Add authentication
3. 🔲 Build frontend
4. 🔲 Add tests
5. 🔲 Deploy to production
