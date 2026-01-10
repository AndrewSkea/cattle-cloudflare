# Quick Start Guide

Get your cattle management system running in 15 minutes!

## 1. Install Dependencies (3 mins)

```bash
cd C:/Users/andre/Documents/git/cattle-cloudflare

# Install all dependencies
pnpm install

# If pnpm is not installed:
npm install -g pnpm
```

## 2. Set Up Cloudflare (5 mins)

```bash
# Install Wrangler CLI if not already installed
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create cattle-management-db
# ⚠️ IMPORTANT: Copy the database_id from the output!

# Create R2 bucket
wrangler r2 bucket create cattle-uploads
```

**Update `apps/worker/wrangler.toml`:**
Replace `YOUR_DATABASE_ID` with your actual database ID from above.

## 3. Set Up Database (3 mins)

```bash
cd apps/worker

# Generate migration files
pnpm db:generate

# Apply migrations to D1
pnpm db:migrate

# Verify tables created
wrangler d1 execute cattle-management-db --command "SELECT name FROM sqlite_master WHERE type='table'" --remote
# Should show: cattle, calving_events, service_events, sale_events, health_events
```

## 4. Migrate Your Data (2 mins)

```bash
cd ../..

# Export from SQLite
pnpm migrate:export
# Creates migration-export.json with 149 cattle records

# Generate import SQL
pnpm migrate:import
# Creates migration-import.sql

# Import to D1
cd apps/worker
wrangler d1 execute cattle-management-db --file=../../migration-import.sql --remote

# Verify
wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) FROM cattle" --remote
# Should show: 149
```

## 5. Test Locally (2 mins)

```bash
# Terminal 1: Start Worker
cd apps/worker
pnpm dev
# Worker running at http://localhost:8787

# Terminal 2: Start Next.js
cd apps/web
pnpm dev
# Frontend running at http://localhost:3000

# Test it!
# Open http://localhost:3000 in your browser
```

## 6. Deploy to Cloudflare (Optional)

```bash
# Deploy Worker
cd apps/worker
pnpm deploy
# Note the Worker URL

# Deploy Next.js
cd ../web
echo "NEXT_PUBLIC_API_URL=https://cattle-management-api.<your-subdomain>.workers.dev" > .env.local
pnpm build
pnpm deploy
```

## Verify Everything Works

✅ Check these endpoints:
- http://localhost:8787/ - Worker health check
- http://localhost:8787/api/cattle - List all cattle
- http://localhost:8787/api/family/foundation - Foundation mothers
- http://localhost:3000 - Next.js homepage
- http://localhost:3000/cattle - Cattle list
- http://localhost:3000/upload - Bulk upload

## Common Issues

**"cattle.db not found" during migration:**
- The export script looks for: `C:/Users/andre/Documents/git/cattle_excel/cattle.db`
- Update path in `scripts/migrate-data.ts` if your database is elsewhere

**"No cattle records shown" in frontend:**
- Check API_URL in .env.local
- Verify Worker is running: `curl http://localhost:8787/api/cattle`
- Check browser console for CORS errors

**"table does not exist":**
- Run migrations: `cd apps/worker && pnpm db:migrate`
- Verify tables: `wrangler d1 execute cattle-management-db --command "SELECT name FROM sqlite_master WHERE type='table'" --remote`

## What's Next?

1. **Test bulk upload**: Upload your cattle_2025.xlsx file at http://localhost:3000/upload
2. **Explore family trees**: Click on any cattle to see maternal lineage
3. **Customize UI**: Edit pages in `apps/web/app/` to match your needs
4. **Add more routes**: Implement analytics, breeding, financials routes
5. **Deploy to production**: Follow DEPLOY.md for full deployment guide

## File Structure

```
cattle-cloudflare/
├── apps/
│   ├── worker/          # Cloudflare Worker (API)
│   │   ├── src/
│   │   │   ├── routes/  # API endpoints
│   │   │   ├── services/# Business logic
│   │   │   └── db/      # Drizzle ORM schema
│   │   └── wrangler.toml
│   │
│   └── web/             # Next.js Frontend
│       ├── app/         # Pages (App Router)
│       ├── components/  # UI components
│       └── lib/         # Utilities
│
└── scripts/             # Migration scripts
    ├── migrate-data.ts  # SQLite → JSON
    └── seed-d1.ts       # JSON → D1
```

## Need Help?

- 📖 Full deployment guide: [DEPLOY.md](./DEPLOY.md)
- 📋 Migration plan: [../.claude/plans/structured-petting-gadget.md](../.claude/plans/structured-petting-gadget.md)
- 🐛 Check Worker logs: `wrangler tail cattle-management-api`
- 🔍 Inspect D1 data: `wrangler d1 execute cattle-management-db --command "SELECT * FROM cattle LIMIT 5" --remote`

🎉 You're all set! Enjoy your modern, cloud-native cattle management system!
