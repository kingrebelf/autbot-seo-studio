import * as cheerio from 'cheerio'
import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { fetchWithRetry, sleep, ua, HttpError } from '../http'
import { parseRobots, type Robots } from './robots'
import { getSetting } from '../settings'
import { log } from '../logger'
import { getSite } from '../sites'

export interface CrawledPage {
  url: string
  statusCode: number
  title: string
  metaDescription: string
  h1: string
  headings: string[]
  wordCount: number
  internalLinks: string[]
  paragraphs: string[]
  canonical: string
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function cleanUrl(u: string, base: string): string | null {
  try {
    const x = new URL(u, base)
    if (!/^https?:$/.test(x.protocol)) return null
    x.hash = ''
    if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|xml|ico|woff2?)$/i.test(x.pathname)) return null
    return x.toString()
  } catch {
    return null
  }
}

/** Parse one HTML page into the fields stored in `pages`. */
export function parsePage(html: string, url: string, status: number): CrawledPage {
  const $ = cheerio.load(html)
  const siteHost = host(url)
  const links = new Set<string>()
  $('a[href]').each((_, a) => {
    const c = cleanUrl($(a).attr('href') ?? '', url)
    if (c && host(c) === siteHost) links.add(c)
  })
  $('script,style,noscript,svg,nav,footer,header').remove()
  const paragraphs: string[] = []
  $('main p, article p, body p').each((_, p) => {
    const t = $(p).text().replace(/\s+/g, ' ').trim()
    if (t.split(' ').length >= 20 && !paragraphs.includes(t) && paragraphs.length < 40) paragraphs.push(t)
  })
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  return {
    url,
    statusCode: status,
    title: $('title').first().text().trim(),
    metaDescription: $('meta[name="description"]').attr('content')?.trim() ?? '',
    h1: $('h1').first().text().replace(/\s+/g, ' ').trim(),
    headings: $('h2')
      .map((_, h) => $(h).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean)
      .slice(0, 30),
    wordCount: text ? text.split(' ').length : 0,
    internalLinks: [...links].slice(0, 300),
    paragraphs,
    canonical: $('link[rel="canonical"]').attr('href') ?? ''
  }
}

async function getText(
  url: string,
  signal?: AbortSignal
): Promise<{ status: number; body: string; type: string } | null> {
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'user-agent': ua() },
      retries: 2,
      timeoutMs: 30_000,
      signal,
      redirect: 'follow'
    })
    return { status: res.status, body: await res.text(), type: res.headers.get('content-type') ?? '' }
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: '', type: '' }
    return null
  }
}

/** Read sitemap.xml (and sitemap indexes, and robots.txt sitemap lines). */
export async function sitemapUrls(
  siteUrl: string,
  robots: Robots,
  max: number,
  signal?: AbortSignal
): Promise<string[]> {
  const queue = [
    ...robots.sitemaps,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/sitemap_index.xml`,
    `${siteUrl}/wp-sitemap.xml`
  ]
  const seenMaps = new Set<string>()
  const urls = new Set<string>()
  while (queue.length && urls.size < max && seenMaps.size < 50) {
    const sm = queue.shift()!
    if (seenMaps.has(sm)) continue
    seenMaps.add(sm)
    const r = await getText(sm, signal)
    if (!r || r.status >= 400 || !/<(urlset|sitemapindex)/i.test(r.body)) continue
    const $ = cheerio.load(r.body, { xml: true })
    $('sitemap > loc').each((_, l) => {
      queue.push($(l).text().trim())
    })
    $('url > loc').each((_, l) => {
      const u = $(l).text().trim()
      if (host(u) === host(siteUrl) && urls.size < max) urls.add(u)
    })
    await sleep(1000, signal)
  }
  return [...urls]
}

export interface CrawlProgress {
  (done: number, total: number, url: string): void
}

/**
 * Crawl a site: sitemap first, then fall back to following links from the homepage.
 * Same domain only, 1 request/second, respects robots.txt, clear user-agent.
 */
export async function crawlSite(
  siteId: number,
  signal?: AbortSignal,
  progress?: CrawlProgress
): Promise<{ pages: number; errors: number }> {
  const site = getSite(siteId)
  const siteUrl = site.url.replace(/\/$/, '')
  const max = getSetting('crawlMaxPages') || 500
  const robotsRes = await getText(`${siteUrl}/robots.txt`, signal)
  const robots = parseRobots(robotsRes && robotsRes.status < 400 ? robotsRes.body : '')
  let targets = await sitemapUrls(siteUrl, robots, max, signal)
  const fromSitemap = targets.length > 0
  if (!targets.length) targets = [`${siteUrl}/`]
  const seen = new Set<string>()
  const queue = [...targets]
  let done = 0
  let errors = 0
  const db = getDb()
  while (queue.length && done < max) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    let path = '/'
    try {
      const u = new URL(url)
      path = u.pathname + u.search
    } catch {
      continue
    }
    if (!robots.isAllowed(path)) continue
    progress?.(done, Math.min(max, fromSitemap ? targets.length : Math.max(queue.length + done + 1, 1)), url)
    const r = await getText(url, signal)
    done++
    if (!r) {
      errors++
    } else if (r.type && !/html/i.test(r.type)) {
      // skip non-HTML
    } else {
      const p = parsePage(r.body, url, r.status)
      upsertPage(siteId, p)
      if (!fromSitemap)
        for (const l of p.internalLinks) if (!seen.has(l) && queue.length + done < max * 2) queue.push(l)
    }
    await sleep(1000, signal)
  }
  db.update(schema.sites).set({ updatedAt: Date.now() }).where(eq(schema.sites.id, siteId)).run()
  log.info(`Crawled ${done} pages for site ${siteId} (${errors} errors)`)
  return { pages: done, errors }
}

export function upsertPage(
  siteId: number,
  p: CrawledPage & { wpId?: number; wpType?: string; source?: string; focusKeyword?: string | null }
): void {
  const db = getDb()
  const existing = db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.siteId, siteId), eq(schema.pages.url, p.url)))
    .get()
  const values = {
    title: p.title,
    metaDescription: p.metaDescription,
    h1: p.h1,
    headings: p.headings,
    wordCount: p.wordCount,
    internalLinks: p.internalLinks,
    paragraphs: p.paragraphs,
    canonical: p.canonical,
    statusCode: p.statusCode,
    lastCrawledAt: Date.now(),
    updatedAt: Date.now(),
    ...(p.wpId ? { wpId: p.wpId, wpType: p.wpType ?? null } : {}),
    ...(p.focusKeyword ? { focusKeyword: p.focusKeyword } : {})
  }
  if (existing) db.update(schema.pages).set(values).where(eq(schema.pages.id, existing.id)).run()
  else
    db.insert(schema.pages)
      .values({ siteId, url: p.url, source: p.source ?? 'crawl', ...values })
      .run()
}
