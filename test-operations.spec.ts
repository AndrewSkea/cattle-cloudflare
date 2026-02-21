import { test, expect } from '@playwright/test'

const API_URL = process.env.API_BASE_URL || 'https://cattle-management-api.andrewskea-as.workers.dev'
const PAGES_URL = process.env.PAGES_BASE_URL || 'https://cb445d3c.cattle-management.pages.dev'

// ─── API: Health & Public Endpoints ──────────────────────────────────────────

test.describe('API - Health & Public Endpoints', () => {
  test('worker health check returns ok', async ({ request }) => {
    const resp = await request.get(`${API_URL}/`)
    expect(resp.ok()).toBeTruthy()
    const data = await resp.json()
    expect(data.status).toBe('ok')
  })

  test('auth/me returns 401 without cookie', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/auth/me`)
    expect(resp.status()).toBe(401)
  })

  test('auth/login returns 400 without turnstile token', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/auth/login`)
    expect(resp.status()).toBe(400)
    const data = await resp.json()
    expect(data.error).toBeTruthy()
  })

  test('CORS allows pages.dev origin', async ({ request }) => {
    const resp = await request.get(`${API_URL}/`, {
      headers: { Origin: 'https://cattle-management.pages.dev' },
    })
    const headers = resp.headers()
    expect(headers['access-control-allow-origin']).toBeTruthy()
  })

  test('CORS allows localhost origin for development', async ({ request }) => {
    const resp = await request.get(`${API_URL}/`, {
      headers: { Origin: 'http://localhost:3000' },
    })
    const headers = resp.headers()
    expect(headers['access-control-allow-origin']).toBeTruthy()
  })
})

// ─── API: Existing Routes Auth Protection ────────────────────────────────────

test.describe('API - Existing Routes Require Auth', () => {
  const routes = [
    '/api/cattle',
    '/api/fields',
    '/api/health',
    '/api/sales',
    '/api/calvings',
    '/api/breeding/predictions',
    '/api/breeding/services',
    '/api/analytics/dashboard',
    '/api/analytics/herd',
    '/api/analytics/breeding',
    '/api/family/foundation-mothers',
  ]

  for (const route of routes) {
    test(`GET ${route} returns 401 without auth`, async ({ request }) => {
      const resp = await request.get(`${API_URL}${route}`)
      expect(resp.status()).toBe(401)
      const data = await resp.json()
      expect(data.error).toBeTruthy()
    })
  }
})

// ─── API: New Operations Routes Auth Protection ───────────────────────────────

test.describe('API - New Operations Routes Require Auth', () => {
  test('GET /api/machinery returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/machinery`)
    expect(resp.status()).toBe(401)
    const data = await resp.json()
    expect(data.error).toBe('Unauthorized')
  })

  test('POST /api/machinery returns 401', async ({ request }) => {
    const resp = await request.post(`${API_URL}/api/machinery`, {
      data: { name: 'Test', type: 'tractor' },
    })
    expect(resp.status()).toBe(401)
  })

  test('GET /api/machinery/:id returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/machinery/1`)
    expect(resp.status()).toBe(401)
  })

  test('GET /api/machinery/:id/events returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/machinery/1/events`)
    expect(resp.status()).toBe(401)
  })

  test('GET /api/workers returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/workers`)
    expect(resp.status()).toBe(401)
    const data = await resp.json()
    expect(data.error).toBe('Unauthorized')
  })

  test('POST /api/workers returns 401', async ({ request }) => {
    const resp = await request.post(`${API_URL}/api/workers`, {
      data: { name: 'Test Worker' },
    })
    expect(resp.status()).toBe(401)
  })

  test('GET /api/workers/:id/payroll returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/workers/1/payroll`)
    expect(resp.status()).toBe(401)
  })

  test('GET /api/supplies returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/supplies`)
    expect(resp.status()).toBe(401)
    const data = await resp.json()
    expect(data.error).toBe('Unauthorized')
  })

  test('POST /api/supplies returns 401', async ({ request }) => {
    const resp = await request.post(`${API_URL}/api/supplies`, {
      data: { category: 'fertiliser', name: 'Test', date: '2026-01-01', totalCost: 100 },
    })
    expect(resp.status()).toBe(401)
  })

  test('GET /api/analytics/financial returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/analytics/financial`)
    expect(resp.status()).toBe(401)
    const data = await resp.json()
    expect(data.error).toBe('Unauthorized')
  })

  test('GET /api/fields/:id/timeline returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/fields/1/timeline`)
    expect(resp.status()).toBe(401)
  })

  test('GET /api/farms returns 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/farms`)
    expect(resp.status()).toBe(401)
  })
})

// ─── API: Error Response Format Consistency ───────────────────────────────────

test.describe('API - Error Response Format', () => {
  test('machinery 401 includes error string', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/machinery`)
    const data = await resp.json()
    expect(typeof data.error).toBe('string')
    expect(data.error.length).toBeGreaterThan(0)
  })

  test('workers 401 includes error string', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/workers`)
    const data = await resp.json()
    expect(typeof data.error).toBe('string')
  })

  test('supplies 401 includes error string', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/supplies`)
    const data = await resp.json()
    expect(typeof data.error).toBe('string')
  })

  test('financial 401 includes error string', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/analytics/financial`)
    const data = await resp.json()
    expect(typeof data.error).toBe('string')
  })
})

// ─── API: Content-Type Headers ────────────────────────────────────────────────

test.describe('API - Response Headers', () => {
  test('API returns JSON content-type for 401 responses', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/machinery`)
    const ct = resp.headers()['content-type']
    expect(ct).toContain('application/json')
  })

  test('API health check returns JSON content-type', async ({ request }) => {
    const resp = await request.get(`${API_URL}/`)
    const ct = resp.headers()['content-type']
    expect(ct).toContain('application/json')
  })
})

// ─── Frontend: Login Page ─────────────────────────────────────────────────────

test.describe('Frontend - Login Page', () => {
  test('login page loads with correct heading', async ({ page }) => {
    await page.goto(`${PAGES_URL}/login`)
    await expect(page.locator('h1')).toContainText('HoovesWho')
  })

  test('login page has sign-in prompt', async ({ page }) => {
    await page.goto(`${PAGES_URL}/login`)
    await expect(page.locator('h2')).toContainText('Sign in')
  })

  test('login page has Google sign-in button', async ({ page }) => {
    await page.goto(`${PAGES_URL}/login`)
    const btn = page.locator('button', { hasText: /sign in with google/i })
    await expect(btn).toBeVisible()
  })

  test('Google sign-in button is disabled until Turnstile completes', async ({ page }) => {
    await page.goto(`${PAGES_URL}/login`)
    const btn = page.locator('button', { hasText: /sign in with google/i })
    // Button should be disabled without a valid Turnstile token
    await expect(btn).toBeDisabled()
  })

  test('login page has farm management tagline', async ({ page }) => {
    await page.goto(`${PAGES_URL}/login`)
    await expect(page.locator('p', { hasText: /farm management/i })).toBeVisible()
  })
})

// ─── Frontend: Auth-Protected Pages Redirect ──────────────────────────────────

test.describe('Frontend - Protected Pages Redirect to Login', () => {
  test('dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/dashboard`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('cattle page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/cattle`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('machinery page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/machinery`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('supplies page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/supplies`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('workers page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/workers`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('fields page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/fields`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('financials page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/financials`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('health page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/health`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('analytics page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/analytics`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('breeding page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/breeding`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('lineage page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/lineage`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('settings/profile page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/settings/profile`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })

  test('settings/farm page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${PAGES_URL}/settings/farm`)
    await page.waitForURL(`${PAGES_URL}/login`, { timeout: 20_000 })
    expect(page.url()).toContain('/login')
  })
})

// ─── Frontend: Public Pages ────────────────────────────────────────────────────

test.describe('Frontend - Public Pages', () => {
  test('join page loads without redirecting to login', async ({ page }) => {
    await page.goto(`${PAGES_URL}/join?code=sample-invite-code`)
    await page.waitForLoadState('load')
    // Join page is public - should not redirect to login
    expect(page.url()).toContain('/join')
  })

  test('join page shows invite code UI', async ({ page }) => {
    await page.goto(`${PAGES_URL}/join?code=sample-invite-code`)
    await page.waitForLoadState('load')
    // Should show something related to joining / invite
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(0)
  })

  test('login page stays on /login URL', async ({ page }) => {
    await page.goto(`${PAGES_URL}/login`)
    await page.waitForLoadState('load')
    expect(page.url()).toContain('/login')
    expect(page.url()).not.toContain('/dashboard')
  })
})

// ─── API: Machinery CRUD Route Coverage ──────────────────────────────────────

test.describe('API - Machinery Route Coverage', () => {
  test('all machinery HTTP methods return 401 without auth', async ({ request }) => {
    // GET list
    expect((await request.get(`${API_URL}/api/machinery`)).status()).toBe(401)
    // POST create
    expect((await request.post(`${API_URL}/api/machinery`, { data: {} })).status()).toBe(401)
    // GET single
    expect((await request.get(`${API_URL}/api/machinery/1`)).status()).toBe(401)
    // PUT update
    expect((await request.put(`${API_URL}/api/machinery/1`, { data: {} })).status()).toBe(401)
    // DELETE
    expect((await request.delete(`${API_URL}/api/machinery/1`)).status()).toBe(401)
    // GET events
    expect((await request.get(`${API_URL}/api/machinery/1/events`)).status()).toBe(401)
    // POST event
    expect((await request.post(`${API_URL}/api/machinery/1/events`, { data: {} })).status()).toBe(401)
  })
})

// ─── API: Workers Route Coverage ─────────────────────────────────────────────

test.describe('API - Workers Route Coverage', () => {
  test('all workers HTTP methods return 401 without auth', async ({ request }) => {
    expect((await request.get(`${API_URL}/api/workers`)).status()).toBe(401)
    expect((await request.post(`${API_URL}/api/workers`, { data: {} })).status()).toBe(401)
    expect((await request.put(`${API_URL}/api/workers/1`, { data: {} })).status()).toBe(401)
    expect((await request.delete(`${API_URL}/api/workers/1`)).status()).toBe(401)
    expect((await request.get(`${API_URL}/api/workers/1/payroll`)).status()).toBe(401)
    expect((await request.post(`${API_URL}/api/workers/1/payroll`, { data: {} })).status()).toBe(401)
  })
})

// ─── API: Supplies Route Coverage ────────────────────────────────────────────

test.describe('API - Supplies Route Coverage', () => {
  test('all supplies HTTP methods return 401 without auth', async ({ request }) => {
    expect((await request.get(`${API_URL}/api/supplies`)).status()).toBe(401)
    expect((await request.post(`${API_URL}/api/supplies`, { data: {} })).status()).toBe(401)
    expect((await request.put(`${API_URL}/api/supplies/1`, { data: {} })).status()).toBe(401)
    expect((await request.delete(`${API_URL}/api/supplies/1`)).status()).toBe(401)
  })
})

// ─── API: Analytics Route Coverage ───────────────────────────────────────────

test.describe('API - Analytics Route Coverage', () => {
  test('all analytics endpoints return 401 without auth', async ({ request }) => {
    expect((await request.get(`${API_URL}/api/analytics/dashboard`)).status()).toBe(401)
    expect((await request.get(`${API_URL}/api/analytics/herd`)).status()).toBe(401)
    expect((await request.get(`${API_URL}/api/analytics/breeding`)).status()).toBe(401)
    expect((await request.get(`${API_URL}/api/analytics/financial`)).status()).toBe(401)
    expect((await request.get(`${API_URL}/api/analytics/trends`)).status()).toBe(401)
  })
})

// ─── API: Field Timeline Route ────────────────────────────────────────────────

test.describe('API - Field Timeline', () => {
  test('field timeline requires authentication', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/fields/1/timeline`)
    expect(resp.status()).toBe(401)
    const data = await resp.json()
    expect(data.error).toBe('Unauthorized')
  })

  test('field timeline with filter requires authentication', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/fields/1/timeline?source=supply`)
    expect(resp.status()).toBe(401)
  })
})
