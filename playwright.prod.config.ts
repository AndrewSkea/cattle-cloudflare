import { defineConfig, devices } from '@playwright/test'

/** Read-only production smoke tests. BASE_URL overrides the default production URL. */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['prod.spec.ts'],
  timeout: 45_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://hooveswho.andrewskea.com',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
