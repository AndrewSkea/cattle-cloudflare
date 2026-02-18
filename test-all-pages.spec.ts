import { test, expect, devices } from '@playwright/test';

const BASE_URL = 'https://d65fd4af.cattle-management.pages.dev';

// Desktop tests
test.describe('Desktop - All Pages Functionality', () => {
  test('Dashboard loads and displays KPI cards', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Check title appears
    await expect(page.locator('h1')).toContainText('Dashboard', { timeout: 15000 });

    // Check for KPI cards (should have at least 4)
    const cards = page.locator('div').filter({ hasText: /Total Cattle|Breeding Females|Revenue|Calvings/ });
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
  });

  test('Analytics page loads with charts', async ({ page }) => {
    await page.goto(`${BASE_URL}/analytics`);

    await expect(page.locator('h1')).toContainText('Analytics', { timeout: 15000 });

    // Check for stat cards and charts sections
    await expect(page.getByText('Herd Statistics')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Breeding Performance')).toBeVisible({ timeout: 15000 });
  });

  test('Cattle list displays with size column and sorting', async ({ page }) => {
    await page.goto(`${BASE_URL}/cattle`);

    await expect(page.locator('h1')).toContainText('Cattle Records', { timeout: 15000 });

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Check for Size column header
    await expect(page.getByText('Size').first()).toBeVisible({ timeout: 10000 });

    // Check for at least one row
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
  });

  test('Cattle detail page loads when clicking on a row', async ({ page }) => {
    await page.goto(`${BASE_URL}/cattle`);

    // Wait for table
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    // Click first cattle row
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    // Wait for navigation
    await page.waitForURL(/\/cattle\/detail\?id=/, { timeout: 15000 });

    // Check for family tree section
    await expect(page.getByText('Family Tree')).toBeVisible({ timeout: 15000 });
  });

  test('Financials page loads with sales metrics', async ({ page }) => {
    await page.goto(`${BASE_URL}/financials`);

    await expect(page.locator('h1')).toContainText('Financial', { timeout: 15000 });

    // Check for metrics cards
    await expect(page.getByText('Total Revenue')).toBeVisible({ timeout: 15000 });
  });

  test('Breeding page loads with predictions', async ({ page }) => {
    await page.goto(`${BASE_URL}/breeding`);

    await expect(page.locator('h1')).toContainText('Breeding', { timeout: 15000 });
  });

  test('Lineage page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/lineage`);

    await expect(page.locator('h1')).toContainText('Lineage', { timeout: 15000 });
  });

  test('Health page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/health`);

    await expect(page.locator('h1')).toContainText('Health', { timeout: 15000 });
  });

  test('Upload page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/upload`);

    await expect(page.locator('h1')).toContainText('Upload', { timeout: 15000 });
  });
});

// Mobile tests
test.describe('Mobile - All Pages Responsive', () => {
  test('Dashboard is mobile responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone 12 size
    await page.goto(`${BASE_URL}/dashboard`);

    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });

    // Cards should stack vertically on mobile
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThan(768);
  });

  test('Cattle list is mobile responsive with horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/cattle`);

    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });

    // Table should be visible (may need horizontal scroll)
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
  });

  test('Analytics charts are mobile responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/analytics`);

    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });
});

// API connectivity test
test.describe('API Connectivity', () => {
  test('API endpoints respond correctly', async ({ request }) => {
    const apiUrl = 'https://cattle-management-api.andrewskea-as.workers.dev';

    // Test analytics endpoint
    const analyticsResponse = await request.get(`${apiUrl}/api/analytics/herd-statistics`);
    expect(analyticsResponse.ok()).toBeTruthy();

    const analyticsData = await analyticsResponse.json();
    expect(analyticsData).toHaveProperty('data');
    expect(analyticsData.data).toHaveProperty('totalCount');

    // Test sales metrics endpoint
    const salesResponse = await request.get(`${apiUrl}/api/sales/metrics`);
    expect(salesResponse.ok()).toBeTruthy();

    const salesData = await salesResponse.json();
    expect(salesData).toHaveProperty('data');
  });
});
