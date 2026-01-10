# Cattle Management API Routes

Complete API documentation for the cattle management backend system.

## Base URL
- Development: `http://localhost:8787`
- Production: `https://your-worker.workers.dev`

## Route Overview

### Core Routes
- `/api/cattle` - Cattle CRUD operations
- `/api/family` - Family tree and lineage tracking
- `/api/calvings` - Calving event management
- `/api/sales` - Sales and death events
- `/api/health` - Health event tracking
- `/api/breeding` - Breeding management and predictions
- `/api/analytics` - Dashboard metrics and business intelligence

---

## 1. Analytics Routes (`/api/analytics`)

### GET `/api/analytics/dashboard`
Dashboard metrics including total cattle, breeding females, upcoming calvings, and revenue.

**Response:**
```json
{
  "data": {
    "totalCattle": 150,
    "breedingFemales": 65,
    "upcomingCalvings": 12,
    "revenueYTD": 45000.00,
    "salesCountYTD": 25,
    "recentCalvings": 8,
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

### GET `/api/analytics/herd-stats`
Herd statistics breakdown by breed, sex, age, and status.

**Response:**
```json
{
  "data": {
    "total": 150,
    "byBreed": {
      "Char": 50,
      "AA": 40,
      "Lim": 30,
      "Simm": 20,
      "Luing": 10
    },
    "bySex": {
      "fem": 70,
      "male": 30,
      "steer": 40,
      "fem-clf": 10
    },
    "byAge": {
      "0-12 months": 20,
      "13-24 months": 30,
      "25-36 months": 25,
      "37-60 months": 40,
      "60+ months": 35
    },
    "bySize": {
      "Size 1": 40,
      "Size 2": 50,
      "Size 3": 35,
      "Size 4": 25
    },
    "onFarm": 135,
    "offFarm": 15
  }
}
```

### GET `/api/analytics/breeding-metrics`
Breeding performance metrics including calving rate and success rates.

**Query Parameters:**
- None

**Response:**
```json
{
  "data": {
    "breedingFemales": 65,
    "calvingRate": 85.50,
    "avgCalvingInterval": 365,
    "successRate": 92.30,
    "totalCalvings": 120,
    "calvingsThisYear": 45,
    "totalServices": 80,
    "successfulServices": 74,
    "pendingServices": 6,
    "calvingsByYear": {
      "2023": 50,
      "2024": 45
    },
    "calfSexDistribution": {
      "male": 60,
      "fem": 55,
      "fem-clf": 5
    }
  }
}
```

### GET `/api/analytics/financial-summary`
Financial metrics including sales, revenue, and profitability.

**Query Parameters:**
- `year` (optional) - Filter by specific year

**Response:**
```json
{
  "data": {
    "totalSales": 45,
    "totalRevenue": 67500.00,
    "avgSalePrice": 1500.00,
    "avgWeight": 450.00,
    "avgGrowthRate": 0.85,
    "pricePerKg": 3.33,
    "avgAgeAtSale": 18.5,
    "deathCount": 3,
    "salesByYear": {
      "2023": { "count": 20, "revenue": 30000.00 },
      "2024": { "count": 25, "revenue": 37500.00 }
    }
  }
}
```

### GET `/api/analytics/trends`
Historical trends for herd size, births, and deaths over time.

**Query Parameters:**
- `startYear` (optional) - Start year (default: current year - 5)
- `endYear` (optional) - End year (default: current year)

**Response:**
```json
{
  "data": {
    "yearlyTrends": [
      {
        "year": 2023,
        "herdSize": 140,
        "births": 50,
        "deaths": 2,
        "sales": 20,
        "additions": 50,
        "revenue": 30000.00
      }
    ],
    "monthlyTrends": [
      {
        "month": "Jan",
        "births": 5,
        "sales": 2,
        "deaths": 0
      }
    ],
    "currentYear": 2024,
    "yearRange": { "start": 2019, "end": 2024 }
  }
}
```

---

## 2. Calving Routes (`/api/calvings`)

### GET `/api/calvings`
List all calving events with optional filters.

**Query Parameters:**
- `motherId` - Filter by mother ID
- `year` - Filter by calving year
- `month` - Filter by calving month
- `startDate` - Filter by start date (YYYY-MM-DD)
- `endDate` - Filter by end date (YYYY-MM-DD)

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "motherId": 123,
      "calfId": 456,
      "calvingDate": "2024-03-15",
      "calvingYear": 2024,
      "calvingMonth": "Mar",
      "calfSex": "fem",
      "sire": "Char",
      "daysSinceLastCalving": 365,
      "notes": "Easy calving",
      "mother": { "id": 123, "tagNo": "UK123456", ... },
      "calf": { "id": 456, "tagNo": "UK456789", ... }
    }
  ],
  "count": 1
}
```

### GET `/api/calvings/:id`
Get single calving event with full details.

**Response:**
```json
{
  "data": {
    "id": 1,
    "motherId": 123,
    "calfId": 456,
    "calvingDate": "2024-03-15",
    "calvingYear": 2024,
    "calvingMonth": "Mar",
    "calfSex": "fem",
    "sire": "Char",
    "daysSinceLastCalving": 365,
    "notes": "Easy calving",
    "mother": { ... },
    "calf": { ... },
    "services": [ ... ]
  }
}
```

### POST `/api/calvings`
Create new calving event.

**Request Body:**
```json
{
  "motherId": 123,
  "calfId": 456,
  "calvingDate": "2024-03-15",
  "calvingYear": 2024,
  "calvingMonth": "Mar",
  "calfSex": "fem",
  "sire": "Char",
  "notes": "Easy calving"
}
```

**Response:** `201 Created` with created calving event

### PUT `/api/calvings/:id`
Update existing calving event.

**Request Body:** Same as POST (all fields optional)

**Response:** `200 OK` with updated calving event

### DELETE `/api/calvings/:id`
Delete calving event.

**Response:** `200 OK` with deleted calving event

---

## 3. Sales Routes (`/api/sales`)

### GET `/api/sales`
List sale events with optional filters.

**Query Parameters:**
- `eventType` - Filter by type (Sold/Died)
- `startDate` - Filter by start date
- `endDate` - Filter by end date
- `minPrice` - Minimum sale price
- `maxPrice` - Maximum sale price

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "animalId": 789,
      "eventDate": "2024-06-20",
      "eventType": "Sold",
      "ageMonths": 18,
      "weightKg": 450.0,
      "salePrice": 1500.00,
      "kgPerMonth": 25.00,
      "pricePerMonth": 83.33,
      "notes": "Excellent condition",
      "animal": { ... }
    }
  ],
  "count": 1
}
```

### GET `/api/sales/summary`
Sales summary statistics.

**Query Parameters:**
- `year` (optional) - Filter by specific year

**Response:**
```json
{
  "data": {
    "totalSales": 25,
    "totalDeaths": 2,
    "totalRevenue": 37500.00,
    "avgPrice": 1500.00,
    "avgWeight": 450.00,
    "avgAge": 18.5,
    "avgGrowthRate": 25.00,
    "pricePerKg": 3.33,
    "topSales": [ ... ],
    "salesByMonth": {
      "Jan": { "count": 2, "revenue": 3000.00 },
      "Feb": { "count": 3, "revenue": 4500.00 }
    }
  }
}
```

### GET `/api/sales/:id`
Get single sale event with full details.

### POST `/api/sales`
Create sale event.

**Request Body:**
```json
{
  "animalId": 789,
  "eventDate": "2024-06-20",
  "eventType": "Sold",
  "weightKg": 450.0,
  "salePrice": 1500.00,
  "notes": "Excellent condition"
}
```

**Response:** `201 Created` with created sale event

### PUT `/api/sales/:id`
Update sale event.

### DELETE `/api/sales/:id`
Delete sale event and restore animal to active status.

---

## 4. Health Routes (`/api/health`)

### GET `/api/health`
List all health events with optional filters.

**Query Parameters:**
- `animalId` - Filter by animal ID
- `eventType` - Filter by event type
- `startDate` - Filter by start date
- `endDate` - Filter by end date

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "animalId": 123,
      "eventDate": "2024-05-10",
      "eventType": "Vaccination",
      "description": "Annual TB test",
      "animal": { ... }
    }
  ],
  "count": 1
}
```

### GET `/api/health/animal/:id`
Get health history for specific animal.

**Response:**
```json
{
  "data": {
    "animal": { ... },
    "healthHistory": [ ... ],
    "eventsByType": {
      "Vaccination": [ ... ],
      "Feet trimming": [ ... ]
    },
    "summary": {
      "totalEvents": 10,
      "eventTypes": [
        { "type": "Vaccination", "count": 5, "lastDate": "2024-05-10" },
        { "type": "Feet trimming", "count": 3, "lastDate": "2024-04-15" }
      ],
      "firstEventDate": "2020-01-15",
      "lastEventDate": "2024-05-10"
    }
  }
}
```

### GET `/api/health/types`
Get all unique health event types.

**Response:**
```json
{
  "data": ["Vaccination", "Feet trimming", "Treatment", "Inspection"],
  "count": 4
}
```

### GET `/api/health/summary`
Get health event summary statistics.

**Query Parameters:**
- `year` (optional) - Filter by specific year

**Response:**
```json
{
  "data": {
    "totalEvents": 150,
    "uniqueAnimals": 80,
    "eventsByType": {
      "Vaccination": 60,
      "Feet trimming": 40,
      "Treatment": 30,
      "Inspection": 20
    },
    "eventsByMonth": { ... },
    "topEventTypes": [ ... ]
  }
}
```

### POST `/api/health`
Create health event.

**Request Body:**
```json
{
  "animalId": 123,
  "eventDate": "2024-05-10",
  "eventType": "Vaccination",
  "description": "Annual TB test"
}
```

### PUT `/api/health/:id`
Update health event.

### DELETE `/api/health/:id`
Delete health event.

---

## 5. Breeding Routes (`/api/breeding`)

### GET `/api/breeding/calendar`
Breeding calendar with expected calving dates.

**Query Parameters:**
- `startDate` - Filter by expected start date
- `endDate` - Filter by expected end date
- `status` - Filter by status (pending/successful/failed)

**Response:**
```json
{
  "data": {
    "events": [
      {
        "id": 1,
        "cowId": 123,
        "serviceDate": "2023-09-15",
        "sire": "Char",
        "expectedCalvingDate": "2024-06-25",
        "expectedCalvingPeriod": "Summer 2024",
        "successful": null,
        "cow": { ... },
        "calving": null,
        "daysUntilCalving": 45,
        "isOverdue": false,
        "isDueSoon": true
      }
    ],
    "byPeriod": {
      "Summer 2024": [ ... ],
      "Autumn 2024": [ ... ]
    },
    "count": 25
  }
}
```

### GET `/api/breeding/predictions`
Calving predictions from service events (service_date + 283 days).

**Response:**
```json
{
  "data": {
    "all": [ ... ],
    "dueSoon": [ ... ],
    "overdue": [ ... ],
    "upcoming": [ ... ],
    "counts": {
      "total": 30,
      "dueSoon": 5,
      "overdue": 2,
      "upcoming": 23
    }
  }
}
```

### GET `/api/breeding/performance`
Breeding success rates and metrics.

**Query Parameters:**
- `year` (optional) - Filter by specific year

**Response:**
```json
{
  "data": {
    "totalServices": 80,
    "successful": 74,
    "failed": 4,
    "pending": 2,
    "successRate": 94.87,
    "sirePerformance": [
      {
        "sire": "Char",
        "total": 30,
        "successful": 28,
        "failed": 1,
        "pending": 1,
        "successRate": 96.55
      }
    ],
    "servicesByMonth": { ... },
    "expectedCalvingsByPeriod": { ... }
  }
}
```

### GET `/api/breeding/services`
List all service events.

**Query Parameters:**
- `cowId` - Filter by cow ID
- `startDate` - Filter by start date
- `endDate` - Filter by end date

### POST `/api/breeding/services`
Create service event.

**Request Body:**
```json
{
  "cowId": 123,
  "serviceDate": "2023-09-15",
  "sire": "Char",
  "notes": "Natural service"
}
```

**Note:** Expected calving date and period are automatically calculated (service date + 283 days)

### PUT `/api/breeding/services/:id`
Update service event.

### DELETE `/api/breeding/services/:id`
Delete service event.

---

## Common Response Patterns

### Success Response
```json
{
  "data": { ... },
  "count": 10  // Optional, for list endpoints
}
```

### Error Response
```json
{
  "error": "Error message description"
}
```

### HTTP Status Codes
- `200 OK` - Successful GET, PUT, DELETE
- `201 Created` - Successful POST
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## Data Types

### Date Format
All dates use ISO 8601 format: `YYYY-MM-DD`

### Cattle Sex Values
- `fem` - Female
- `male` - Male (bull)
- `steer` - Castrated male
- `hief` - Heifer
- `fem-clf` - Female calf

### Breed Codes
- `Char` - Charolais
- `AA` - Aberdeen Angus
- `Lim` - Limousin
- `Simm` - Simmental
- `Luing` - Luing

### Event Types
**Health Events:**
- Vaccination
- Feet trimming
- Treatment
- Inspection
- Other (custom)

**Sale Events:**
- Sold
- Died

---

## Calculated Fields

### Calving Events
- `daysSinceLastCalving` - Automatically calculated from previous calving
- `calvingMonth` - Derived from calving date

### Service Events
- `expectedCalvingDate` - Service date + 283 days
- `expectedCalvingPeriod` - Season and year (e.g., "Spring 2024")

### Sale Events
- `ageMonths` - Calculated from DOB to sale date
- `kgPerMonth` - Growth rate (weight / age)
- `pricePerMonth` - Return rate (price / age)

---

## Notes

1. All timestamps are in ISO 8601 format with UTC timezone
2. The API uses Drizzle ORM with SQLite (D1) database
3. Foreign key relationships are enforced with cascade deletes
4. Soft deletes are used for cattle (sets `onFarm = false`)
5. Hard deletes are used for events
6. Service events automatically link to calving events when calvings are created
