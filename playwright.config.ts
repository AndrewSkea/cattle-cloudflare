import { defineConfig, devices } from '@playwright/test'

/**
 * Local end-to-end tests against `wrangler dev` (API + static app on one origin).
 *
 *   pnpm --filter web build      # after any frontend change
 *   npx playwright test
 *
 * The global setup resets the LOCAL D1 database to the seeded data before each run.
 * Requires apps/worker/.dev.vars (copy .dev.vars.example) with DEV_AUTH_ENABLED=true.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['app.spec.ts'],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8787',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Optional: reuse an already-downloaded Chromium (CHROMIUM_PATH=/path/to/chrome)
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } }],
  webServer: {
    command: 'pnpm --filter worker dev',
    url: 'http://localhost:8787/api/health-check',
    reuseExistingServer: true,
    timeout: 90_000,
  },
})
