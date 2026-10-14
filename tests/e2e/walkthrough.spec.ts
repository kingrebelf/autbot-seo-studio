import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * End-to-end walkthrough with the dev-only Mock provider: setup wizard, then Mode A from a
 * topic to "Ready for review" in the Content Editor. Screenshots go to test-results/walkthrough.
 */
let app: ElectronApplication | undefined
let userData: string
const shots = join(__dirname, '..', '..', 'test-results', 'walkthrough')

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'autbot-walk-'))
  mkdirSync(shots, { recursive: true })
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE' && k !== 'ELECTRON_RENDERER_URL') env[k] = v
  app = await electron.launch({
    args: [
      join(__dirname, '..', '..', 'out', 'main', 'index.js'),
      ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
    ],
    env: { ...env, AUTBOT_USER_DATA: userData, AUTBOT_DEV: '1', NODE_ENV: 'production' },
    timeout: 60_000
  })
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
})

const shot = (win: Page, name: string) => win.screenshot({ path: join(shots, `${name}.png`) })

test('setup wizard and Mode A reach Ready for review', async () => {
  test.setTimeout(240_000)
  const win = await app!.firstWindow()
  const errors: string[] = []
  win.on('pageerror', (e) => errors.push(e.message))
  await win.setViewportSize({ width: 1400, height: 900 })

  // Step 1: business profile
  await expect(win.getByRole('heading', { name: 'Your business' })).toBeVisible({ timeout: 30_000 })
  await win.getByLabel('Business name').fill('Green Lawn Co')
  await win.getByLabel('Website address').fill('https://example.com')
  await win.getByLabel('What you sell').fill('Lawn care and aeration for homeowners')
  await shot(win, '01-setup-business')
  await win.getByRole('button', { name: /Continue/ }).click()

  // Step 2: connect the Mock provider
  const mock = win
    .getByText('Mock provider (dev only)')
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await mock.getByRole('button', { name: /Test|Save & test/ }).click()
  await expect(mock.getByText('Connected', { exact: true })).toBeVisible({ timeout: 30_000 })
  await shot(win, '02-setup-ai')
  await win.getByRole('button', { name: /Continue/ }).click()

  // Step 3: models (auto-picked), Step 4: skip, Step 5: skip
  await shot(win, '03-setup-models')
  await win.getByRole('button', { name: /Continue/ }).click()
  await win.getByRole('button', { name: 'Skip' }).click()
  await win.getByRole('button', { name: 'Skip' }).click()
  await win.getByRole('button', { name: 'Not now' }).click()

  // Home
  await expect(win.getByTestId('sidebar')).toBeVisible({ timeout: 30_000 })
  await shot(win, '04-home')

  // Mode A
  await win.getByRole('link', { name: 'New Content' }).click()
  await win.getByRole('button', { name: /I have a topic in mind/ }).click()
  await win.getByLabel('Topic, product or service').fill('spring lawn aeration')
  await shot(win, '05-new-content')
  await win.getByRole('button', { name: /Research it/ }).click()

  // Choose
  await expect(win.getByRole('button', { name: /Write the brief/ })).toBeVisible({ timeout: 60_000 })
  await shot(win, '06-research')
  await win.getByRole('button', { name: /Write the brief/ }).click()
  const anyway = win.getByRole('button', { name: 'Continue anyway' })
  if (await anyway.isVisible({ timeout: 1500 }).catch(() => false)) await anyway.click()

  // Brief
  await expect(win.getByRole('button', { name: /Write it/ })).toBeVisible({ timeout: 60_000 })
  await shot(win, '07-brief')
  await win.getByRole('button', { name: /Write it/ }).click()

  // Editor: wait for Ready for review
  await expect(win.getByText('Ready for review').first()).toBeVisible({ timeout: 120_000 })
  await win.waitForTimeout(1500)
  await shot(win, '08-editor')
  for (const tab of ['Meta', 'Links', 'Checks', 'History']) {
    await win.getByRole('tab', { name: tab }).click()
    await shot(win, `09-tab-${tab.toLowerCase()}`)
  }

  for (const [link, name] of [
    ['Content', '10-content'],
    ['Plan', '11-plan'],
    ['Keywords', '12-keywords'],
    ['Site Health', '13-health'],
    ['Images', '14-images'],
    ['Settings', '15-settings']
  ]) {
    await win.getByRole('link', { name: link, exact: true }).click()
    await win.waitForTimeout(800)
    await shot(win, name)
  }
  expect(errors).toEqual([])
})
