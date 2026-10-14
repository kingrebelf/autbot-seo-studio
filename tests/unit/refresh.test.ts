import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupTestEnv,
  connectMock,
  waitForIdle,
  stubWordPress,
  connectWordPress,
  makeSite,
  makeContent,
  SITE_URL,
  type TestEnv,
  type FetchCall
} from './helpers'
import { dispatch, type ApiResult } from '../../src/main/ipc'
import { registerAllHandlers } from '../../src/main/jobs/handlers'
import { getContent, updateContent, listVersions } from '../../src/main/content'
import { upsertPage, parsePage } from '../../src/main/research/crawler'
import { updateSite } from '../../src/main/sites'
import { addLinkBacksAsDrafts } from '../../src/main/publish/send'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
  registerAllHandlers()
})
afterEach(() => env.cleanup())

const ORIGINAL_ID = 42
const ORIGINAL_URL = `${SITE_URL}/old-aeration-post/`
const ORIGINAL_HTML =
  '<h2>About aeration</h2><p>Our original article about lawn aeration and why lawns need it.</p>'

function data<T>(r: ApiResult): T {
  if (!r.ok) throw new Error(`IPC failed: ${r.error}`)
  return r.data as T
}

/** Any request that could change the original post: a write to /posts/42 itself. */
const touchesOriginal = (c: FetchCall) => {
  const u = decodeURIComponent(c.url)
  return c.method !== 'GET' && new RegExp(`wp/v2/(posts|pages)/${ORIGINAL_ID}(?:[?&]|$)`).test(u)
}

async function setup() {
  await connectMock()
  const wp = stubWordPress(env.fetch, SITE_URL, {
    posts: { [ORIGINAL_ID]: { title: 'Old aeration post', content: ORIGINAL_HTML } }
  })
  const site = makeSite()
  connectWordPress(site.id)
  upsertPage(site.id, {
    ...parsePage(
      `<html><head><title>Old aeration post</title></head><body>${ORIGINAL_HTML}</body></html>`,
      ORIGINAL_URL,
      200
    ),
    wpId: ORIGINAL_ID,
    wpType: 'posts',
    source: 'wordpress'
  })
  const contentId = data<{ contentId: number }>(
    await dispatch('modes.start', { siteId: site.id, mode: 'D', url: ORIGINAL_URL })
  ).contentId
  await waitForIdle()
  return { site, contentId, ...wp }
}

describe('Mode D refresh never modifies the original live post', () => {
  it('runs the refresh and sends it as a NEW "[Refresh]" draft', async () => {
    const { contentId, created } = await setup()
    const c = getContent(contentId)
    expect(c.mode).toBe('D')
    expect(c.status).toBe('Ready for review')
    expect(c.refreshOfWpId).toBe(ORIGINAL_ID)
    // it read the original through the API...
    expect(
      env.fetch.calls.some(
        (x) => x.method === 'GET' && x.url.includes(`wp/v2/posts/${ORIGINAL_ID}?context=edit`)
      )
    ).toBe(true)
    // ...kept it in the history, unchanged
    const original = listVersions(contentId).find((v) => v.note === 'Original live page (unchanged)')!
    expect(original.bodyHtml).toBe(ORIGINAL_HTML)

    // the mock refresh contains a [CONFIRM] placeholder, which blocks sending
    expect(await dispatch('content.sendToWordPress', { id: contentId, force: true })).toMatchObject({
      ok: false,
      code: 'confirm_block'
    })
    await dispatch('content.dismissConfirms', { id: contentId, removeText: true })
    const r = data<{ postId: number; revision: boolean }>(
      await dispatch('content.sendToWordPress', { id: contentId, force: true })
    )

    expect(r.revision).toBe(false)
    expect(r.postId).not.toBe(ORIGINAL_ID)
    expect(created).toHaveLength(1)
    const body = created[0].body
    expect(body.status).toBe('draft')
    expect(String(body.title)).toMatch(/^\[Refresh\] /)
    expect(String(body.content)).toContain(`post ID ${ORIGINAL_ID}`)
    expect(String(body.content)).toContain('Added a pricing section')
    expect(body.slug).toBeUndefined() // never takes over the original's URL
    expect(env.fetch.calls.filter(touchesOriginal)).toEqual([])
    expect(getContent(contentId).wpPostId).toBe(r.postId)
  })

  it('in revision mode it only creates an autosave of the original, never updates it', async () => {
    const { site, contentId, created } = await setup()
    updateSite(site.id, { settings: { wpRevisionMode: true } })
    updateContent(contentId, { checks: { ...(getContent(contentId).checks ?? {}), confirmsDismissed: true } })
    const r = data<{ postId: number; revision: boolean }>(
      await dispatch('content.sendToWordPress', { id: contentId, force: true })
    )
    expect(r.revision).toBe(true)
    expect(created).toHaveLength(0)
    const writes = env.fetch.calls.filter((x) => x.method !== 'GET')
    const autosaves = writes.filter((x) => x.url.endsWith(`/wp/v2/posts/${ORIGINAL_ID}/autosaves`))
    expect(autosaves).toHaveLength(1)
    expect((autosaves[0].json as { status: string }).status).toBe('draft')
    expect(env.fetch.calls.filter(touchesOriginal)).toEqual([])
    // every write is either term creation, media, a new post or an autosave
    for (const w of writes)
      expect(w.url).toMatch(/wp\/v2\/(categories|tags|media|posts|pages)(\/\d+\/autosaves)?$/)
  })

  it('link-backs to older posts are new drafts too', async () => {
    const { site, created } = await setup()
    const c = makeContent(site.id, {
      liveUrl: `${SITE_URL}/new-post/`,
      checks: {
        seoPass: {
          link_backs: [
            { from_url: ORIGINAL_URL, anchor: 'lawn aeration' },
            { from_url: `${SITE_URL}/unknown/`, anchor: 'x' }
          ]
        }
      }
    })
    const r = await addLinkBacksAsDrafts(c.id)
    expect(r.created).toBe(1)
    expect(r.skipped).toHaveLength(1)
    expect(created).toHaveLength(1)
    expect(created[0].body.status).toBe('draft')
    expect(String(created[0].body.title)).toBe('[Refresh] Old aeration post')
    expect(String(created[0].body.content)).toContain(`<a href="${SITE_URL}/new-post/">lawn aeration</a>`)
    expect(env.fetch.calls.filter(touchesOriginal)).toEqual([])
  })
})
