import { and, eq, gte } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import * as cheerio from 'cheerio'
import { getDb, schema } from '../db'
import { runChat } from '../ai'
import { prompt } from '../prompts'
import { getSite, profileOf, systemPrompt, settingsOf, updateSite, logActivity } from '../sites'
import { getContent, updateContent, createContent, saveVersion } from '../content'
import { sitePagesSummary, gscQueriesFor } from '../research/gather'
import { gscConnected, searchAnalytics, daysAgo } from '../indexing/gsc'
import { listKeywords } from '../tracking/ranks'
import { wpClientFor, wpConnected } from '../publish/wordpress'
import { fetchWithRetry, ua } from '../http'
import { serpConfigured, topResults } from '../research/serp'
import { langCode } from '../research/autocomplete'
import {
  SuggestionsSchema,
  MaintenanceSchema,
  RefreshSchema,
  ClusterSchema,
  LocalSchema,
  CalendarSchema,
  SparConclusionSchema
} from './schemas'
import { cleanHtml } from './sanitize'
import { runChecks } from './steps'
import { UserError } from '../errors'
import type { JobCtx, JobResult } from '../jobs/types'
import { enqueue } from '../jobs/queue'
import { LENGTHS, type LengthKey } from '@shared/types'

const tctx = (ctx: JobCtx) => ({ siteId: ctx.siteId, signal: ctx.signal, budgetOverride: ctx.budgetOverride })

/* ---------------------------------------------------------------- Mode B */

export async function modeB(ctx: JobCtx): Promise<JobResult> {
  const site = getSite(ctx.siteId!)
  const p = profileOf(site)
  ctx.progress('mode-b', 'Reviewing your site, Search Console and competitors')
  const cal = getDb()
    .select()
    .from(schema.calendarItems)
    .where(eq(schema.calendarItems.siteId, site.id))
    .all()
  const inProgress = getDb().select().from(schema.content).where(eq(schema.content.siteId, site.id)).all()
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('mode-b', {
        site_pages: sitePagesSummary(site.id, 200),
        gsc_queries: await gscQueriesFor(site, null, 90, ctx.signal),
        competitors: p.competitors,
        calendar: cal.map((c) => `${c.month}: ${c.title}`),
        in_progress: inProgress.map((c) => `${c.title ?? c.topic} (${c.status})`),
        notes: String(ctx.input.notes ?? '(nothing)'),
        web_search: true
      }),
      schema: SuggestionsSchema,
      webSearch: true,
      maxOutputTokens: 4000
    },
    tctx(ctx)
  )
  const suggestions = r.data.suggestions.sort((a, b) => a.priority - b.priority).slice(0, 5)
  logActivity(site.id, 'New "what\'s next" suggestions are ready', '/')
  return { status: 'done', output: { suggestions, sources: r.citations } }
}

/* ---------------------------------------------------------------- Mode C */

/** Deterministic findings from GSC (or tracked keywords) for the maintenance mode. */
export async function maintenanceFindings(siteId: number, signal?: AbortSignal) {
  const site = getSite(siteId)
  const prop = settingsOf(site).gscProperty
  const findings: { kind: string; page?: string; query?: string; detail: string }[] = []
  if (prop && gscConnected() && !signal?.aborted) {
    const cur = await searchAnalytics(prop, {
      startDate: daysAgo(31),
      endDate: daysAgo(3),
      dimensions: ['page'],
      rowLimit: 500
    })
    const prev = await searchAnalytics(prop, {
      startDate: daysAgo(59),
      endDate: daysAgo(31),
      dimensions: ['page'],
      rowLimit: 500
    })
    const prevMap = new Map(prev.map((r) => [r.keys[0], r]))
    const pq = await searchAnalytics(prop, {
      startDate: daysAgo(31),
      endDate: daysAgo(3),
      dimensions: ['page', 'query'],
      rowLimit: 2000
    })
    for (const r of pq
      .filter((x) => x.position >= 4 && x.position <= 20 && x.impressions >= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15))
      findings.push({
        kind: 'striking distance (ranking 4 to 20)',
        page: r.keys[0],
        query: r.keys[1],
        detail: `position ${r.position.toFixed(1)}, ${r.impressions} impressions, ${r.clicks} clicks (last 28 days)`
      })
    for (const r of cur) {
      const p = prevMap.get(r.keys[0])
      if (p && p.clicks >= 10 && r.clicks < p.clicks * 0.7)
        findings.push({
          kind: 'losing clicks',
          page: r.keys[0],
          detail: `${p.clicks} clicks the previous 28 days, ${r.clicks} in the last 28 days`
        })
      if (r.impressions >= 300 && r.ctr < 0.015)
        findings.push({
          kind: 'high impressions, low click rate (title/meta fix)',
          page: r.keys[0],
          detail: `${r.impressions} impressions, click rate ${(r.ctr * 100).toFixed(1)}%`
        })
    }
  } else {
    for (const k of listKeywords(siteId)) {
      if (k.position !== null && k.position >= 4 && k.position <= 20)
        findings.push({
          kind: 'striking distance (ranking 4 to 20)',
          page: k.targetPageUrl ?? undefined,
          query: k.keyword,
          detail: `position ${k.position} (${k.latestSource ?? 'tracked'})`
        })
      if (k.change28 !== null && k.change28 < -3)
        findings.push({
          kind: 'losing position',
          page: k.targetPageUrl ?? undefined,
          query: k.keyword,
          detail: `dropped ${-k.change28} places in 28 days`
        })
    }
  }
  for (const p of getDb().select().from(schema.pages).where(eq(schema.pages.siteId, siteId)).all())
    if ((p.wordCount ?? 0) > 0 && (p.wordCount ?? 0) < 300 && (p.statusCode ?? 200) < 400)
      findings.push({ kind: 'thin page', page: p.url, detail: `${p.wordCount} words` })
  return findings.slice(0, 60)
}

export async function modeC(ctx: JobCtx): Promise<JobResult> {
  const site = getSite(ctx.siteId!)
  ctx.progress('mode-c', 'Looking for pages to protect and grow')
  const findings = await maintenanceFindings(site.id, ctx.signal)
  if (!findings.length)
    return {
      status: 'done',
      output: {
        suggestions: [],
        message: gscConnected()
          ? 'Nothing needs attention right now. Check back in a few weeks.'
          : 'Not enough data yet. Connect Google Search Console (Settings > Google) or track some keywords, then run this again.'
      }
    }
  ctx.progress('mode-c', 'AI is turning the findings into actions')
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('mode-c', {
        findings,
        site_pages: sitePagesSummary(site.id, 150),
        notes: String(ctx.input.notes ?? '(nothing)')
      }),
      schema: MaintenanceSchema,
      maxOutputTokens: 4000
    },
    tctx(ctx)
  )
  return { status: 'done', output: { suggestions: r.data.suggestions, findings } }
}

/* ---------------------------------------------------------------- Mode D */

async function currentPageHtml(
  siteId: number,
  url: string,
  wpId?: number | null,
  wpType?: string | null
): Promise<{ html: string; title: string }> {
  const site = getSite(siteId)
  if (wpId && wpConnected(site)) {
    const p = await wpClientFor(site).getPost((wpType as 'posts' | 'pages') || 'posts', wpId)
    if (p) return { html: p.content, title: p.title }
  }
  const res = await fetchWithRetry(url, { headers: { 'user-agent': ua() }, retries: 2 })
  const $ = cheerio.load(await res.text())
  $('script,style,noscript,nav,header,footer,aside,form').remove()
  const main = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body')
  return { html: main.html() ?? '', title: $('h1').first().text().trim() || $('title').text().trim() }
}

export async function modeD(ctx: JobCtx): Promise<JobResult> {
  const c = getContent(ctx.contentId!)
  const site = getSite(c.siteId)
  const url = c.refreshOfUrl
  if (!url) throw new UserError('Pick the page you want to refresh.')
  const page = getDb()
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.siteId, c.siteId), eq(schema.pages.url, url)))
    .get()
  ctx.progress('mode-d', 'Reading the current page')
  const cur = await currentPageHtml(c.siteId, url, c.refreshOfWpId ?? page?.wpId, page?.wpType)
  let gsc: unknown = ''
  const prop = settingsOf(site).gscProperty
  if (prop && gscConnected())
    gsc = (
      await searchAnalytics(prop, {
        startDate: daysAgo(93),
        endDate: daysAgo(3),
        dimensions: ['query'],
        rowLimit: 30,
        filters: [{ dimension: 'page', operator: 'equals', expression: url }]
      })
    ).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      position: Math.round(r.position * 10) / 10
    }))
  const serp =
    serpConfigured() && c.focusKeyword
      ? await topResults(c.focusKeyword, site.country, langCode(site.language), ctx.signal)
      : []
  ctx.progress('mode-d', 'AI is suggesting improvements and writing the updated version')
  const r = await runChat(
    {
      task: 'writing',
      system: systemPrompt(site),
      prompt: prompt('mode-d', {
        business_name: profileOf(site).name,
        url,
        title: cur.title,
        gsc_queries: gsc,
        serp_results: serp,
        notes: c.notes || '(nothing)',
        current_html: cleanHtml(cur.html).slice(0, 60_000)
      }),
      schema: RefreshSchema,
      maxOutputTokens: 16000
    },
    { siteId: c.siteId, contentId: c.id, signal: ctx.signal, budgetOverride: ctx.budgetOverride }
  )
  // Save the original first, so the History tab shows before/after.
  updateContent(c.id, { bodyHtml: cleanHtml(cur.html), title: cur.title })
  saveVersion(c.id, 'Original live page (unchanged)')
  updateContent(
    c.id,
    {
      bodyHtml: cleanHtml(r.data.updated_html),
      title: r.data.title || cur.title,
      focusKeyword: c.focusKeyword || r.data.focus_keyword,
      research: { improvements: r.data.improvements } as Record<string, unknown>,
      refreshOfWpId: c.refreshOfWpId ?? page?.wpId ?? null,
      wpPostType: page?.wpType ?? null
    },
    'Updated version (new draft revision)'
  )
  await runChecks({ ...ctx, contentId: c.id })
  return { status: 'done' }
}

/* ---------------------------------------------------------------- Modes E and F (batches) */

function newPiece(
  siteId: number,
  mode: string,
  title: string,
  keyword: string,
  type: string,
  length: LengthKey,
  extra: Partial<typeof schema.content.$inferInsert> = {}
) {
  return createContent({
    siteId,
    mode,
    type,
    topic: keyword,
    title,
    focusKeyword: null,
    status: 'Idea',
    targetWords: LENGTHS[length].words || null,
    ...extra
  })
}

/** Batch mode: one research job per piece; each stops at "Owner chooses" and "Ready for review". */
export async function modeE(ctx: JobCtx): Promise<JobResult> {
  const site = getSite(ctx.siteId!)
  const topic = String(ctx.input.topic ?? '')
  const count = Math.min(8, Math.max(3, Number(ctx.input.count ?? 5)))
  ctx.progress('mode-e', 'Planning the pillar page and supporting posts')
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('mode-e', {
        topic,
        count,
        site_pages: sitePagesSummary(site.id),
        notes: String(ctx.input.notes ?? '(nothing)')
      }),
      schema: ClusterSchema
    },
    tctx(ctx)
  )
  const cluster = randomUUID()
  const length = (ctx.input.length as LengthKey) ?? 'standard'
  const pillar = newPiece(site.id, 'E', r.data.pillar.title, r.data.pillar.keyword, 'blog post', 'indepth', {
    clusterId: cluster,
    isPillar: true,
    notes: r.data.pillar.why
  })
  const ids = [pillar.id]
  for (const s of r.data.supporting.slice(0, count))
    ids.push(
      newPiece(site.id, 'E', s.title, s.keyword, 'blog post', length, { clusterId: cluster, notes: s.why }).id
    )
  for (const id of ids) enqueue({ type: 'research', siteId: site.id, contentId: id, input: {} })
  logActivity(
    site.id,
    `Planned a set: "${r.data.pillar.title}" + ${ids.length - 1} supporting posts`,
    '/content'
  )
  return { status: 'done', output: { cluster, contentIds: ids } }
}

export async function modeF(ctx: JobCtx): Promise<JobResult> {
  const site = getSite(ctx.siteId!)
  const areas = (ctx.input.areas as string[]) ?? []
  if (!areas.length) throw new UserError('List at least one town or area.')
  ctx.progress('mode-f', 'Planning a genuinely different page for each area')
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('mode-f', {
        topic: String(ctx.input.topic ?? ''),
        areas: areas.join(', '),
        business_profile: profileOf(site),
        notes: String(ctx.input.notes ?? '(nothing)')
      }),
      schema: LocalSchema
    },
    tctx(ctx)
  )
  const ids: number[] = []
  for (const p of r.data.pages)
    ids.push(
      newPiece(
        site.id,
        'F',
        p.title,
        p.keyword,
        'location page',
        (ctx.input.length as LengthKey) ?? 'standard',
        { notes: `Local angle: ${p.local_angle}` }
      ).id
    )
  for (const id of ids) enqueue({ type: 'research', siteId: site.id, contentId: id, input: {} })
  return { status: 'done', output: { contentIds: ids } }
}

/* ---------------------------------------------------------------- Mode G (calendar) */

export async function modeG(ctx: JobCtx): Promise<JobResult> {
  const site = getSite(ctx.siteId!)
  const months = Number(ctx.input.months ?? 6) === 12 ? 12 : 6
  const start = new Date()
  start.setMonth(start.getMonth() + 1, 1)
  const startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
  ctx.progress('mode-g', `Planning the next ${months} months`)
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('calendar', {
        months,
        start_month: startMonth,
        services: profileOf(site).topServices,
        site_pages: sitePagesSummary(site.id),
        gsc_queries: await gscQueriesFor(site, null, 365, ctx.signal),
        notes: String(ctx.input.notes ?? '(nothing)')
      }),
      schema: CalendarSchema,
      maxOutputTokens: 8000
    },
    tctx(ctx)
  )
  const db = getDb()
  if (ctx.input.replace)
    db.delete(schema.calendarItems)
      .where(
        and(
          eq(schema.calendarItems.siteId, site.id),
          eq(schema.calendarItems.status, 'planned'),
          gte(schema.calendarItems.month, startMonth)
        )
      )
      .run()
  let n = 0
  for (const m of r.data.months) {
    const month = /^\d{4}-\d{2}$/.test(m.month) ? m.month : startMonth
    db.insert(schema.calendarItems)
      .values({
        siteId: site.id,
        month,
        focus: m.focus,
        itemType: 'main',
        title: m.main.title,
        keyword: m.main.keyword,
        why: m.why_now
      })
      .run()
    n++
    for (const s of m.supporting.slice(0, 5)) {
      db.insert(schema.calendarItems)
        .values({
          siteId: site.id,
          month,
          focus: m.focus,
          itemType: 'supporting',
          title: s.title,
          keyword: s.keyword,
          why: m.why_now
        })
        .run()
      n++
    }
  }
  logActivity(site.id, `Content calendar planned (${months} months, ${n} items)`, '/plan')
  return { status: 'done', output: { items: n } }
}

/* ---------------------------------------------------------------- Spar with AI */

export async function sparChat(
  siteId: number,
  numbers: Record<string, string>,
  history: { role: 'user' | 'assistant'; content: string }[],
  message: string
): Promise<string> {
  const site = getSite(siteId)
  const r = await runChat(
    {
      task: 'research',
      system: `${systemPrompt(site)}\n\n${prompt('spar', { numbers, business_profile: profileOf(site) })}`,
      history,
      prompt: message,
      maxOutputTokens: 2000
    },
    { siteId }
  )
  return r.text
}

export async function sparConclude(
  siteId: number,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const site = getSite(siteId)
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('spar-conclude', {
        conversation: history
          .map((h) => `${h.role === 'user' ? 'Owner' : 'Advisor'}: ${h.content}`)
          .join('\n')
      }),
      schema: SparConclusionSchema
    },
    { siteId }
  )
  const notes = [site.strategyNotes, r.data.strategy_notes].filter(Boolean).join('\n\n')
  updateSite(siteId, { strategyNotes: notes })
  return r.data.strategy_notes
}

/** Start a Mode D refresh piece for a page. */
export function startRefresh(siteId: number, url: string, notes?: string): number {
  const page = getDb()
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.siteId, siteId), eq(schema.pages.url, url)))
    .get()
  const c = createContent({
    siteId,
    mode: 'D',
    type: 'refresh',
    status: 'Researching',
    topic: page?.title ?? url,
    title: page?.title ?? url,
    focusKeyword: page?.focusKeyword ?? null,
    refreshOfUrl: url,
    refreshOfWpId: page?.wpId ?? null,
    wpPostType: page?.wpType ?? null,
    notes: notes ?? null
  })
  enqueue({ type: 'refresh', siteId, contentId: c.id, input: {} })
  return c.id
}
