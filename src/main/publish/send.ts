import { readFileSync, existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import * as cheerio from 'cheerio'
import { getDb, schema } from '../db'
import {
  getContent,
  updateContent,
  assertSendable,
  noteActivity,
  saveVersion,
  type ContentRow
} from '../content'
import { getSite, settingsOf, updateSite, logActivity, type SiteRow } from '../sites'
import { wpClientFor, SEO_META_KEYS, type WordPressClient, type SeoPlugin } from './wordpress'
import { imagesFor, getImage } from '../pipeline/images'
import { upsertPage, parsePage } from '../research/crawler'
import { trackContentKeywords } from '../tracking/ranks'
import { gscConnected, submitSitemap } from '../indexing/gsc'
import { pingIndexNow } from '../indexing/indexnow'
import { notifyUser } from '../notify'
import { UserError } from '../errors'
import { log } from '../logger'
import { insertLink } from '../pipeline/steps'

const PAGE_TYPES = new Set(['service page', 'landing page', 'location page', 'product page', 'page'])
export const wpTypeFor = (c: ContentRow): 'posts' | 'pages' =>
  c.wpPostType === 'pages' || PAGE_TYPES.has(c.type) ? 'pages' : 'posts'

export interface SendResult {
  postId: number
  editUrl: string
  seoMetaWritten: boolean
  seoPlugin: SeoPlugin
  copyPanel: { seoTitle: string; metaDescription: string; focusKeyword: string } | null
  revision: boolean
}

async function uploadImages(
  wp: WordPressClient,
  c: ContentRow
): Promise<{ featuredId?: number; urls: Map<number, string> }> {
  const urls = new Map<number, string>()
  let featuredId: number | undefined
  for (const im of imagesFor(c.id).filter((i) => i.selected)) {
    let mediaId = im.wpMediaId
    let url = im.wpUrl
    if (!mediaId || !url) {
      if (!existsSync(im.filePath))
        throw new UserError(
          `The image file "${im.filename}" is missing from your computer. Remove it from the piece or regenerate it, then send again.`
        )
      const up = await wp.uploadMedia(readFileSync(im.filePath), im.filename, 'image/webp')
      mediaId = up.id
      url = up.url
      await wp.updateMedia(up.id, {
        alt_text: im.alt ?? '',
        caption: im.caption ?? '',
        description: im.description ?? '',
        title: im.title ?? ''
      })
      getDb()
        .update(schema.images)
        .set({ wpMediaId: mediaId, wpUrl: url })
        .where(eq(schema.images.id, im.id))
        .run()
    }
    urls.set(im.id, url!)
    if (im.slot === 'featured') featuredId = mediaId!
  }
  return { featuredId, urls }
}

export function swapImageUrls(html: string, urls: Map<number, string>): string {
  const $ = cheerio.load(html, null, false)
  $('img').each((_, el) => {
    const src = $(el).attr('src') ?? ''
    const m = src.match(/^autbot-media:\/\/img\/(\d+)/)
    if (m) {
      const u = urls.get(Number(m[1])) ?? getImageSafe(Number(m[1]))?.wpUrl ?? null
      if (u) $(el).attr('src', u)
      else $(el).remove()
    }
    $(el).removeAttr('data-image-id')
  })
  return $.html()
}

function getImageSafe(id: number) {
  try {
    return getImage(id)
  } catch {
    return null
  }
}

/** Send a piece to WordPress. Always as a draft; refreshes never overwrite the live post. */
export async function sendToWordPress(
  contentId: number,
  opts: { force?: boolean } = {}
): Promise<SendResult> {
  const c = getContent(contentId)
  assertSendable(c)
  const checklist = c.reviewChecklist ?? []
  if (!opts.force && !(checklist.length >= 5 && checklist.every(Boolean)))
    throw new UserError('Tick every item on the Review checklist first, or click "Send anyway".', 'checklist')
  const site = getSite(c.siteId)
  const st = settingsOf(site)
  const wp = wpClientFor(site)
  const type = wpTypeFor(c)
  const seoPlugin = st.wpSeoPlugin ?? (await wp.detectSeoPlugin())

  const { featuredId, urls } = await uploadImages(wp, c)
  const categories = await wp.ensureTerms(
    'categories',
    c.categories?.length ? c.categories : (st.defaultCategories ?? [])
  )
  const tags = type === 'posts' ? await wp.ensureTerms('tags', c.tags ?? []) : []

  let html = swapImageUrls(c.bodyHtml ?? '', urls)
  const addSchema = st.addSchemaToContent ?? !seoPlugin
  if (addSchema && c.schema)
    html += `\n<script type="application/ld+json">${JSON.stringify(c.schema).replace(/</g, '\\u003c')}</script>`
  if (st.authorNote) html = `<!-- ${st.authorNote.replace(/--/g, '-')} -->\n${html}`

  const meta: Record<string, string> = {}
  if (seoPlugin) {
    const k = SEO_META_KEYS[seoPlugin]
    meta[k.title] = c.seoTitle ?? ''
    meta[k.description] = c.metaDescription ?? ''
    meta[k.focus] = c.focusKeyword ?? ''
  }

  const isRefresh = c.mode === 'D' && Boolean(c.refreshOfWpId)
  let postId: number
  let revision = false
  let echoedMeta: Record<string, unknown> = {}
  if (isRefresh && st.wpRevisionMode) {
    // Advanced: save as an autosave/revision of the original; the live post is untouched.
    const r = await wp.createAutosave(type, c.refreshOfWpId!, {
      title: c.title ?? '',
      content: html,
      excerpt: c.excerpt ?? ''
    })
    postId = c.refreshOfWpId!
    revision = true
    log.info(`Saved autosave ${r.id} for post ${postId}`)
  } else {
    let title = c.title ?? ''
    if (isRefresh || c.mode === 'D') {
      const changes = ((c.research as { improvements?: { change: string }[] } | null)?.improvements ?? [])
        .map((i) => `<li>${i.change}</li>`)
        .join('')
      title = `[Refresh] ${c.title ?? ''}`
      html = `<p><strong>Refresh draft.</strong> Original ${c.refreshOfWpId ? `post ID ${c.refreshOfWpId}` : `page ${c.refreshOfUrl ?? ''}`}. Copy the parts you want into the original, or publish this and redirect the old URL. Changes:</p><ul>${changes}</ul><hr>\n${html}`
    }
    const r = await wp.createDraft(type, {
      title,
      content: html,
      excerpt: c.excerpt ?? '',
      slug: isRefresh ? undefined : (c.slug ?? undefined),
      categories: type === 'posts' ? categories : undefined,
      tags: type === 'posts' ? tags : undefined,
      featured_media: featuredId,
      meta: Object.keys(meta).length ? meta : undefined
    })
    postId = r.id
    echoedMeta = r.meta
  }

  const seoMetaWritten = Boolean(seoPlugin) && Object.entries(meta).every(([k, v]) => echoedMeta[k] === v)
  updateContent(contentId, {
    wpPostId: revision ? c.wpPostId : postId,
    wpPostType: type,
    wpEditUrl: wp.editUrl(postId),
    status: 'Draft sent'
  })
  saveVersion(contentId, 'Sent to WordPress')
  noteActivity(c, `Sent "${c.title}" to WordPress as a draft`)
  if (seoPlugin !== st.wpSeoPlugin) updateSite(site.id, { settings: { wpSeoPlugin: seoPlugin } })
  return {
    postId,
    editUrl: wp.editUrl(postId),
    seoMetaWritten,
    seoPlugin,
    revision,
    copyPanel: seoMetaWritten
      ? null
      : {
          seoTitle: c.seoTitle ?? '',
          metaDescription: c.metaDescription ?? '',
          focusKeyword: c.focusKeyword ?? ''
        }
  }
}

/** Mark a piece published with its live URL. Triggers indexing help and rank tracking. */
export async function markPublished(contentId: number, liveUrl: string): Promise<{ indexing: string[] }> {
  let url = liveUrl.trim()
  if (!/^https?:\/\//i.test(url)) throw new UserError('Paste the full live address, starting with https://')
  url = url.replace(/#.*$/, '')
  const c = getContent(contentId)
  updateContent(contentId, {
    status: 'Published',
    liveUrl: url,
    publishedAt: c.publishedAt ?? Date.now(),
    indexStatus: null,
    indexCheckedAt: null
  })
  const site = getSite(c.siteId)
  if (c.bodyHtml)
    upsertPage(site.id, {
      ...parsePage(
        `<html><head><title>${c.seoTitle ?? c.title}</title></head><body><h1>${c.title}</h1>${c.bodyHtml}</body></html>`,
        url,
        200
      ),
      source: 'app',
      focusKeyword: c.focusKeyword
    })
  trackContentKeywords(contentId)
  logActivity(c.siteId, `Published: "${c.title}"`, `/content/${c.id}`)
  const messages = await requestIndexing(site, [url])
  const todo = (c.checks as { seoPass?: { link_backs?: unknown[] } } | null)?.seoPass?.link_backs?.length ?? 0
  if (todo)
    notifyUser(
      c.siteId,
      'links',
      'Add links to your new page',
      `${todo} older page${todo === 1 ? '' : 's'} should link to "${c.title}". See the Links tab.`,
      `/content/${c.id}?tab=links`,
      false
    )
  return { indexing: messages }
}

/** Re-submit the sitemap to Search Console and ping IndexNow. */
export async function requestIndexing(site: SiteRow, urls: string[]): Promise<string[]> {
  const st = settingsOf(site)
  const out: string[] = []
  if (st.gscProperty && gscConnected()) {
    try {
      await submitSitemap(st.gscProperty, `${site.url}/sitemap.xml`)
      out.push('Sitemap re-submitted to Google Search Console.')
    } catch (e) {
      log.warn('Sitemap submit failed', e)
      out.push(
        "Couldn't re-submit the sitemap to Search Console. It will work next time if your sitemap is at /sitemap.xml."
      )
    }
  }
  if (st.indexNowEnabled !== false && st.indexNowKey) {
    const r = await pingIndexNow(site.url, st.indexNowKey, urls)
    out.push(r.message)
  }
  return out
}

/** Every 30 minutes (and on demand): mark sent drafts Published once WordPress publishes them. */
export async function syncWordPressStatus(siteId: number): Promise<number> {
  const site = getSite(siteId)
  let wp: WordPressClient
  try {
    wp = wpClientFor(site)
  } catch {
    return 0
  }
  const sent = getDb()
    .select()
    .from(schema.content)
    .where(eq(schema.content.siteId, siteId))
    .all()
    .filter((c) => c.status === 'Draft sent' && c.wpPostId)
  let n = 0
  for (const c of sent) {
    try {
      const p = await wp.getPost(wpTypeFor(c), c.wpPostId!)
      if (p?.status === 'publish') {
        await markPublished(c.id, p.link)
        notifyUser(
          siteId,
          'published',
          `Published: ${c.title}`,
          'WordPress shows it live. The app will help get it indexed.',
          `/content/${c.id}`
        )
        n++
      }
    } catch (e) {
      log.warn(`WordPress status check failed for content ${c.id}`, e)
    }
  }
  return n
}

/** Read existing posts and pages from WordPress into the site's page list. */
export async function importWordPress(siteId: number): Promise<number> {
  const site = getSite(siteId)
  const wp = wpClientFor(site)
  let n = 0
  for (const type of ['posts', 'pages'] as const) {
    const items = await wp.listAll(type)
    for (const it of items) {
      const p = parsePage(
        `<html><head><title>${it.title}</title></head><body><h1>${it.title}</h1>${it.content}</body></html>`,
        it.link,
        200
      )
      upsertPage(siteId, {
        ...p,
        title: cheerio.load(it.title).text(),
        wpId: it.id,
        wpType: type,
        source: 'wordpress'
      })
      n++
    }
  }
  logActivity(siteId, `Read ${n} posts and pages from WordPress`)
  return n
}

/**
 * Advanced: for each suggested link-back, create a NEW draft copy of the older post with
 * the link added ("[Refresh] ..."), or an autosave in revision mode. Never edits live posts.
 */
export async function addLinkBacksAsDrafts(
  contentId: number
): Promise<{ created: number; skipped: string[] }> {
  const c = getContent(contentId)
  if (!c.liveUrl && !c.wpPostId)
    throw new UserError('Publish this piece first, so older pages have a live address to link to.')
  const target = c.liveUrl ?? ''
  const site = getSite(c.siteId)
  const st = settingsOf(site)
  const wp = wpClientFor(site)
  const backs =
    (c.checks as { seoPass?: { link_backs?: { from_url: string; anchor: string }[] } } | null)?.seoPass
      ?.link_backs ?? []
  const pages = getDb().select().from(schema.pages).where(eq(schema.pages.siteId, c.siteId)).all()
  let created = 0
  const skipped: string[] = []
  for (const b of backs) {
    const page = pages.find((p) => p.url.replace(/\/$/, '') === b.from_url.replace(/\/$/, ''))
    if (!page?.wpId) {
      skipped.push(`${b.from_url} (not a WordPress post the app knows; add the link by hand)`)
      continue
    }
    const type = (page.wpType as 'posts' | 'pages') ?? 'posts'
    const orig = await wp.getPost(type, page.wpId)
    if (!orig) {
      skipped.push(`${b.from_url} (not found in WordPress)`)
      continue
    }
    const linked = insertLink(orig.content, b.anchor, target)
    if (!linked) {
      skipped.push(`${b.from_url} (anchor text "${b.anchor}" not found)`)
      continue
    }
    if (st.wpRevisionMode) await wp.createAutosave(type, page.wpId, { title: orig.title, content: linked })
    else
      await wp.createDraft(type, {
        title: `[Refresh] ${orig.title}`,
        content: `<p><strong>Refresh draft</strong> of post ID ${page.wpId}: adds a link to ${target}.</p><hr>\n${linked}`
      })
    created++
  }
  return { created, skipped }
}
