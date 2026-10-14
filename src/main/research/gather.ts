import { eq } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { getSetting } from '../settings'
import { log } from '../logger'
import { expand, langCode } from './autocomplete'
import { dataForSeoConfigured, searchVolume, serp } from './dataforseo'
import { serpConfigured, topResults } from './serp'
import { gscConnected, searchAnalytics, daysAgo } from '../indexing/gsc'
import { words } from '../pipeline/text'
import type { SiteRow } from '../sites'
import { settingsOf } from '../sites'

export interface ResearchData {
  sitePages: string
  gscQueries: { query: string; clicks: number; impressions: number; position: number }[]
  keywordData: { keyword: string; volume: number | null; source: 'dataforseo' }[]
  serpResults: { position: number; url: string; title: string; snippet: string }[]
  autocomplete: string[]
  sourcesUsed: string[]
}

export function sitePagesSummary(siteId: number, limit = 150, withHeadings = false): string {
  const pages = getDb().select().from(schema.pages).where(eq(schema.pages.siteId, siteId)).all()
  if (!pages.length) return '(no pages crawled yet)'
  return pages
    .slice(0, limit)
    .map(
      (p) =>
        `${p.url} - ${p.title ?? ''}${withHeadings && p.headings?.length ? ` - [${p.headings.slice(0, 6).join(' | ')}]` : ''}${p.wordCount ? ` - ${p.wordCount} words` : ''}`
    )
    .join('\n')
}

export async function gscQueriesFor(
  site: SiteRow,
  topic: string | null,
  days = 90,
  signal?: AbortSignal
): Promise<ResearchData['gscQueries']> {
  const prop = settingsOf(site).gscProperty
  if (!prop || !gscConnected()) return []
  try {
    if (signal?.aborted) return []
    const rows = await searchAnalytics(prop, {
      startDate: daysAgo(days + 3),
      endDate: daysAgo(3),
      dimensions: ['query'],
      rowLimit: 1000
    })
    const all = rows.map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      position: Math.round(r.position * 10) / 10
    }))
    if (!topic) return all.slice(0, 80)
    const tokens = words(topic).filter((w) => w.length > 2)
    const related = all.filter((r) => tokens.some((t) => r.query.includes(t)))
    return [...related.slice(0, 60), ...all.filter((r) => !related.includes(r)).slice(0, 20)]
  } catch (e) {
    log.warn('GSC query pull failed', e)
    return []
  }
}

/** Collect everything the research model should see. Each source is optional. */
export async function gatherResearch(
  site: SiteRow,
  topic: string,
  signal?: AbortSignal,
  onStep?: (s: string) => void
): Promise<ResearchData> {
  const sourcesUsed = ['Your website']
  const lang = langCode(site.language)
  const country = site.country || 'US'
  onStep?.('Reading your site pages')
  const sitePages = sitePagesSummary(site.id)

  onStep?.('Checking Search Console')
  const gscQueries = await gscQueriesFor(site, topic, 90, signal)
  if (gscQueries.length) sourcesUsed.push('Google Search Console')

  let autocomplete: string[] = []
  if (getSetting('autocompleteEnabled')) {
    onStep?.('Collecting real search phrases (Google Autocomplete)')
    autocomplete = await expand(topic, lang, country.toLowerCase(), signal)
    if (autocomplete.length) sourcesUsed.push('Google Autocomplete')
  }

  let keywordData: ResearchData['keywordData'] = []
  if (dataForSeoConfigured()) {
    onStep?.('Getting search volumes (DataForSEO)')
    try {
      const vols = await searchVolume([topic, ...autocomplete.slice(0, 40)], country, site.language, signal)
      keywordData = vols.map((v) => ({ keyword: v.keyword, volume: v.volume, source: 'dataforseo' as const }))
      sourcesUsed.push('DataForSEO')
    } catch (e) {
      log.warn('DataForSEO volume failed', e)
    }
  }

  let serpResults: ResearchData['serpResults'] = []
  const sp = serpConfigured()
  try {
    if (sp) {
      onStep?.('Looking at the current top 10 results')
      serpResults = await topResults(topic, country, lang, signal)
      sourcesUsed.push(sp === 'serper' ? 'Serper.dev' : 'Brave Search')
    } else if (dataForSeoConfigured()) {
      onStep?.('Looking at the current top 10 results')
      serpResults = (await serp(topic, country, site.language, 'desktop', signal)).slice(0, 10)
    }
  } catch (e) {
    log.warn('SERP lookup failed', e)
  }
  return { sitePages, gscQueries, keywordData, serpResults, autocomplete, sourcesUsed }
}
