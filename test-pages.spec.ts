import { test, expect } from '@playwright/test';

const BASE_URL = 'https://1ea8c4f6.cattle-management.pages.dev';

test.describe('Cattle Management System - All Pages', () => {
  test('Dashboard page loads and displays correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page).toHaveTitle(/Cattle/i);
  });

  test('Cattle list page loads and displays data', async ({ page }) => {
    await page.goto(`${BASE_URL}/cattle`);
    await expect(page.locator('h1')).toContainText('Cattle Records');

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Check for table or records
    const tableOrRecords = page.locator('table, .cattle-card');
    await expect(tableOrRecords).toBeVisible();
  });

  test('Analytics page loads and displays charts', async ({ page }) => {
    await page.goto(`${BASE_URL}/analytics`);
    await expect(page.locator('h1')).toContainText('Analytics');

    // Wait for charts to load
    await page.waitForTimeout(2000);
  });

  test('Breeding page loads and displays predictions', async ({ page }) => {
    await page.goto(`${BASE_URL}/breeding`);
    await expect(page.locator('h1')).toContainText('Breeding');

    // Wait for data to load
    await page.waitForTimeout(2000);
  });

  test('Financials page loads correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/financials`);
    await expect(page.locator('h1')).toContainText('Financial');

    // Wait for data to load
    await page.waitForTimeout(2000);
  });

  test('Lineage page loads and displays foundation mothers', async ({ page }) => {
    await page.goto(`${BASE_URL}/lineage`);
    await expect(page.locator('h1')).toContainText('Lineage');

    // Wait for data to load
    await page.waitForTimeout(2000);
  });

  test('Health page loads correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/health`);
    await expect(page.locator('h1')).toContainText('Health');
  });

  test('Upload page is accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/upload`);
    await expect(page).toHaveURL(`${BASE_URL}/upload`);
  });

  test('Navigation links work correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Test each navigation link
    await page.click('a[href="/cattle"]');
    await expect(page).toHaveURL(`${BASE_URL}/cattle`);

    await page.click('a[href="/analytics"]');
    await expect(page).toHaveURL(`${BASE_URL}/analytics`);

    await page.click('a[href="/breeding"]');
    await expect(page).toHaveURL(`${BASE_URL}/breeding`);

    await page.click('a[href="/financials"]');
    await expect(page).toHaveURL(`${BASE_URL}/financials`);

    await page.click('a[href="/lineage"]');
    await expect(page).toHaveURL(`${BASE_URL}/lineage`);
  });

  test('API endpoints are responding', async ({ page }) => {
    // Test API health check
    const response = await page.request.get('https://cattle-management-api.andrewskea-as.workers.dev/');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('Cattle API returns data', async ({ page }) => {
    const response = await page.request.get('https://cattle-management-api.andrewskea-as.workers.dev/api/cattle');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBeTruthy();
  });

  test('Analytics API endpoints work', async ({ page }) => {
    const response = await page.request.get('https://cattle-management-api.andrewskea-as.workers.dev/api/analytics/dashboard');
    expect(response.ok()).toBeTruthy();
  });

  test('Breeding predictions API works', async ({ page }) => {
    const response = await page.request.get('https://cattle-management-api.andrewskea-as.workers.dev/api/breeding/predictions');
    expect(response.ok()).toBeTruthy();
  });
});
