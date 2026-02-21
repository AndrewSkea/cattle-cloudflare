# Deployment Guide - Cattle Management System on Cloudflare

Complete step-by-step guide to deploy your cattle management system to Cloudflare.

## Prerequisites

- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- Wrangler CLI installed (`npm install -g wrangler`)
- Cloudflare account
- Git (for version control)

## Step 1: Install Dependencies

```bash
cd C:/Users/andre/Documents/git/cattle-cloudflare

# Install root dependencies
pnpm install

# Install worker dependencies
cd apps/worker
pnpm install

# Install web dependencies
cd ../web
pnpm install

cd ../..
```

## Step 2: Set Up Cloudflare D1 Database

```bash
# Authenticate with Cloudflare
wrangler login

# Create D1 database
wrangler d1 create cattle-management-db

# Copy the database_id from output and update apps/worker/wrangler.toml
# Replace YOUR_DATABASE_ID with the actual ID
```

**Update `apps/worker/wrangler.toml`:**
```toml
[[d1_databases]]
binding = "DB"
database_name = "cattle-management-db"
database_id = "your-actual-database-id-here"
```

## Step 3: Generate and Apply D1 Migrations

```bash
cd apps/worker

# Generate migration files from Drizzle schema
pnpm db:generate

# Apply migrations to D1 (remote)
pnpm db:migrate

# Verify tables were created
wrangler d1 execute cattle-management-db --command "SELECT name FROM sqlite_master WHERE type='table'" --remote
```

## Step 4: Create R2 Bucket for File Uploads

```bash
# Create R2 bucket for Excel/CSV uploads
wrangler r2 bucket create cattle-uploads

# Verify bucket was created
wrangler r2 bucket list
```

## Step 5: Migrate Data from Flask SQLite → D1

```bash
cd ../..

# Export data from Flask SQLite database
pnpm migrate:export
# This creates migration-export.json

# Generate SQL import statements
pnpm migrate:import
# This creates migration-import.sql

# Import data to D1
cd apps/worker
wrangler d1 execute cattle-management-db --file=../../migration-import.sql --remote

# Verify data was imported
wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) as count FROM cattle" --remote
# Expected output: 149 cattle records
```

## Step 6: Test Worker Locally

```bash
# Still in apps/worker directory
pnpm dev

# In another terminal, test the API
curl http://localhost:8787/
curl http://localhost:8787/api/cattle
```

## Step 7: Deploy Worker to Cloudflare

```bash
# Deploy Worker
pnpm deploy

# Your Worker will be available at:
# https://cattle-management-api.<your-subdomain>.workers.dev

# Test the deployed Worker
curl https://cattle-management-api.<your-subdomain>.workers.dev/api/cattle
```

## Step 8: Configure Next.js for Cloudflare Pages

```bash
cd ../web

# Update .env.local with your Worker URL
echo "NEXT_PUBLIC_API_URL=https://cattle-management-api.<your-subdomain>.workers.dev" > .env.local

# Test Next.js locally
pnpm dev
# Open http://localhost:3000
```

## Step 9: Build and Deploy Next.js to Cloudflare Pages

```bash
# Build Next.js for static export
pnpm build

# Deploy to Cloudflare Pages
pnpm deploy

# Or manually create Pages project in Cloudflare Dashboard:
# 1. Go to Pages → Create a project
# 2. Connect your Git repository
# 3. Build command: cd apps/web && pnpm build
# 4. Output directory: apps/web/out
# 5. Environment variable: NEXT_PUBLIC_API_URL = <your-worker-url>
```

## Step 10: Set Up Custom Domain (Optional)

### For Worker API:
1. Go to Workers & Pages → cattle-management-api → Settings → Triggers
2. Add custom domain: `api.yourdomain.com`
3. Cloudflare will automatically provision SSL certificate

### For Next.js Frontend:
1. Go to Pages → your-pages-project → Custom domains
2. Add custom domain: `cattle.yourdomain.com`
3. Update DNS records as instructed

## Step 11: Configure Cloudflare Access (Optional - Zero Trust Auth)

```bash
# In Cloudflare Dashboard:
# 1. Go to Zero Trust → Access → Applications
# 2. Add an application → Self-hosted
# 3. Application domain: cattle.yourdomain.com
# 4. Create access policy (e.g., allow specific emails)

# Update Worker to verify JWT (already implemented in code)
# Set environment variable:
wrangler secret put CF_ACCESS_TEAM_DOMAIN
# Enter: your-team.cloudflareaccess.com
```

## Step 12: Verify Deployment

### Test Worker API:
```bash
# Get all cattle
curl https://your-worker-url/api/cattle

# Get specific cattle
curl https://your-worker-url/api/cattle/1

# Get family tree
curl https://your-worker-url/api/family/tree/1

# Get foundation mothers
curl https://your-worker-url/api/family/foundation
```

### Test Next.js Frontend:
1. Open https://cattle.yourdomain.com
2. Navigate to Cattle List
3. Try uploading an Excel file
4. View individual cattle details
5. Check family trees

### Verify Data Migration:
```bash
# Check record counts
wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) FROM cattle" --remote
wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) FROM calving_events" --remote
wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) FROM service_events" --remote

# Check sample records
wrangler d1 execute cattle-management-db --command "SELECT tag_no, management_tag, breed FROM cattle LIMIT 5" --remote

# Verify maternal relationships
wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) FROM cattle WHERE dam_tag IS NOT NULL" --remote
```

## Troubleshooting

### Issue: "database not found"
- Verify database_id in wrangler.toml matches your D1 database
- Run: `wrangler d1 list` to see all databases

### Issue: "table does not exist"
- Run migrations: `cd apps/worker && pnpm db:migrate`
- Verify: `wrangler d1 execute cattle-management-db --command "SELECT name FROM sqlite_master WHERE type='table'" --remote`

### Issue: "No cattle records returned"
- Check if data was imported: `wrangler d1 execute cattle-management-db --command "SELECT COUNT(*) FROM cattle" --remote`
- Re-run import if needed: `wrangler d1 execute cattle-management-db --file=../../migration-import.sql --remote`

### Issue: "CORS errors in frontend"
- Update Worker CORS settings in `apps/worker/src/index.ts`
- Add your Pages domain to allowed origins

### Issue: "File upload fails"
- Verify R2 bucket is created: `wrangler r2 bucket list`
- Check R2 binding in wrangler.toml
- Ensure file size is under 10MB

## Performance Optimization

1. **Enable Caching:**
   - Add Cache-Control headers to Worker responses
   - Use Cloudflare Cache API for frequently accessed data

2. **Optimize Database Queries:**
   - Add indexes for frequently queried columns (already included in schema)
   - Use pagination for large result sets

3. **Monitor Performance:**
   - Check Workers Analytics in Cloudflare Dashboard
   - Monitor D1 query performance
   - Set up Cloudflare Web Analytics for frontend

## Security Checklist

- [x] D1 database is not publicly accessible (Workers only)
- [x] R2 bucket is private (no public access)
- [ ] Cloudflare Access configured (optional but recommended)
- [ ] Environment variables/secrets set via Wrangler
- [ ] CORS configured for your domain only
- [ ] Rate limiting enabled (consider Cloudflare Rate Limiting rules)

## Maintenance

### Backup D1 Database:
```bash
# Export current data
wrangler d1 export cattle-management-db --output=backup-$(date +%Y%m%d).sql --remote
```

### Update Worker:
```bash
cd apps/worker
# Make code changes
pnpm deploy
```

### Update Frontend:
```bash
cd apps/web
# Make code changes
pnpm build
pnpm deploy
```

## Cost Estimate

With Cloudflare's Free Plan:
- **Workers**: 100,000 requests/day (free)
- **D1**: 5GB storage, 5 million reads/day (free)
- **R2**: 10GB storage, 1 million reads/month (free)
- **Pages**: Unlimited requests (free)

Expected costs for 149 cattle records: **$0/month** on Free Plan

## Support

For issues or questions:
1. Check logs: `wrangler tail cattle-management-api`
2. Review Cloudflare Dashboard → Workers & Pages → Logs
3. Consult migration plan: `../.claude/plans/structured-petting-gadget.md`

## Next Steps

After successful deployment:
1. Test bulk Excel upload with your actual cattle_2025.xlsx file
2. Verify all 149 cattle records are accessible
3. Test family tree calculations
4. Verify financial calculations match Flask app
5. Set up monitoring and alerts
6. Configure automatic backups
7. Train users on new interface

🎉 Congratulations! Your cattle management system is now running on Cloudflare's global network!



### Secrets 
  Summary: What You Need

Service: Google Client ID
Where to Get: https://console.cloud.google.com/apis/credentials
Save As: NEXT_PUBLIC_GOOGLE_CLIENT_ID (frontend)
────────────────────────────────────────
Service: Google Client Secret
Where to Get: https://console.cloud.google.com/apis/credentials
Save As: GOOGLE_CLIENT_SECRET (wrangler secret)
────────────────────────────────────────
Service: Turnstile Site Key
Where to Get: https://dash.cloudflare.com/turnstile
Save As: NEXT_PUBLIC_TURNSTILE_SITE_KEY (frontend)
────────────────────────────────────────
Service: Turnstile Secret
Where to Get: https://dash.cloudflare.com/turnstile
Save As: TURNSTILE_SECRET_KEY (wrangler secret)
────────────────────────────────────────
Service: JWT Secret
Where to Get: Generate with openssl rand -hex 32
Save As: JWT_SECRET (wrangler secret)