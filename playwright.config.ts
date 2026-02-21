import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Cattle Management System tests.
 *
 * Environment variables:
 *   PAGES_BASE_URL - Cloudflare Pages URL (defaults to production URL)
 *                    Update after each new deployment if needed.
 *   API_BASE_URL   - Cloudflare Worker API URL
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['test-*.spec.ts'],
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
})
