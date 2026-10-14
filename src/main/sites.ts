import { eq, desc } from 'drizzle-orm'
import { getDb, schema } from './db'
import { UserError } from './errors'
import { prompt } from './prompts'
import type { BusinessProfile, ImageStyle, SiteSettings } from '@shared/types'

export type SiteRow = typeof schema.sites.$inferSelect

export function listSites(): SiteRow[] {
  return getDb().select().from(schema.sites).orderBy(schema.sites.name).all()
}

export function getSite(id: number): SiteRow {
  const s = getDb().select().from(schema.sites).where(eq(schema.sites.id, id)).get()
  if (!s)
    throw new UserError("That website isn't in the app any more. Pick another one from the site switcher.")
  return s
}

export function profileOf(s: SiteRow): BusinessProfile {
  const p = (s.businessProfile ?? {}) as Partial<BusinessProfile>
  return {
    name: p.name ?? s.name,
    url: p.url ?? s.url,
    whatYouSell: p.whatYouSell ?? '',
    serviceArea: p.serviceArea ?? '',
    customerType: p.customerType ?? '',
    topServices: p.topServices ?? [],
    competitors: p.competitors ?? [],
    tone: p.tone ?? 'Friendly',
    language: p.language ?? s.language,
    country: p.country ?? s.country,
    mustNotSay: p.mustNotSay ?? '',
    callToAction: p.callToAction ?? '',
    facts: p.facts ?? ''
  }
}

export function settingsOf(s: SiteRow): SiteSettings {
  return (s.settings ?? {}) as SiteSettings
}

export function imageStyleOf(s: SiteRow): ImageStyle {
  const st = (s.imageStyle ?? {}) as Partial<ImageStyle>
  return {
    style: st.style ?? 'Photo-realistic',
    avoid: st.avoid ?? "no text in images, no logos, no real people's faces",
    brandColors: st.brandColors ?? '',
    labelAiImages: st.labelAiImages ?? true
  }
}

export function normalizeSiteUrl(url: string): string {
  let u = url.trim()
  if (!u) return u
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const x = new URL(u)
    return `${x.protocol}//${x.host}`
  } catch {
    throw new UserError(
      'That website address looks wrong. Type it like https://www.example.com and try again.'
    )
  }
}

export function createSite(profile: BusinessProfile): SiteRow {
  if (!profile.name.trim()) throw new UserError('Enter your business name.')
  const url = normalizeSiteUrl(profile.url)
  if (!url) throw new UserError('Enter your website address, like https://www.example.com.')
  const row = getDb()
    .insert(schema.sites)
    .values({
      name: profile.name.trim(),
      url,
      language: profile.language || 'English',
      country: profile.country || 'US',
      businessProfile: { ...profile, url } as unknown as Record<string, unknown>,
      settings: {
        defaultContentType: 'blog post',
        defaultLength: 'standard',
        indexNowEnabled: true
      } as Record<string, unknown>,
      imageStyle: imageStyleOf({ imageStyle: null } as SiteRow) as unknown as Record<string, unknown>
    })
    .returning()
    .get()
  return row
}

export function updateSite(
  id: number,
  patch: Partial<{
    profile: BusinessProfile
    strategyNotes: string
    voiceSamples: string[]
    imageStyle: ImageStyle
    exportFormat: string
    settings: Partial<SiteSettings>
  }>
): SiteRow {
  const s = getSite(id)
  const set: Partial<typeof schema.sites.$inferInsert> = { updatedAt: Date.now() }
  if (patch.profile) {
    const url = normalizeSiteUrl(patch.profile.url || s.url)
    set.businessProfile = { ...patch.profile, url } as unknown as Record<string, unknown>
    set.name = patch.profile.name || s.name
    set.url = url
    set.language = patch.profile.language || s.language
    set.country = patch.profile.country || s.country
  }
  if (patch.strategyNotes !== undefined) set.strategyNotes = patch.strategyNotes
  if (patch.voiceSamples) set.voiceSamples = patch.voiceSamples.slice(0, 3)
  if (patch.imageStyle) set.imageStyle = patch.imageStyle as unknown as Record<string, unknown>
  if (patch.exportFormat) set.exportFormat = patch.exportFormat
  if (patch.settings) set.settings = { ...(s.settings ?? {}), ...patch.settings } as Record<string, unknown>
  getDb().update(schema.sites).set(set).where(eq(schema.sites.id, id)).run()
  return getSite(id)
}

export function deleteSite(id: number): void {
  const db = getDb()
  db.transaction((tx) => {
    const contentIds = tx
      .select({ id: schema.content.id })
      .from(schema.content)
      .where(eq(schema.content.siteId, id))
      .all()
      .map((c) => c.id)
    for (const cid of contentIds)
      tx.delete(schema.contentVersions).where(eq(schema.contentVersions.contentId, cid)).run()
    const kwIds = tx
      .select({ id: schema.keywords.id })
      .from(schema.keywords)
      .where(eq(schema.keywords.siteId, id))
      .all()
      .map((k) => k.id)
    for (const k of kwIds) tx.delete(schema.rankHistory).where(eq(schema.rankHistory.keywordId, k)).run()
    tx.delete(schema.content).where(eq(schema.content.siteId, id)).run()
    tx.delete(schema.pages).where(eq(schema.pages.siteId, id)).run()
    tx.delete(schema.images).where(eq(schema.images.siteId, id)).run()
    tx.delete(schema.keywords).where(eq(schema.keywords.siteId, id)).run()
    tx.delete(schema.calendarItems).where(eq(schema.calendarItems.siteId, id)).run()
    tx.delete(schema.jobs).where(eq(schema.jobs.siteId, id)).run()
    tx.delete(schema.taskModels).where(eq(schema.taskModels.siteId, id)).run()
    tx.delete(schema.sites).where(eq(schema.sites.id, id)).run()
  })
}

/** The system prompt prepended to every AI task for this site. */
export function systemPrompt(s: SiteRow): string {
  const p = profileOf(s)
  const profileText = [
    `Business name: ${p.name}`,
    `Website: ${p.url}`,
    `What we sell: ${p.whatYouSell}`,
    `Service area: ${p.serviceArea}`,
    `Main customers: ${p.customerType}`,
    `Top products/services: ${p.topServices.join(', ')}`,
    p.callToAction ? `Preferred call to action: ${p.callToAction}` : '',
    p.facts ? `Other facts: ${p.facts}` : ''
  ]
    .filter(Boolean)
    .join('\n')
  return prompt('system-base', {
    business_name: p.name,
    business_description: p.whatYouSell || 'business',
    service_area: p.serviceArea || 'its customers',
    business_profile: profileText,
    strategy_notes: s.strategyNotes || '(none yet)',
    must_not_say: p.mustNotSay || '(nothing listed)',
    tone: p.tone.toLowerCase(),
    language: p.language,
    audience: p.customerType || 'its customers'
  })
}

export function logActivity(siteId: number | null, message: string, link?: string): void {
  getDb()
    .insert(schema.activity)
    .values({ siteId, message, link: link ?? null })
    .run()
}

export function recentActivity(siteId: number, limit = 20) {
  return getDb()
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.siteId, siteId))
    .orderBy(desc(schema.activity.id))
    .limit(limit)
    .all()
}
