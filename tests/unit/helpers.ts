/**
 * Shared test harness: a fresh temp data folder, a fake (reversible, non-plaintext)
 * cipher, stubbed dialogs, an opened database, and a fetch stub so no test touches
 * the network.
 */
import { mkdtempSync, rmSync, readdirSync, statSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { request as httpRequest } from 'node:http'
import { setRuntime, type Cipher } from '../../src/main/runtime'
import { openDb, closeDb } from '../../src/main/db'
import { primeSecretRedaction, resetSecretCache } from '../../src/main/secrets'
import { setSetting } from '../../src/main/settings'
import { createSite, updateSite } from '../../src/main/sites'
import { createContent, type ContentRow } from '../../src/main/content'
import { saveWordPressPassword } from '../../src/main/publish/wordpress'
import { saveConnection, testAndRefresh } from '../../src/main/providers/registry'
import { waitForIdle } from '../../src/main/jobs/queue'
import type { BusinessProfile } from '@shared/types'

/* ------------------------------------------------------------------ cipher */

const KEY = Buffer.from('autbot-test-cipher-key-0123456789')

function xor(buf: Buffer): Buffer {
  const out = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ KEY[i % KEY.length] ^ ((i * 31) % 256)
  return out
}

/** Reversible and never contains the plaintext (unlike plain base64). */
export const fakeCipher: Cipher = {
  available: () => true,
  encrypt: (plain) => xor(Buffer.from(`ENC1:${plain}`, 'utf8')),
  decrypt: (data) => {
    const s = xor(Buffer.from(data)).toString('utf8')
    if (!s.startsWith('ENC1:')) throw new Error('bad ciphertext')
    return s.slice(5)
  }
}

/* ------------------------------------------------------------------ fetch stub */

export interface FetchCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  /** Parsed JSON body, if the body was JSON. */
  json: unknown
  bodyBytes: number
}

export type Responder = (call: FetchCall) => Response | Promise<Response> | undefined | null

export interface FetchStub {
  calls: FetchCall[]
  /** Calls that no route answered (they get a 404). */
  unmatched: FetchCall[]
  /** Add a route; later routes win over earlier ones. */
  on(
    match: string | RegExp | ((c: FetchCall) => boolean),
    respond: Responder | Record<string, unknown> | unknown[],
    method?: string
  ): void
  restore(): void
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  })
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function headersOf(h: RequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  new Headers(h as ConstructorParameters<typeof Headers>[0]).forEach((v, k) => (out[k.toLowerCase()] = v))
  return out
}

function bodyOf(b: RequestInit['body']): { text: string | null; bytes: number } {
  if (b === undefined || b === null) return { text: null, bytes: 0 }
  if (typeof b === 'string') return { text: b, bytes: Buffer.byteLength(b) }
  if (b instanceof URLSearchParams) return { text: b.toString(), bytes: b.toString().length }
  if (b instanceof Uint8Array) return { text: Buffer.from(b).toString('latin1'), bytes: b.byteLength }
  if (b instanceof ArrayBuffer) return { text: Buffer.from(b).toString('latin1'), bytes: b.byteLength }
  return { text: String(b), bytes: 0 }
}

export function installFetch(): FetchStub {
  const original = globalThis.fetch
  const routes: { test: (c: FetchCall) => boolean; respond: Responder }[] = []
  const stub: FetchStub = {
    calls: [],
    unmatched: [],
    on(match, respond, method) {
      const test =
        typeof match === 'function'
          ? match
          : (c: FetchCall) =>
              typeof match === 'string' ? c.url.startsWith(match) || c.url === match : match.test(c.url)
      const r: Responder =
        typeof respond === 'function' ? (respond as Responder) : () => jsonResponse(respond)
      routes.unshift({ test: (c) => (!method || c.method === method.toUpperCase()) && test(c), respond: r })
    },
    restore() {
      globalThis.fetch = original
    }
  }
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const b = bodyOf(init.body)
    let json: unknown = undefined
    if (b.text) {
      try {
        json = JSON.parse(b.text)
      } catch {
        /* not JSON */
      }
    }
    const call: FetchCall = {
      url,
      method: (init.method ?? 'GET').toUpperCase(),
      headers: headersOf(init.headers),
      body: b.text,
      json,
      bodyBytes: b.bytes
    }
    stub.calls.push(call)
    for (const r of routes) {
      if (!r.test(call)) continue
      const res = await r.respond(call)
      if (res) return res
    }
    stub.unmatched.push(call)
    return new Response('{"code":"not_stubbed"}', {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })
  }) as typeof fetch
  return stub
}

/* ------------------------------------------------------------------ environment */

export interface TestEnv {
  dataDir: string
  fetch: FetchStub
  broadcasts: { channel: string; payload: unknown }[]
  notifications: { title: string; body: string }[]
  opened: string[]
  /** What the next save dialog returns (null = cancel). */
  savePath: string | null
  /** What the next open dialog returns. */
  openPaths: string[]
  /** Called with every URL the app asks the OS to open. */
  onOpenExternal?: (url: string) => void | Promise<void>
  tmp(name: string): string
  cleanup(): Promise<void>
}

export function setupTestEnv(opts: { devMode?: boolean; autocomplete?: boolean } = {}): TestEnv {
  const dataDir = mkdtempSync(join(tmpdir(), 'autbot-test-'))
  const scratch = join(dataDir, '..', `${dataDir.split(/[\\/]/).pop()}-out`)
  mkdirSync(scratch, { recursive: true })
  const fetchStub = installFetch()
  const env: TestEnv = {
    dataDir,
    fetch: fetchStub,
    broadcasts: [],
    notifications: [],
    opened: [],
    savePath: null,
    openPaths: [],
    tmp: (name) => join(scratch, name),
    async cleanup() {
      try {
        await waitForIdle(30_000)
      } catch {
        /* leave it */
      }
      closeDb()
      resetSecretCache()
      fetchStub.restore()
      rmSync(dataDir, { recursive: true, force: true })
      rmSync(scratch, { recursive: true, force: true })
    }
  }
  setRuntime({
    dataDir,
    appVersion: '1.0.0-test',
    devMode: opts.devMode ?? true,
    cipher: fakeCipher,
    broadcast: (channel, payload) => env.broadcasts.push({ channel, payload }),
    notify: (title, body) => env.notifications.push({ title, body }),
    openExternal: async (url) => {
      env.opened.push(url)
      await env.onOpenExternal?.(url)
    },
    openPath: async () => {},
    saveDialog: async () => env.savePath,
    openDialog: async () => env.openPaths
  })
  resetSecretCache()
  openDb()
  primeSecretRedaction()
  if (!opts.autocomplete) setSetting('autocompleteEnabled', false)
  return env
}

/* ------------------------------------------------------------------ fixtures */

export const SITE_URL = 'https://greenlawns.example'

export function profile(over: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    name: 'Green Lawns Co',
    url: SITE_URL,
    whatYouSell: 'Lawn care and aeration',
    serviceArea: 'Springfield',
    customerType: 'Homeowners',
    topServices: ['Aeration', 'Mowing'],
    competitors: [],
    tone: 'Friendly',
    language: 'English',
    country: 'US',
    mustNotSay: '',
    callToAction: 'Call us for a free quote.',
    facts: '',
    ...over
  }
}

export function makeSite(over: Partial<BusinessProfile> = {}) {
  return createSite(profile(over))
}

/** Connect the dev-only Mock provider through the real code path. */
export async function connectMock(): Promise<string> {
  const id = saveConnection({ type: 'mock' })
  const r = await testAndRefresh(id)
  if (!r.ok) throw new Error(`mock provider failed: ${r.message}`)
  return id
}

/** Hit a loopback URL with a real HTTP request (the fetch global is stubbed). */
export function httpGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode ?? 0))
    })
    req.on('error', reject)
    req.end()
  })
}

/** Every file under a folder (recursively). */
export function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

export function readBytes(p: string): Buffer {
  return readFileSync(p)
}

/** Stub a WordPress site's REST API. Returns the list of created post ids. */
export function stubWordPress(
  f: FetchStub,
  base = SITE_URL,
  opts: {
    namespaces?: string[]
    posts?: Record<number, { title: string; content: string; status?: string }>
  } = {}
) {
  let nextId = 500
  const created: { id: number; type: string; body: Record<string, unknown> }[] = []
  const api = `${base}/wp-json/`
  f.on(
    (c) => c.url === api || c.url === `${base}/wp-json`,
    () => jsonResponse({ namespaces: opts.namespaces ?? ['wp/v2'] })
  )
  f.on(`${api}wp/v2/users/me`, () =>
    jsonResponse({
      id: 3,
      name: 'Autbot Writer',
      roles: ['author'],
      capabilities: { edit_posts: true, edit_pages: false }
    })
  )
  f.on(new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/(categories|tags)\\?search=`), () => jsonResponse([]))
  f.on(
    new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/(categories|tags)$`),
    (c) => jsonResponse({ id: nextId++, name: (c.json as { name: string }).name }, 201),
    'POST'
  )
  f.on(
    new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/media$`),
    () => {
      const id = nextId++
      return jsonResponse({ id, source_url: `${base}/wp-content/uploads/img-${id}.webp` }, 201)
    },
    'POST'
  )
  f.on(
    new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/media/\\d+$`),
    () => jsonResponse({ ok: true }),
    'POST'
  )
  f.on(
    new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/(posts|pages)$`),
    (c) => {
      const id = nextId++
      const type = c.url.endsWith('pages') ? 'pages' : 'posts'
      const body = c.json as Record<string, unknown>
      created.push({ id, type, body })
      return jsonResponse({ id, link: `${base}/?p=${id}`, status: body.status, meta: body.meta ?? {} }, 201)
    },
    'POST'
  )
  f.on(
    new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/(posts|pages)/(\\d+)/autosaves$`),
    () => jsonResponse({ id: nextId++ }, 201),
    'POST'
  )
  f.on(
    new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/(posts|pages)/(\\d+)\\?context=edit`),
    (c) => {
      const id = Number(c.url.match(/\/(\d+)\?/)![1])
      const p = opts.posts?.[id]
      if (!p) return jsonResponse({ code: 'rest_post_invalid_id' }, 404)
      return jsonResponse({
        id,
        status: p.status ?? 'publish',
        link: `${base}/old-post-${id}/`,
        content: { raw: p.content, rendered: p.content },
        title: { raw: p.title, rendered: p.title }
      })
    },
    'GET'
  )
  f.on(
    new RegExp(`^${api.replace(/[.]/g, '\\.')}wp/v2/(posts|pages)\\?per_page`),
    () => jsonResponse([], 200, { 'x-wp-totalpages': '1' }),
    'GET'
  )
  return { created }
}

export { waitForIdle }

/* ------------------------------------------------------------------ content fixtures */

export const READY_BODY = `<p>Lawn aeration lets air and water reach the roots of your grass.</p>
<h2>Why lawn aeration helps</h2>
<p>Packed soil keeps roots short. See our <a href="/services">services</a> and <a href="${SITE_URL}/contact">contact page</a>.</p>
<h2>How much does it cost?</h2>
<p>Most yards cost about the same as two mows.</p>`

export function makeContent(siteId: number, over: Partial<ContentRow> = {}): ContentRow {
  return createContent({
    siteId,
    mode: 'A',
    type: 'blog post',
    status: 'Ready for review',
    topic: 'lawn aeration',
    title: 'Lawn Aeration: A Practical Guide',
    focusKeyword: 'lawn aeration',
    seoTitle: 'Lawn Aeration: Costs, Timing and Tips',
    metaDescription:
      'Everything about lawn aeration: what it costs, the best time to book, and how to get it done right. Read our honest local guide today.',
    slug: 'lawn-aeration',
    excerpt: 'A practical guide to lawn aeration.',
    categories: ['Guides'],
    tags: ['lawn aeration', 'spring'],
    secondaryKeywords: ['lawn aeration cost'],
    bodyHtml: READY_BODY,
    schema: { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: 'Lawn Aeration' },
    reviewChecklist: [true, true, true, true, true],
    ...over
  } as Parameters<typeof createContent>[0])
}

export const WP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX'

/** Connect WordPress for a site through the real secret store (no network). */
export function connectWordPress(siteId: number, password = WP_PASSWORD, user = 'autbot-writer'): void {
  saveWordPressPassword(siteId, password)
  updateSite(siteId, { settings: { wpUrl: SITE_URL, wpUser: user } })
}

/** A small real PNG. */
export async function pngBytes(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 160, b: 60 } } })
    .png()
    .toBuffer()
}
