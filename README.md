# Cattle Management System - Cloudflare Edition

Modern, cloud-native cattle management system built with Next.js 15, Cloudflare Workers, and D1.

## Architecture

- **Frontend**: Next.js 15 + shadcn/ui + Tailwind CSS (Cloudflare Pages)
- **Backend**: Hono + Cloudflare Workers
- **Database**: Cloudflare D1 (serverless SQLite)
- **Storage**: Cloudflare R2 (file storage)
- **Auth**: Cloudflare Access (Zero Trust)

## Project Structure

```
cattle-cloudflare/
├── apps/
│   ├── web/          # Next.js frontend
│   └── worker/       # Cloudflare Worker backend
└── scripts/          # Migration and utility scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account

### Installation

```bash
# Install dependencies
pnpm install

# Set up Cloudflare
wrangler login

# Create D1 database
wrangler d1 create cattle-management-db

# Create R2 bucket
wrangler r2 bucket create cattle-uploads
```

### Development

```bash
# Run both apps in dev mode
pnpm dev

# Run individually
pnpm dev:worker  # Worker on http://localhost:8787
pnpm dev:web     # Next.js on http://localhost:3000
```

### Migration from Flask/SQLite

```bash
# 1. Export from SQLite
pnpm migrate:export

# 2. Import to D1
pnpm migrate:import

# 3. Validate migration
pnpm migrate:validate
```

### Deployment

```bash
# Deploy Worker
pnpm deploy:worker

# Deploy Next.js to Pages
pnpm deploy:web
```

## Features

- 🐄 Complete cattle record management
- 📊 Family tree visualization with maternal lineage
- 📈 Financial analytics and performance tracking
- 🧬 Breeding recommendations with scoring
- 📤 Bulk Excel/CSV upload (31-column support)
- 📱 Fully responsive mobile-first design
- 🎨 Modern UI with shadcn/ui components
- 🔐 Enterprise-grade Cloudflare Access auth
- ⚡ Serverless architecture with global CDN

## Documentation

See the [migration plan](../.claude/plans/structured-petting-gadget.md) for detailed implementation guide.
