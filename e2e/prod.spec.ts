import { expect, test as base, request as plainRequest } from '@playwright/test'

/**
 * Read-only production smoke tests. They never sign in or write data.
 *   npx playwright test --config=playwright.prod.config.ts
 *
 * The site sits behind Cloudflare Access. With CF_ACCESS_CLIENT_ID/SECRET (a service token) the tests send
 * it — only to the app's own origin — and also check that requests without it are stopped at Access.
 */
const ACCESS = process.env.CF_ACCESS_CLIENT_ID
  ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET || '' }
  : null

const test = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: ACCESS ?? {} })
    await use(ctx)
    await ctx.dispose()
  },
  context: async ({ context, baseURL }, use) => {
    if (ACCESS) {
      await context.route(`${new URL(baseURL!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), ...ACCESS } }))
    }
    await use(context)
  },
})

test('only family members get in: Cloudflare Access guards the site', async ({ baseURL }) => {
  test.skip(!ACCESS, 'CF_ACCESS_CLIENT_ID not set')
  const outsider = await plainRequest.newContext({ baseURL })
  for (const path of ['/', '/dashboard', '/api/health-check']) {
    const r = await outsider.get(path, { maxRedirects: 0 })
    expect(r.status(), path).toBe(302)
    expect(r.headers()['location'], path).toMatch(/cloudflareaccess\.com/)
  }
  // The old workers.dev address is switched off, so there is no way round Access.
  const old = await outsider.get('https://cattle-management-api.andrewskea-as.workers.dev/api/health-check', { maxRedirects: 0 }).catch(() => null)
  expect(old?.status() === 200 && (await old.text()).includes('"status":"ok"')).toBe(false)
  await outsider.dispose()
})

test('API is up, in production mode, and protected', async ({ request }) => {
  const health = await (await request.get('/api/health-check')).json()
  expect(health.status).toBe('ok')
  expect(health.environment).toBe('production')
  expect((await request.get('/api/animals')).status()).toBe(401)
  expect((await request.get('/api/finance/summary')).status()).toBe(401)
  expect((await request.post('/api/auth/dev-login', { data: { email: 'x@example.com' } })).status()).toBe(404)
  expect((await request.post('/api/farms', { headers: { Origin: 'https://evil.example' }, data: { name: 'x' } })).status()).toBe(403)
})

test('Google sign-in redirect is accepted by Google', async ({ request }) => {
  const start = await request.get('/api/auth/google?next=/dashboard', { maxRedirects: 0 })
  expect(start.status()).toBe(302)
  const location = start.headers()['location']
  expect(location).toContain('accounts.google.com')
  expect(location).toContain(encodeURIComponent('/api/auth/callback/google'))
  expect(start.headers()['set-cookie']).toContain('oauth_state=')
  // An unregistered redirect_uri or client id makes Google answer with an error page.
  // (A fresh context, so the Access service token is never sent to Google.)
  const google = await (await plainRequest.newContext()).get(location, { maxRedirects: 0 })
  expect(google.status(), 'Google rejected the OAuth request').toBeLessThan(400)
  expect(await google.text()).not.toMatch(/redirect_uri_mismatch|invalid_client|deleted_client/)
})

test('OAuth callback without state is rejected safely', async ({ request }) => {
  const r = await request.get('/api/auth/callback/google?code=fake&state=fake', { maxRedirects: 0 })
  expect(r.status()).toBe(302)
  expect(r.headers()['location']).toMatch(/^\/login\?error=/)
})

test('public pages render without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(m.text()) })
  page.on('requestfailed', (r) => { if (!r.failure()?.errorText.includes('ERR_ABORTED')) errors.push(`failed ${r.url()} ${r.failure()?.errorText}`) })

  const res = await page.goto('/')
  expect(res?.headers()['x-frame-options']).toBe('DENY')
  await expect(page.getByRole('heading', { name: /The whole farm/ })).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible()
  await expect(page.getByText('Local development sign-in')).toHaveCount(0)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/)
  await page.goto('/livestock/view?id=1')
  await expect(page).toHaveURL(/\/login/)
  expect(errors).toEqual([])
  const nf = await page.goto('/definitely-not-a-page')
  expect(nf?.status()).toBe(404)
  await expect(page.getByText('This gate’s shut')).toBeVisible()
})
