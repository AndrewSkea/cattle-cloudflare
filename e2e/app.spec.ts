import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * End-to-end user flows against the local worker (seeded with the farm's real 2026-01 data:
 * 149 cattle, owner andrewskea.as@gmail.com). Tests run in order and build on each other.
 */
test.describe.configure({ mode: 'serial' })
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const OWNER = 'andrewskea.as@gmail.com'

async function signIn(page: Page, email: string, extra: Record<string, string> = {}) {
  const res = await page.request.post('/api/auth/dev-login', { data: { email, ...extra } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { redirect: string; farmId: number | null }
}

async function newUserPage(browser: Browser, email: string, extra: Record<string, string> = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await ctx.newPage()
  const r = await signIn(page, email, extra)
  return { page, ctx, redirect: r.redirect }
}

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`) })
  return errors
}

/** Exact label match, tolerating the required-field asterisk. */
const L = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\*?$`)

const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name })

async function pick(page: Page, label: string, query: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByRole('textbox', { name: `Search ${label.toLowerCase()}` }).fill(query)
  await page.keyboard.press('Enter')
}

let page: Page
let errors: string[]

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] } as any)
  errors = trackErrors(page)
})

test.afterAll(async () => {
  expect(errors, 'no page errors or 5xx responses during the run').toEqual([])
})

test('public pages and security guards', async ({ request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /The whole farm/ })).toBeVisible()
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible()

  expect((await request.get('/api/animals')).status()).toBe(401)
  const csrf = await request.post('/api/tasks', { headers: { Origin: 'https://evil.example' }, data: { title: 'x' } })
  expect(csrf.status()).toBe(403)
  expect((await request.get('/api/nope')).status()).toBe(401)
})

test('owner sees the dashboard with the imported herd', async () => {
  await signIn(page, OWNER)
  await page.goto('/dashboard')
  await expect(page.getByText('Animals on farm')).toBeVisible()
  await expect(page.getByText('149', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/pregnancies past their due date/)).toBeVisible()
  await expect(page.getByText('Cows', { exact: true })).toBeVisible()
})

test('livestock list filters and the family tree', async () => {
  await page.goto('/livestock')
  await expect(page.getByText('149 on farm')).toBeVisible()
  await page.getByRole('button', { name: /^Heifers/ }).click()
  await expect(page.getByText('Showing 60 of 60')).toBeVisible()
  await page.getByRole('button', { name: /^Heifers/ }).click()
  await page.getByRole('textbox', { name: 'Search animals' }).fill('UK523801-200788')
  await expect(page.getByText('Showing 1 of 1')).toBeVisible()
  await page.getByRole('link', { name: /^13-1/ }).click()
  await expect(page.getByRole('heading', { name: '13-1' })).toBeVisible()
  await page.getByRole('tab', { name: /Family/ }).click()
  await expect(page.getByRole('heading', { name: 'Pedigree' })).toBeVisible()
  await expect(page.getByRole('link', { name: '22-6', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Family performance' })).toBeVisible()
  await page.getByRole('link', { name: '22-6', exact: true }).click()
  await expect(page.getByRole('heading', { name: '22-6' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Dam 13-1/ })).toBeVisible()
})

test('add and edit an animal; duplicate tags are rejected', async () => {
  await page.goto('/livestock')
  await page.getByRole('button', { name: 'Add animal', exact: true }).click()
  const d = dialog(page, 'Add animal')
  await d.getByLabel(L('Official tag / ID')).fill('UK999999-000001')
  await d.getByLabel(L('Management tag')).fill('T-1')
  await d.getByLabel(L('Breed')).fill('Hereford')
  await d.getByLabel(L('Date of birth')).fill('2024-03-01')
  await pick(page, 'Dam (mother)', '13-1')
  await page.getByRole('button', { name: 'Add animal', exact: true }).last().click()
  await expect(page).toHaveURL(/livestock\/view\?id=\d+/)
  await expect(page.getByRole('heading', { name: 'T-1' })).toBeVisible()
  await expect(page.getByRole('link', { name: '13-1', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await dialog(page, /^Edit /).getByLabel(L('Name')).fill('Daisy')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Daisy').first()).toBeVisible()

  await page.goto('/livestock')
  await page.getByRole('button', { name: 'Add animal', exact: true }).click()
  await dialog(page, 'Add animal').getByLabel(L('Official tag / ID')).fill('UK999999-000001')
  await page.getByRole('button', { name: 'Add animal', exact: true }).last().click()
  await expect(dialog(page, 'Add animal').getByRole('alert')).toContainText('already used on this farm')
  await page.keyboard.press('Escape')
})

test('health record with cost flows into finances; sale is blocked by withdrawal', async () => {
  await page.goto('/livestock')
  await page.getByRole('textbox', { name: 'Search animals' }).fill('T-1')
  await page.getByRole('link', { name: /^T-1/ }).click()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Health / vaccination', exact: true }).click()
  const d = dialog(page, 'Add health record')
  await d.getByLabel(L('What was done')).fill('BVD vaccine')
  await d.getByLabel(L('Product')).fill('Bovilis BVD')
  const until = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
  await d.getByLabel(L('Meat withdrawal until')).fill(until)
  await d.getByLabel(L('Cost')).fill('12.50')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Health record added')).toBeVisible()
  await expect(page.getByText(/Withdrawal until/)).toBeVisible()

  // Sale during withdrawal needs explicit confirmation
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Record sale or death', exact: true }).click()
  const exit = dialog(page, /Record sale or death/)
  await exit.getByLabel(L('Price')).fill('950')
  await exit.getByLabel(L('Weight')).fill('400')
  await exit.getByLabel(L('Buyer / market')).fill('Lanark Mart')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Withdrawal period still active' })).toBeVisible()
  await page.getByRole('button', { name: 'Record sale', exact: true }).click()
  await expect(page.getByText(/^Sold/).first()).toBeVisible()

  await page.goto('/finance')
  await expect(page.getByText('Sale of UK999999-000001')).toBeVisible()
  await expect(page.getByText('BVD vaccine — UK999999-000001')).toBeVisible()
  await expect(page.getByText('+£950.00')).toBeVisible()
})

test('recording a birth registers the calf and closes the pregnancy', async () => {
  await page.goto('/breeding')
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: '23-7', exact: true }) })
  await row.getByRole('button', { name: 'Born', exact: true }).click()
  const d = dialog(page, 'Record a birth')
  await d.getByRole('radio', { name: 'Female', exact: true }).click()
  await d.getByLabel(L('Tag / ID')).fill('UK999999-000002')
  await d.getByLabel(L('Management tag')).fill('C-1')
  await d.getByLabel(L('Birth weight')).fill('42')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Birth recorded')).toBeVisible()
  await expect(page.getByRole('row').filter({ has: page.getByRole('link', { name: '23-7', exact: true }) })).toHaveCount(0)

  await page.goto('/livestock')
  await page.getByRole('textbox', { name: 'Search animals' }).fill('C-1')
  await page.getByRole('link', { name: /^C-1/ }).click()
  await expect(page.getByRole('heading', { name: 'C-1' })).toBeVisible()
  await expect(page.getByText('Calf', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '23-7', exact: true })).toBeVisible()
  await expect(page.getByText('42 kg').first()).toBeVisible()
})

test('land: add and draw fields, pin a building, move animals', async () => {
  await page.goto('/land')
  await page.getByRole('button', { name: 'Add without map', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Field', exact: true }).click()
  await dialog(page, 'New field').getByLabel(L('Field name')).fill('North Park')
  await dialog(page, 'New field').getByLabel(L('Area (ha)')).fill('4.2')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: /North Park/ }).first()).toBeVisible()

  // Draw a field by clicking corners on the map
  await page.getByRole('button', { name: 'Draw field', exact: true }).click()
  const map = page.locator('.leaflet-container')
  const box = (await map.boundingBox())!
  const pts = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]
  for (const [x, y] of pts) { await page.mouse.click(box.x + box.width * x, box.y + box.height * y); await page.waitForTimeout(150) }
  await expect(dialog(page, 'New field')).toBeVisible()
  await expect(dialog(page, 'New field').getByText('Measured from the map')).toBeVisible()
  await dialog(page, 'New field').getByLabel(L('Field name')).fill('Drawn Field')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.leaflet-tooltip', { hasText: 'Drawn Field' })).toBeVisible()

  await page.getByRole('button', { name: 'Add building', exact: true }).click()
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await dialog(page, 'New building or point').getByLabel(L('Name')).fill('Cattle shed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Building added')).toBeVisible()

  await page.goto('/livestock')
  await page.getByRole('textbox', { name: 'Search animals' }).fill('UK523801-200788')
  await page.getByRole('checkbox', { name: 'Select UK523801-200788' }).check()
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await dialog(page, 'Move 1 animal').getByLabel(L('To field')).selectOption({ label: 'North Park' })
  await page.getByRole('button', { name: 'Move', exact: true }).last().click()
  await expect(page.getByText('Moved 1 animal')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'North Park' })).toBeVisible()
})

test('equipment service schedule and logging', async () => {
  await page.goto('/equipment')
  await page.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
  const d = dialog(page, 'Add equipment')
  await d.getByLabel(L('Name')).fill('Test Tractor')
  await d.getByLabel(L('Current hours / mileage')).fill('1000')
  await d.getByLabel(L('Service every (hours)')).fill('250')
  await d.getByLabel(L('Hours at last service')).fill('700')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Test Tractor' })).toBeVisible()
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Log service', exact: true }).click()
  const log = dialog(page, /Log · Test Tractor/)
  await log.getByLabel(L('Hours / mileage reading')).fill('1005')
  await log.getByLabel(L('Cost')).fill('200')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Serviced', { exact: true })).toBeVisible()
  await expect(page.getByText('0 of 250 h')).toBeVisible()
  await expect(page.getByText('next at 1,255 h')).toBeVisible()
})

test('inventory stock use and low-stock warning', async () => {
  await page.goto('/inventory')
  await page.getByRole('button', { name: 'Add item', exact: true }).first().click()
  const d = dialog(page, 'Add stock item')
  await d.getByLabel(L('Name')).fill('Wormer')
  await d.getByLabel(L('Category')).selectOption('medicine')
  await d.getByLabel(L('Unit')).fill('doses')
  await d.getByLabel(L('Quantity in stock')).fill('10')
  await d.getByLabel(L('Reorder when below')).fill('5')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Use Wormer', exact: true }).click()
  await dialog(page, 'Wormer').getByLabel(L('Amount (doses)')).fill('6')
  await page.getByRole('button', { name: 'Update stock', exact: true }).click()
  await expect(page.getByText('Reorder at 5')).toBeVisible()
  await page.getByRole('button', { name: 'Use Wormer', exact: true }).click()
  await dialog(page, 'Wormer').getByLabel(L('Amount (doses)')).fill('50')
  await page.getByRole('button', { name: 'Update stock', exact: true }).click()
  await expect(dialog(page, 'Wormer').getByRole('alert')).toContainText('Only 4 doses in stock')
  await page.keyboard.press('Escape')
})

test('tasks: create, see overdue, complete', async () => {
  await page.goto('/tasks')
  await page.getByRole('button', { name: 'New task', exact: true }).first().click()
  const d = dialog(page, 'New task')
  await d.getByLabel(L('Task')).fill('Check water troughs')
  await d.getByLabel(L('Due date')).fill(new Date(Date.now() - 86400000).toISOString().slice(0, 10))
  await d.getByLabel(L('Priority')).selectOption('high')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/Overdue ·/)).toBeVisible()
  await page.getByRole('button', { name: 'Complete task', exact: true }).first().click()
  await expect(page.getByText(/^Done \d/)).toBeVisible()
})

test('finance: add an expense, totals update, export downloads', async () => {
  await page.goto('/finance')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Money out', exact: true }).click()
  const d = dialog(page, 'Record expense')
  await d.getByLabel(L('Amount')).fill('100')
  await d.getByLabel(L('Category')).selectOption('feed')
  await d.getByLabel(L('Description')).fill('Barley')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Transaction added')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Barley' })).toBeVisible()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  expect((await dl).suggestedFilename()).toMatch(/^transactions-.*\.csv$/)
})

test('team: invite a worker; workers cannot see finances; viewers are read-only', async ({ browser }) => {
  await page.goto('/team')
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click()
  await page.getByRole('button', { name: 'Create & copy link', exact: true }).click()
  await expect(page.getByText('Open invite links')).toBeVisible()
  const invites = await (await page.request.get('/api/farm/invites')).json()
  const code = invites.data[0].code as string

  const preview = await browser.newPage()
  await preview.goto(`/join?code=${code}`)
  await expect(preview.getByRole('heading', { name: 'Home Farm' })).toBeVisible()
  await preview.close()

  const { page: w, ctx } = await newUserPage(browser, 'worker@example.com', { name: 'Wendy Worker', invite: code })
  const wErrors = trackErrors(w)
  await w.goto('/dashboard')
  await expect(w.getByText('Animals on farm')).toBeVisible()
  await expect(w.getByRole('link', { name: 'Finances', exact: true })).toHaveCount(0)
  await w.goto('/finance')
  await expect(w.getByText('Finances are for managers and owners')).toBeVisible()
  expect((await w.request.get('/api/finance/summary')).status()).toBe(403)
  expect((await w.request.delete('/api/animals/5')).status()).toBe(403)
  await w.goto('/livestock/view?id=5')
  await w.getByRole('button', { name: 'Record', exact: true }).click()
  await w.getByRole('menuitem', { name: 'Weight', exact: true }).click()
  await dialog(w, 'Record weight').getByLabel(L('Weight')).fill('615')
  await w.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(w.getByText('Weight saved')).toBeVisible()
  await w.getByRole('button', { name: 'More actions', exact: true }).click()
  await expect(w.getByRole('menuitem', { name: 'Delete animal', exact: true })).toHaveCount(0)

  // Owner downgrades the worker to viewer
  await page.reload()
  await page.getByRole('combobox', { name: 'Role for Wendy Worker' }).selectOption('viewer')
  await expect(page.getByText('Role updated')).toBeVisible()
  await w.goto('/livestock')
  await expect(w.getByRole('heading', { name: 'Animals' })).toBeVisible()
  await expect(w.getByRole('button', { name: 'Add animal', exact: true })).toHaveCount(0)
  expect((await w.request.post('/api/weights', { data: { animalId: 5, date: '2026-10-01', weightKg: 600 } })).status()).toBe(403)
  expect(wErrors).toEqual([])
  await ctx.close()
})

test('settings and profile', async () => {
  await page.goto('/settings')
  await page.getByLabel(L('Farm name')).fill('Hillside Farm')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByText('Farm settings saved')).toBeVisible()
  await expect(page.getByText('Hillside Farm').first()).toBeVisible()

  await page.goto('/profile')
  await page.getByLabel(L('Display name')).fill('Andrew Skea')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Profile saved')).toBeVisible()
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Andrew/ })).toBeVisible()
})

test('a brand-new user creates their own farm and cannot see anyone else’s', async ({ browser }) => {
  const { page: n, ctx, redirect } = await newUserPage(browser, 'newbie@example.com', { name: 'New Farmer' })
  expect(redirect).toBe('/onboarding')
  await n.goto('/dashboard')
  await expect(n).toHaveURL(/onboarding/)
  await n.getByRole('button', { name: /Create a farm/ }).click()
  await n.getByLabel(L('Farm name')).fill('Newbie Farm')
  await n.getByRole('button', { name: /Sheep/ }).click()
  await n.getByRole('button', { name: 'Create farm', exact: true }).click()
  await expect(n).toHaveURL(/dashboard/)
  await expect(n.getByText('Newbie Farm').first()).toBeVisible()
  await expect(n.getByText('No animals yet')).toBeVisible()
  const animals = await (await n.request.get('/api/animals')).json()
  expect(animals.data).toHaveLength(0)
  expect((await n.request.get('/api/animals/1')).status()).toBe(404)
  expect((await n.request.get('/api/animals/1/family')).status()).toBe(404)
  await ctx.close()
})

test('calendar, reports, families, health and quick find render', async () => {
  for (const [path, text] of [['/calendar', 'Calendar'], ['/reports', 'Head count'], ['/families', 'Families'], ['/health', 'Health'], ['/equipment', 'Equipment']] as const) {
    await page.goto(path)
    await expect(page.getByText(text).first()).toBeVisible()
  }
  await page.goto('/dashboard')
  await expect(page.getByText('Animals on farm')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByPlaceholder(/Find an animal/).fill('22-6')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '22-6' })).toBeVisible()
})
