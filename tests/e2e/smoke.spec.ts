import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Electron smoke test: the built app (out/main/index.js) launches with a fresh data folder,
 * opens its window, and shows the first-run setup wizard.
 */
let app: ElectronApplication | undefined
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'autbot-e2e-'))
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

test('the window opens on the first-run wizard', async () => {
  const win = await app!.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await expect.poll(() => win.title(), { timeout: 30_000 }).toContain('Autbot SEO Studio')

  // the main process uses the temp data folder we gave it
  const dataDir = await app!.evaluate(({ app: a }) => a.getPath('userData'))
  expect(dataDir).toBe(userData)

  // first run: step 1 of the setup wizard
  await expect(win.getByText('Your business', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
})
