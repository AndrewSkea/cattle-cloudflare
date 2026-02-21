import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for local E2E tests.
 *
 * Automatically starts both dev servers before running tests:
 *   - Cloudflare Worker (Hono API) on port 8787
 *   - Static file server for the Next.js export on port 3000
 *
 * Run: npx playwright test test-local.spec.ts --config=playwright.local.config.ts
 *
 * Requires:
 *   - apps/worker/.dev.vars with DEV_AUTH_ENABLED=true
 *   - apps/web/out/ to be built with NEXT_PUBLIC_API_URL=http://localhost:8787
 *     Build with: cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm build
 *     OR: ensure apps/web/.env.local has NEXT_PUBLIC_API_URL=http://localhost:8787 before building
 *
 * NOTE: If you change frontend code, re-run: cd apps/web && pnpm build
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['test-local.spec.ts'],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    actionTimeout: 15_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Auto-start dev servers before any tests run.
  // reuseExistingServer: true means if servers are already running, use them.
  webServer: [
    {
      command: 'pnpm --filter worker dev',
      url: 'http://localhost:8787/',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Serve the static Next.js export from apps/web/out/
      // This is more reliable than 'next dev' because all JS bundles are pre-compiled.
      // Re-run 'cd apps/web && pnpm build' when frontend code changes.
      command: 'npx serve apps/web/out -p 3000',
      url: 'http://localhost:3000/',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
