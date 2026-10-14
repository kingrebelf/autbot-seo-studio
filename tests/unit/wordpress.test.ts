import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  setupTestEnv,
  makeSite,
  makeContent,
  connectWordPress,
  connectMock,
  stubWordPress,
  pngBytes,
  jsonResponse,
  htmlResponse,
  walk,
  SITE_URL,
  type TestEnv,
  type FetchCall
} from './helpers'
import {
  buildPostPayload,
  WordPressClient,
  WP_DRAFT_STATUS,
  SEO_META_KEYS
} from '../../src/main/publish/wordpress'
import { sendToWordPress } from '../../src/main/publish/send'
import { addOwnImage } from '../../src/main/pipeline/images'
import { getContent } from '../../src/main/content'
import { dispatch } from '../../src/main/ipc'
import { UserError } from '../../src/main/errors'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
})
afterEach(() => env.cleanup())

const isPostWrite = (c: FetchCall) =>
  c.method !== 'GET' && /wp\/v2\/(posts|pages)(\/|$|&|\?)/.test(decodeURIComponent(c.url))

function expectOnlyDrafts(calls: FetchCall[]): void {
  const writes = calls.filter((c) => c.method !== 'GET')
  for (const c of writes) {
    // nothing other than POST is ever used against WordPress
    expect(c.method, c.url).toBe('POST')
    if (c.json && typeof c.json === 'object' && 'status' in (c.json as object))
      expect((c.json as { status: unknown }).status, c.url).toBe('draft')
  }
  for (const c of calls.filter(isPostWrite))
    expect((c.json as { status?: unknown }).status, c.url).toBe('draft')
}

describe('WordPress: drafts only', () => {
  it('buildPostPayload always sets status "draft", whatever the caller passes', () => {
    expect(WP_DRAFT_STATUS).toBe('draft')
    for (const status of [
      'publish',
      'future',
      'private',
      'pending',
      'trash',
      undefined,
      null,
      { toString: () => 'publish' }
    ]) {
      const p = buildPostPayload({ title: 't', content: 'c', status } as never)
      expect(p.status).toBe('draft')
    }
    const p = buildPostPayload({ title: 't', content: 'c', excerpt: undefined, slug: 's' })
    expect(p).toEqual({ title: 't', content: 'c', slug: 's', status: 'draft' })
  })

  it('the client sends status "draft" in every post body, even if asked for "publish"', async () => {
    stubWordPress(env.fetch)
    const wp = new WordPressClient(SITE_URL, 'bot', 'pass word')
    await wp.createDraft('posts', { title: 'A', content: '<p>a</p>', status: 'publish' } as never)
    await wp.createDraft('pages', { title: 'B', content: '<p>b</p>', status: 'future' } as never)
    await wp.createAutosave('posts', 42, { title: 'C', content: '<p>c</p>', status: 'private' } as never)
    const posts = env.fetch.calls.filter(isPostWrite)
    expect(posts).toHaveLength(3)
    expectOnlyDrafts(env.fetch.calls)
    // Basic auth with spaces removed from the application password
    expect(posts[0].headers.authorization).toBe(`Basic ${Buffer.from('bot:password').toString('base64')}`)
  })

  it('sendToWordPress creates a draft with featured image, alt text, categories, tags, slug and excerpt', async () => {
    await connectMock()
    const { created } = stubWordPress(env.fetch)
    const site = makeSite()
    connectWordPress(site.id)
    const c = makeContent(site.id)
    const img = await addOwnImage(site.id, c.id, 'featured', await pngBytes())
    expect(img.selected).toBe(true)
    expect(img.alt).toBeTruthy()

    const r = await sendToWordPress(c.id)
    expect(r.revision).toBe(false)
    expect(created).toHaveLength(1)
    const body = created[0].body
    expect(created[0].type).toBe('posts')
    expect(body.status).toBe('draft')
    expect(body.title).toBe('Lawn Aeration: A Practical Guide')
    expect(body.slug).toBe('lawn-aeration')
    expect(body.excerpt).toBe('A practical guide to lawn aeration.')
    expect((body.categories as number[]).length).toBe(1)
    expect((body.tags as number[]).length).toBe(2)

    const upload = env.fetch.calls.find((x) => /wp\/v2\/media$/.test(x.url))!
    expect(upload.headers['content-type']).toBe('image/webp')
    expect(upload.headers['content-disposition']).toMatch(/attachment; filename=".+\.webp"/)
    const mediaId = body.featured_media as number
    expect(mediaId).toBeGreaterThan(0)
    const meta = env.fetch.calls.find((x) => new RegExp(`wp/v2/media/${mediaId}$`).test(x.url))!
    expect((meta.json as { alt_text: string }).alt_text).toBe(img.alt)
    for (const k of ['caption', 'description', 'title']) expect(meta.json).toHaveProperty(k)

    // the schema goes into the content because no SEO plugin was detected
    expect(String(body.content)).toContain('application/ld+json')
    expect(String(body.content)).not.toContain('autbot-media://')

    expectOnlyDrafts(env.fetch.calls)
    const after = getContent(c.id)
    expect(after.status).toBe('Draft sent')
    expect(after.wpPostId).toBe(created[0].id)
    expect(after.wpEditUrl).toBe(`${SITE_URL}/wp-admin/post.php?post=${created[0].id}&action=edit`)
    expect(r.copyPanel).not.toBeNull()
  })

  it('pages go to /pages as drafts, and SEO plugin meta is written when detected', async () => {
    const { created } = stubWordPress(env.fetch, SITE_URL, { namespaces: ['wp/v2', 'yoast/v1'] })
    const site = makeSite()
    connectWordPress(site.id)
    const c = makeContent(site.id, { type: 'service page' })
    const r = await sendToWordPress(c.id)
    expect(created[0].type).toBe('pages')
    expect(created[0].body.status).toBe('draft')
    expect(created[0].body.tags).toBeUndefined()
    const meta = created[0].body.meta as Record<string, string>
    expect(meta[SEO_META_KEYS.yoast.title]).toBe(c.seoTitle)
    expect(meta[SEO_META_KEYS.yoast.focus]).toBe('lawn aeration')
    expect(r.seoPlugin).toBe('yoast')
    expect(r.seoMetaWritten).toBe(true)
    expect(String(created[0].body.content)).not.toContain('application/ld+json')
    expectOnlyDrafts(env.fetch.calls)
  })

  it('requires the review checklist unless forced, and works through the IPC route', async () => {
    const { created } = stubWordPress(env.fetch)
    const site = makeSite()
    connectWordPress(site.id)
    const c = makeContent(site.id, { reviewChecklist: [true, false, true, true, true] })
    await expect(sendToWordPress(c.id)).rejects.toMatchObject({ code: 'checklist' })
    expect(created).toHaveLength(0)
    const r = await dispatch('content.sendToWordPress', { id: c.id, force: true })
    expect(r.ok).toBe(true)
    expect(created).toHaveLength(1)
    expectOnlyDrafts(env.fetch.calls)
  })

  it('falls back to ?rest_route= when /wp-json/ is blocked', async () => {
    env.fetch.on(
      (c) => c.url.includes('/wp-json/'),
      () => htmlResponse('<html>blocked</html>')
    )
    env.fetch.on(`${SITE_URL}/?rest_route=/wp/v2/users/me`, () =>
      jsonResponse({ name: 'Bot', roles: ['author'], capabilities: { edit_posts: true } })
    )
    const wp = new WordPressClient(SITE_URL, 'bot', 'pw')
    const r = await wp.test()
    expect(r.name).toBe('Bot')
    expect(r.viaRestRoute).toBe(true)
  })

  it('refuses plain http for remote sites and explains auth failures in plain English', async () => {
    expect(() => new WordPressClient('http://insecure.example', 'u', 'p')).toThrow(UserError)
    env.fetch.on(`${SITE_URL}/wp-json/`, () =>
      jsonResponse({ code: 'incorrect_password', message: 'nope' }, 401)
    )
    await expect(new WordPressClient(SITE_URL, 'u', 'p').test()).rejects.toThrow(/application password/)
  })
})

describe('static scan: no code path sends a non-draft status', () => {
  const root = join(__dirname, '..', '..', 'src')
  const files = walk(root).filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f))
  const BAD = [
    /\bstatus\s*:\s*['"`](publish|future|private)['"`]/,
    /\.status\s*=\s*['"`](publish|future|private)['"`]/,
    /\[\s*['"`]status['"`]\s*\]\s*=\s*['"`](publish|future|private)/,
    /['"`]status['"`]\s*[:,]\s*['"`](publish|future|private)['"`]/,
    /\\?"status\\?"\s*:\s*\\?"(publish|future|private)/
  ]

  it('scans a real source tree', () => {
    expect(files.length).toBeGreaterThan(30)
    expect(files.some((f) => f.endsWith(join('publish', 'wordpress.ts')))).toBe(true)
  })

  it("no file assigns 'publish', 'future' or 'private' as a status", () => {
    const hits: string[] = []
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const re of BAD) if (re.test(line)) hits.push(`${relative(root, f)}:${i + 1}: ${line.trim()}`)
        // a status=publish query string is only allowed as a GET filter when listing posts
        if (/status=(publish|future|private)/.test(line) && !/per_page=/.test(line))
          hits.push(`${relative(root, f)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('only the WordPress client talks to the WordPress REST API, and every post write goes through buildPostPayload', () => {
    const outside = files.filter(
      (f) =>
        !f.endsWith(join('publish', 'wordpress.ts')) && /wp\/v2\/|\/wp-json/.test(readFileSync(f, 'utf8'))
    )
    expect(outside.map((f) => relative(root, f))).toEqual([])
    const src = readFileSync(join(root, 'main', 'publish', 'wordpress.ts'), 'utf8')
    // split into methods; any method that POSTs to a posts/pages route must use buildPostPayload
    const methods = src.split(/\n {2}(?=async |[a-z]\w*\()/)
    const postWriters = methods.filter((m) => /wp\/v2\/\$\{type\}/.test(m) && /method:\s*'POST'/.test(m))
    expect(postWriters.length).toBeGreaterThanOrEqual(2)
    for (const m of postWriters) expect(m).toMatch(/buildPostPayload\(/)
    // the payload's status is only ever the constant
    expect(src.match(/\.status\s*=(?!=)/g)).toHaveLength(1)
    expect(src).toMatch(/payload\.status = WP_DRAFT_STATUS/)
    // no other HTTP verbs that could modify a post
    expect(src).not.toMatch(/method:\s*'(PUT|PATCH|DELETE)'/)
  })
})
