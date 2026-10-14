import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { getDb, schema } from './db'
import { monthSpend } from './ai'
import { averagePositionChange } from './tracking/ranks'
import { recentActivity } from './sites'
import { normalizeUrl } from './pipeline/seo-checks'
import { titleSimilarity, normalize } from './pipeline/text'

export function getDashboard(siteId: number) {
  const db = getDb()
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const content = db.select().from(schema.content).where(eq(schema.content.siteId, siteId)).all()
  const kwCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.keywords)
      .where(eq(schema.keywords.siteId, siteId))
      .get()?.n ?? 0
  const latestSuggestions = db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.siteId, siteId),
        inArray(schema.jobs.type, ['mode-b', 'mode-c']),
        eq(schema.jobs.status, 'done')
      )
    )
    .orderBy(desc(schema.jobs.id))
    .get()
  const sugg = (
    (latestSuggestions?.output as { suggestions?: Record<string, unknown>[] } | null)?.suggestions ?? []
  ).slice(0, 3)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const upcoming = db
    .select()
    .from(schema.calendarItems)
    .where(and(eq(schema.calendarItems.siteId, siteId), gte(schema.calendarItems.month, thisMonth)))
    .orderBy(schema.calendarItems.month)
    .limit(8)
    .all()
    .filter((i) => i.status !== 'done')
  return {
    cards: {
      draftsWaiting: content.filter((c) => c.status === 'Ready for review').length,
      publishedThisMonth: content.filter((c) => c.publishedAt && c.publishedAt >= monthStart.getTime())
        .length,
      keywordsTracked: kwCount,
      avgPositionChange: averagePositionChange(siteId),
      aiSpendThisMonth: Math.round(monthSpend(siteId) * 100) / 100
    },
    suggestions: {
      from: latestSuggestions?.type ?? null,
      at: latestSuggestions?.updatedAt ?? null,
      items: sugg
    },
    activity: recentActivity(siteId, 15),
    upcoming
  }
}

export function siteHealth(siteId: number) {
  const pages = getDb().select().from(schema.pages).where(eq(schema.pages.siteId, siteId)).all()
  const inbound = new Map<string, number>()
  for (const p of pages)
    for (const l of p.internalLinks ?? []) {
      const k = normalizeUrl(l)
      if (k !== normalizeUrl(p.url)) inbound.set(k, (inbound.get(k) ?? 0) + 1)
    }
  const titleCount = new Map<string, number>()
  for (const p of pages)
    if (p.title) titleCount.set(normalize(p.title), (titleCount.get(normalize(p.title)) ?? 0) + 1)
  const audit = pages.map((p) => {
    const issues: string[] = []
    if ((p.statusCode ?? 200) >= 400) issues.push(`Returns error ${p.statusCode}`)
    if (!p.title) issues.push('Missing title')
    else if (p.title.length > 60) issues.push(`Title is long (${p.title.length} characters)`)
    else if ((titleCount.get(normalize(p.title)) ?? 0) > 1) issues.push('Same title as another page')
    if (!p.metaDescription) issues.push('Missing meta description')
    else if (p.metaDescription.length < 70 || p.metaDescription.length > 160)
      issues.push(`Meta description is ${p.metaDescription.length} characters`)
    if (!p.h1) issues.push('Missing H1')
    if ((p.wordCount ?? 0) < 300) issues.push(`Thin content (${p.wordCount ?? 0} words)`)
    const inb = inbound.get(normalizeUrl(p.url)) ?? 0
    if (inb === 0 && pages.length > 1) issues.push('No internal links point here (orphan page)')
    if (p.canonical && normalizeUrl(p.canonical, p.url) !== normalizeUrl(p.url))
      issues.push('Canonical points to another URL')
    return {
      id: p.id,
      url: p.url,
      title: p.title,
      wordCount: p.wordCount,
      statusCode: p.statusCode,
      inbound: inb,
      outbound: (p.internalLinks ?? []).length,
      issues,
      source: p.source,
      wpId: p.wpId
    }
  })
  // cannibalization: pages chasing the same search
  const groups: { reason: string; urls: string[] }[] = []
  const seen = new Set<number>()
  for (let i = 0; i < pages.length; i++) {
    if (seen.has(i)) continue
    const a = pages[i]
    const g = [a.url]
    let reason = ''
    for (let j = i + 1; j < pages.length; j++) {
      const b = pages[j]
      if (a.focusKeyword && b.focusKeyword && normalize(a.focusKeyword) === normalize(b.focusKeyword)) {
        reason = `Both target "${a.focusKeyword}"`
      } else if (a.title && b.title && titleSimilarity(a.title, b.title) >= 0.75) {
        reason = 'Near-identical titles'
      } else if (a.h1 && b.h1 && titleSimilarity(a.h1, b.h1) >= 0.8) {
        reason = 'Near-identical H1 headings'
      } else continue
      g.push(b.url)
      seen.add(j)
    }
    if (g.length > 1) groups.push({ reason, urls: g })
  }
  const lastCrawled = pages.reduce((m, p) => Math.max(m, p.lastCrawledAt ?? 0), 0)
  return {
    pages: audit,
    cannibalization: groups,
    orphans: audit.filter((a) => a.inbound === 0).length,
    issues: audit.reduce((n, a) => n + a.issues.length, 0),
    lastCrawled: lastCrawled || null
  }
}

export function usageSummary(month?: string) {
  const rows = getDb().select().from(schema.aiUsage).all()
  const sites = new Map(
    getDb()
      .select()
      .from(schema.sites)
      .all()
      .map((s) => [s.id, s.name])
  )
  const filtered = month
    ? rows.filter((r) => new Date(r.createdAt).toISOString().slice(0, 7) === month)
    : rows
  const agg = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<
      string,
      { key: string; cost: number; calls: number; inputTokens: number; outputTokens: number; images: number }
    >()
    for (const r of filtered) {
      const k = key(r)
      const e = m.get(k) ?? { key: k, cost: 0, calls: 0, inputTokens: 0, outputTokens: 0, images: 0 }
      e.cost += r.costUsd
      e.calls++
      e.inputTokens += r.inputTokens
      e.outputTokens += r.outputTokens
      e.images += r.images
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost)
  }
  const months = [...new Set(rows.map((r) => new Date(r.createdAt).toISOString().slice(0, 7)))]
    .sort()
    .reverse()
  return {
    months,
    total: filtered.reduce((n, r) => n + r.costUsd, 0),
    byProvider: agg((r) => r.providerId),
    byModel: agg((r) => `${r.providerId} / ${r.modelId}`),
    byTask: agg((r) => r.task),
    bySite: agg((r) => (r.siteId ? (sites.get(r.siteId) ?? `Site ${r.siteId}`) : 'No site')),
    byMonth: agg((r) => new Date(r.createdAt).toISOString().slice(0, 7))
  }
}

export function usageCsvRows() {
  const rows = getDb().select().from(schema.aiUsage).orderBy(schema.aiUsage.id).all()
  return [
    [
      'date',
      'site_id',
      'provider',
      'model',
      'task',
      'input_tokens',
      'output_tokens',
      'images',
      'cost_usd',
      'content_id'
    ],
    ...rows.map((r) => [
      new Date(r.createdAt).toISOString(),
      r.siteId,
      r.providerId,
      r.modelId,
      r.task,
      r.inputTokens,
      r.outputTokens,
      r.images,
      r.costUsd.toFixed(6),
      r.contentId
    ])
  ]
}
