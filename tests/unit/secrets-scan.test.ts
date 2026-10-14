import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import extract from 'extract-zip'
import {
  setupTestEnv,
  connectMock,
  waitForIdle,
  stubWordPress,
  makeContent,
  jsonResponse,
  httpGet,
  walk,
  SITE_URL,
  type TestEnv,
  type FetchCall
} from './helpers'
import { dispatch, type ApiResult } from '../../src/main/ipc'
import { registerAllHandlers } from '../../src/main/jobs/handlers'
import { saveConnection, listConnections } from '../../src/main/providers/registry'
import { backup, exportLogs } from '../../src/main/backup'
import { exportZip } from '../../src/main/publish/export'
import { DB_FILENAME, rawDb } from '../../src/main/db'
import { SECRETS_FILENAME, getSecret, resetSecretCache } from '../../src/main/secrets'
import { log, logFile } from '../../src/main/logger'
import { gscConnected } from '../../src/main/indexing/gsc'
import type { SiteRow } from '../../src/main/sites'

/** Distinctive values that do NOT match the logger's generic key patterns, so only real handling keeps them out. */
const S = {
  openai: 'sk-proj-SECRETopenai000111aaa',
  anthropic: 'sk-ant-api03-SECRETanthropic222',
  gemini: 'AIzaSECRETgemini3333333333333333',
  xai: 'xai-SECRETgrok5555555555',
  openrouter: 'sk-or-v1-SECRETrouter444444',
  meta: 'MUSESECRETmeta66666666',
  custom: 'CUSTOMSECRETendpoint7777',
  wordpress: 'wpAp pPas sSEC RET8 888X',
  googleClientSecret: 'GOCSPX-SECRETclient9999',
  googleAccess: 'ya29.SECRETaccess0000xyz',
  googleRefresh: '1//0gSECRETrefresh1111xyz',
  dataforseo: 'dfsSECRETpass2222zz',
  serper: 'serperSECRET3333zz',
  brave: 'braveSECRET4444zz',
  bing: 'bingSECRET5555zz'
}
const DFS_LOGIN = 'owner@greenlawns.example'

/** Every form a secret could leak in. */
const NEEDLES: [string, string][] = [
  ...Object.entries(S),
  ['wordpress (no spaces)', S.wordpress.replace(/\s+/g, '')],
  [
    'wordpress basic auth',
    Buffer.from(`autbot-writer:${S.wordpress.replace(/\s+/g, '')}`).toString('base64')
  ],
  ['dataforseo basic auth', Buffer.from(`${DFS_LOGIN}:${S.dataforseo}`).toString('base64')]
]

let env: TestEnv
let site: SiteRow
const scanned: string[] = []

function data<T>(r: ApiResult): T {
  if (!r.ok) throw new Error(`IPC failed: ${r.error}`)
  return r.data as T
}

function leaks(buf: Buffer): string[] {
  const out: string[] = []
  for (const [name, needle] of NEEDLES) {
    if (buf.includes(Buffer.from(needle, 'utf8')) || buf.includes(Buffer.from(needle, 'utf16le')))
      out.push(name)
  }
  return out
}

function scanFiles(files: string[], label: string): Record<string, string[]> {
  const found: Record<string, string[]> = {}
  for (const f of files) {
    scanned.push(`${label}:${basename(f)}`)
    const l = leaks(readFileSync(f))
    if (l.length) found[`${label}:${f}`] = l
  }
  return found
}

/** An unfriendly API that echoes the request's headers back in its error body. */
const echo = (c: FetchCall) =>
  new Response(`Unauthorized. You sent ${JSON.stringify(c.headers)} to ${c.url} with ${c.body ?? ''}`, {
    status: 400,
    headers: { 'content-type': 'text/plain' }
  })

beforeAll(async () => {
  env = setupTestEnv()
  registerAllHandlers()
  await connectMock()
  stubWordPress(env.fetch)
  env.fetch.on(() => true, echo) // anything else: hostile echo
  stubWordPress(env.fetch) // WordPress routes win over the echo
  env.fetch.on('https://oauth2.googleapis.com/token', () =>
    jsonResponse({
      access_token: S.googleAccess,
      refresh_token: S.googleRefresh,
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/webmasters'
    })
  )
  env.fetch.on('https://api.dataforseo.com/v3/appendix/user_data', () =>
    jsonResponse({ tasks: [{ result: [{ money: { balance: 12.5 } }] }] })
  )
  env.fetch.on('https://google.serper.dev/search', (c) =>
    c.body?.includes('"q":"test"') ? jsonResponse({ organic: [] }) : echo(c)
  )

  site = data<SiteRow>(await dispatch('sites.create', { name: 'Green Lawns Co', url: SITE_URL }))
  await waitForIdle()
})

afterAll(() => env.cleanup())

describe('no secret appears in the DB, logs, exports or backups', () => {
  it('saves every kind of secret through the real code paths', async () => {
    // AI providers (API keys)
    for (const type of ['openai', 'anthropic', 'gemini', 'xai', 'openrouter', 'meta'] as const) {
      const r = await dispatch('providers.save', { type, apiKey: S[type] })
      expect(r.ok, type).toBe(true) // saved, even though the (echoing) test fails
    }
    const customId = saveConnection({
      type: 'custom',
      apiKey: S.custom,
      baseUrl: 'https://llm.internal.example/v1',
      extra: { name: 'Office server' }
    })
    await dispatch('providers.test', { id: customId })
    expect(listConnections().filter((c) => c.hasKey)).toHaveLength(7)

    // WordPress application password
    const wp = await dispatch('wp.save', {
      siteId: site.id,
      url: SITE_URL,
      user: 'autbot-writer',
      password: S.wordpress
    })
    expect(wp.ok).toBe(true)

    // Google OAuth client secret + tokens via the real loopback flow
    data(
      await dispatch('google.setClient', {
        clientId: '1234567890-abcdef.apps.googleusercontent.com',
        clientSecret: S.googleClientSecret
      })
    )
    env.onOpenExternal = async (url) => {
      const u = new URL(url)
      const redirect = u.searchParams.get('redirect_uri')!
      await httpGet(`${redirect}?code=auth-code-123&state=${u.searchParams.get('state')}`)
    }
    const props = await dispatch('google.connect', undefined) // listProperties is echoed as an error, which gets logged
    expect(props.ok).toBe(false)
    expect(gscConnected()).toBe(true)
    expect(env.opened[0]).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/)

    // Data sources
    expect(
      data<{ ok: boolean }>(
        await dispatch('ds.save', { kind: 'dataforseo', login: DFS_LOGIN, secret: S.dataforseo })
      ).ok
    ).toBe(true)
    expect(data<{ ok: boolean }>(await dispatch('ds.save', { kind: 'serper', secret: S.serper })).ok).toBe(
      true
    )
    await dispatch('ds.save', { kind: 'brave', secret: S.brave })
    await dispatch('ds.save', { kind: 'bing', secret: S.bing })
    await dispatch('settings.set', { key: 'serpProvider', value: 'serper' })

    // all retrievable again (round trip through the fake OS cipher, with a cold cache)
    resetSecretCache()
    expect(getSecret('provider:openai')).toBe(S.openai)
    expect(getSecret('wordpress:' + site.id)).toBe(S.wordpress.replace(/\s+/g, ''))
    expect(getSecret('datasource:dataforseo')).toBe(S.dataforseo)
  })

  it('runs activity that logs (research with failing data sources, failed requests)', async () => {
    const id = data<number>(await dispatch('content.create', { siteId: site.id, topic: 'lawn aeration' }))
    await waitForIdle()
    await dispatch('google.properties', undefined)
    await dispatch('providers.test', { id: 'openai' })
    log.info('Debug dump', { headers: { authorization: `Bearer ${S.openai}` }, password: S.wordpress })
    const raw = readFileSync(logFile(), 'utf8')
    // the failures really were logged (so the scan below is meaningful)
    expect(raw).toMatch(/DataForSEO volume failed|SERP lookup failed/)
    expect(raw).toMatch(/IPC google\.properties failed/)
    expect(raw).toContain('[REDACTED]')
    // make an export and a backup to scan
    const c = makeContent(site.id, { title: 'Lawn aeration', slug: 'lawn-aeration' })
    await exportZip(c.id, env.tmp('export.zip'))
    await backup(env.tmp('backup.zip'))
    exportLogs(env.tmp('exported-logs.txt'))
    expect(id).toBeGreaterThan(0)
  })

  it('the database (file, WAL and every table) has no secrets', () => {
    rawDb().pragma('wal_checkpoint(FULL)')
    const files = walk(env.dataDir).filter((f) => basename(f).startsWith(DB_FILENAME))
    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(scanFiles(files, 'db')).toEqual({})
    // and the logical content, in case of compression or encoding in the file
    const tables = rawDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string
    }[]
    const dump = tables
      .map((t) => JSON.stringify(rawDb().prepare(`SELECT * FROM "${t.name}"`).all()))
      .join('\n')
    expect(leaks(Buffer.from(dump))).toEqual([])
  })

  it('the logs (and exported logs) have no secrets', () => {
    const logs = walk(join(env.dataDir, 'logs'))
    expect(logs.length).toBeGreaterThan(0)
    expect(scanFiles([...logs, env.tmp('exported-logs.txt')], 'logs')).toEqual({})
  })

  it('every other file in the data folder has no secrets; the secrets file holds only ciphertext', () => {
    const files = walk(env.dataDir)
    expect(scanFiles(files, 'data')).toEqual({})
    expect(existsSync(join(env.dataDir, SECRETS_FILENAME))).toBe(true)
  })

  it('the export zip has no secrets', async () => {
    const dir = env.tmp('export-unzipped')
    await extract(env.tmp('export.zip'), { dir })
    const files = walk(dir)
    expect(files.some((f) => f.endsWith('index.html'))).toBe(true)
    expect(scanFiles([env.tmp('export.zip'), ...files], 'export')).toEqual({})
  })

  it('the backup zip has no secrets and does not include the secrets file', async () => {
    const dir = env.tmp('backup-unzipped')
    await extract(env.tmp('backup.zip'), { dir })
    const files = walk(dir)
    expect(files.map((f) => basename(f))).toContain(DB_FILENAME)
    expect(files.map((f) => basename(f))).not.toContain(SECRETS_FILENAME)
    expect(scanFiles([env.tmp('backup.zip'), ...files], 'backup')).toEqual({})
  })

  it('scanned a meaningful set of files', () => {
    expect(scanned.length).toBeGreaterThan(8)
  })
})
