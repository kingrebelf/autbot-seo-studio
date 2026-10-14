import { and, desc, eq, ne, inArray } from 'drizzle-orm'
import { getDb, schema } from './db'
import { UserError } from './errors'
import { getSite, profileOf, logActivity } from './sites'
import { runSeoChecks, type ExistingPage } from './pipeline/seo-checks'
import { analyze } from './pipeline/html'
import type { ContentStatus } from '@shared/types'

export type ContentRow = typeof schema.content.$inferSelect

export function getContent(id: number): ContentRow {
  const c = getDb().select().from(schema.content).where(eq(schema.content.id, id)).get()
  if (!c) throw new UserError('That piece of content no longer exists. It may have been deleted.')
  return c
}

export function listContent(siteId: number) {
  return getDb()
    .select({
      id: schema.content.id,
      title: schema.content.title,
      topic: schema.content.topic,
      type: schema.content.type,
      status: schema.content.status,
      mode: schema.content.mode,
      focusKeyword: schema.content.focusKeyword,
      seoScore: schema.content.seoScore,
      bodyHtml: schema.content.bodyHtml,
      clusterId: schema.content.clusterId,
      isPillar: schema.content.isPillar,
      updatedAt: schema.content.updatedAt,
      createdAt: schema.content.createdAt,
      publishedAt: schema.content.publishedAt
    })
    .from(schema.content)
    .where(eq(schema.content.siteId, siteId))
    .orderBy(desc(schema.content.updatedAt))
    .all()
    .map(({ bodyHtml, ...r }) => ({ ...r, wordCount: bodyHtml ? analyze(bodyHtml).wordCount : 0 }))
}

export function createContent(
  values: Partial<typeof schema.content.$inferInsert> & { siteId: number }
): ContentRow {
  return getDb().insert(schema.content).values(values).returning().get()
}

export function setStatus(id: number, status: ContentStatus): void {
  getDb().update(schema.content).set({ status, updatedAt: Date.now() }).where(eq(schema.content.id, id)).run()
}

const META_FIELDS = [
  'title',
  'seoTitle',
  'metaDescription',
  'slug',
  'focusKeyword',
  'secondaryKeywords',
  'excerpt',
  'categories',
  'tags'
] as const

export function updateContent(
  id: number,
  patch: Partial<typeof schema.content.$inferInsert>,
  versionNote?: string
): ContentRow {
  const before = getContent(id)
  getDb()
    .update(schema.content)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.content.id, id))
    .run()
  const after = getContent(id)
  if (
    versionNote &&
    (before.bodyHtml !== after.bodyHtml ||
      META_FIELDS.some((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f])) ||
      latestVersionBody(id) !== after.bodyHtml)
  )
    saveVersion(id, versionNote)
  return after
}

/** Body of the newest saved version (edits since then are not in History yet). */
function latestVersionBody(id: number): string | null | undefined {
  return getDb()
    .select({ b: schema.contentVersions.bodyHtml })
    .from(schema.contentVersions)
    .where(eq(schema.contentVersions.contentId, id))
    .orderBy(desc(schema.contentVersions.id))
    .get()?.b
}

export function saveVersion(id: number, note: string): void {
  const c = getContent(id)
  const meta: Record<string, unknown> = {}
  for (const f of META_FIELDS) meta[f] = c[f]
  getDb().insert(schema.contentVersions).values({ contentId: id, bodyHtml: c.bodyHtml, meta, note }).run()
}

export function listVersions(id: number) {
  return getDb()
    .select()
    .from(schema.contentVersions)
    .where(eq(schema.contentVersions.contentId, id))
    .orderBy(desc(schema.contentVersions.id))
    .all()
}

export function restoreVersion(contentId: number, versionId: number): ContentRow {
  const v = getDb()
    .select()
    .from(schema.contentVersions)
    .where(and(eq(schema.contentVersions.id, versionId), eq(schema.contentVersions.contentId, contentId)))
    .get()
  if (!v) throw new UserError("That version couldn't be found.")
  saveVersion(contentId, 'Before restoring an older version')
  const meta = (v.meta ?? {}) as Partial<ContentRow>
  const patch: Partial<typeof schema.content.$inferInsert> = { bodyHtml: v.bodyHtml }
  for (const f of META_FIELDS) if (f in meta) (patch as Record<string, unknown>)[f] = meta[f]
  return updateContent(contentId, patch)
}

export function deleteContent(id: number): void {
  const db = getDb()
  db.delete(schema.contentVersions).where(eq(schema.contentVersions.contentId, id)).run()
  db.update(schema.images).set({ contentId: null }).where(eq(schema.images.contentId, id)).run()
  db.update(schema.calendarItems)
    .set({ contentId: null, status: 'planned' })
    .where(eq(schema.calendarItems.contentId, id))
    .run()
  db.delete(schema.jobs).where(eq(schema.jobs.contentId, id)).run()
  db.delete(schema.content).where(eq(schema.content.id, id)).run()
}

/** Every other page on the site (crawl + WordPress + other content in the app). */
export function existingPages(siteId: number, excludeContentId?: number | null): ExistingPage[] {
  const db = getDb()
  const pages: ExistingPage[] = db
    .select()
    .from(schema.pages)
    .where(eq(schema.pages.siteId, siteId))
    .all()
    .map((p) => ({
      url: p.url,
      title: p.title,
      h1: p.h1,
      focusKeyword: p.focusKeyword,
      paragraphs: p.paragraphs ?? []
    }))
  const others = db
    .select()
    .from(schema.content)
    .where(
      excludeContentId
        ? and(eq(schema.content.siteId, siteId), ne(schema.content.id, excludeContentId))
        : eq(schema.content.siteId, siteId)
    )
    .all()
    .filter((c) => c.focusKeyword || c.title)
  const site = getSite(siteId)
  for (const c of others) {
    const url = c.liveUrl || `${site.url}/${c.slug || `draft-${c.id}`}`
    if (c.liveUrl && pages.some((p) => p.url === c.liveUrl)) {
      const p = pages.find((x) => x.url === c.liveUrl)!
      p.focusKeyword = p.focusKeyword || c.focusKeyword
      continue
    }
    if (c.status === 'Idea' || c.status === 'Researching' || c.status === 'Awaiting choice') {
      if (c.focusKeyword)
        pages.push({
          url: `(in progress) ${c.title || c.focusKeyword}`,
          title: c.title,
          focusKeyword: c.focusKeyword,
          paragraphs: []
        })
      continue
    }
    pages.push({
      url,
      title: c.title,
      focusKeyword: c.focusKeyword,
      paragraphs: c.bodyHtml ? analyze(c.bodyHtml).paragraphs : []
    })
  }
  return pages
}

export function pillarUrlFor(c: ContentRow): string | null {
  if (!c.clusterId || c.isPillar) return null
  const p = getDb()
    .select()
    .from(schema.content)
    .where(and(eq(schema.content.clusterId, c.clusterId), eq(schema.content.isPillar, true)))
    .get()
  if (!p) return null
  const site = getSite(c.siteId)
  return p.liveUrl || `${site.url}/${p.slug || ''}`
}

/** Run the deterministic SEO checks and store the score. */
export function scoreContent(id: number) {
  const c = getContent(id)
  const site = getSite(c.siteId)
  const checks = (c.checks ?? {}) as Record<string, unknown>
  const r = runSeoChecks({
    html: c.bodyHtml ?? '',
    title: c.title,
    seoTitle: c.seoTitle,
    metaDescription: c.metaDescription,
    slug: c.slug,
    focusKeyword: c.focusKeyword,
    targetWords: c.targetWords,
    siteUrl: site.url,
    pillarUrl: pillarUrlFor(c),
    schemaJson: c.schema,
    existingPages: existingPages(c.siteId, c.id),
    dismissedConfirms: Boolean(checks.confirmsDismissed),
    refreshOfUrl: c.refreshOfUrl
  })
  getDb()
    .update(schema.content)
    .set({
      seoScore: r.score,
      checks: {
        ...checks,
        seo: r.checks,
        wordCount: r.analysis.wordCount,
        flesch: r.checks.find((x) => x.id === 'readability')?.detail
      }
    })
    .where(eq(schema.content.id, id))
    .run()
  return { score: r.score, checks: r.checks, wordCount: r.analysis.wordCount, confirms: r.analysis.confirms }
}

/** Facts the owner hasn't confirmed block sending until resolved or explicitly dismissed. */
export function unresolvedConfirms(c: ContentRow): string[] {
  const checks = (c.checks ?? {}) as { confirmsDismissed?: boolean }
  if (checks.confirmsDismissed) return []
  return analyze(c.bodyHtml ?? '').confirms
}

export function assertSendable(c: ContentRow): void {
  const left = unresolvedConfirms(c)
  if (left.length)
    throw new UserError(
      `There ${left.length === 1 ? 'is 1 fact' : `are ${left.length} facts`} still marked [CONFIRM] (${left.slice(0, 2).join('; ')}). Fill them in, or click "Dismiss placeholders" in the Checks tab, before sending.`,
      'confirm_block'
    )
}

export function contentForSite(siteId: number, ids: number[]) {
  if (!ids.length) return []
  return getDb()
    .select()
    .from(schema.content)
    .where(and(eq(schema.content.siteId, siteId), inArray(schema.content.id, ids)))
    .all()
}

export function profileFor(c: ContentRow) {
  return profileOf(getSite(c.siteId))
}

export function noteActivity(c: ContentRow, msg: string): void {
  logActivity(c.siteId, msg, `/content/${c.id}`)
}
