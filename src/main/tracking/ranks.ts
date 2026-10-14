import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { getSite, settingsOf } from '../sites'
import { gscConnected, searchAnalyticsAll, daysAgo } from '../indexing/gsc'
import { dataForSeoConfigured, rankCheck } from '../research/dataforseo'
import { normalize } from '../pipeline/text'
import { notifyUser } from '../notify'
import { toCsv } from '../publish/export'
import { UserError } from '../errors'
import { log } from '../logger'

export type KeywordRow = typeof schema.keywords.$inferSelect

export function addKeyword(
  siteId: number,
  keyword: string,
  opts: {
    group?: string | null
    targetUrl?: string | null
    source?: string
    location?: string | null
    device?: string | null
  } = {}
): KeywordRow {
  const kw = keyword.trim()
  if (!kw) throw new UserError('Type a keyword to track.')
  const db = getDb()
  const existing = db
    .select()
    .from(schema.keywords)
    .where(eq(schema.keywords.siteId, siteId))
    .all()
    .find((k) => normalize(k.keyword) === normalize(kw))
  if (existing) {
    if ((opts.group && !existing.groupName) || (opts.targetUrl && !existing.targetPageUrl))
      db.update(schema.keywords)
        .set({
          groupName: existing.groupName || opts.group || null,
          targetPageUrl: existing.targetPageUrl || opts.targetUrl || null
        })
        .where(eq(schema.keywords.id, existing.id))
        .run()
    return existing
  }
  return db
    .insert(schema.keywords)
    .values({
      siteId,
      keyword: kw,
      groupName: opts.group ?? null,
      targetPageUrl: opts.targetUrl ?? null,
      source: opts.source ?? 'Manual',
      location: opts.location ?? null,
      device: opts.device ?? null
    })
    .returning()
    .get()
}

export function removeKeyword(id: number): void {
  const db = getDb()
  db.delete(schema.rankHistory).where(eq(schema.rankHistory.keywordId, id)).run()
  db.delete(schema.keywords).where(eq(schema.keywords.id, id)).run()
}

export function updateKeyword(
  id: number,
  patch: { groupName?: string | null; targetPageUrl?: string | null }
): void {
  getDb()
    .update(schema.keywords)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.keywords.id, id))
    .run()
}

export type HistoryRow = typeof schema.rankHistory.$inferSelect

function historyFor(ids: number[]): Map<number, HistoryRow[]> {
  const m = new Map<number, HistoryRow[]>()
  if (!ids.length) return m
  const rows = getDb()
    .select()
    .from(schema.rankHistory)
    .where(inArray(schema.rankHistory.keywordId, ids))
    .orderBy(asc(schema.rankHistory.date))
    .all()
  for (const r of rows) {
    if (!m.has(r.keywordId)) m.set(r.keywordId, [])
    m.get(r.keywordId)!.push(r)
  }
  return m
}

/** Position on or before a date (prefers GSC/DataForSEO over manual for the same day). */
function positionAt(h: HistoryRow[], date: string, windowDays = 7): number | null {
  const lo = new Date(new Date(date).getTime() - windowDays * 86_400_000).toISOString().slice(0, 10)
  const inWin = h.filter((r) => r.date <= date && r.date >= lo && r.position !== null)
  if (!inWin.length) return null
  const lastDate = inWin[inWin.length - 1].date
  const sameDay = inWin.filter((r) => r.date === lastDate)
  return sameDay.reduce((n, r) => n + (r.position ?? 0), 0) / sameDay.length
}

export function listKeywords(siteId: number) {
  const kws = getDb()
    .select()
    .from(schema.keywords)
    .where(eq(schema.keywords.siteId, siteId))
    .orderBy(asc(schema.keywords.keyword))
    .all()
  const hist = historyFor(kws.map((k) => k.id))
  const today = new Date().toISOString().slice(0, 10)
  const ago28 = daysAgo(28)
  return kws.map((k) => {
    const h = hist.get(k.id) ?? []
    const now = positionAt(h, today, 10)
    const then = positionAt(h, ago28, 10)
    const last28 = h.filter((r) => r.date >= ago28)
    return {
      ...k,
      position: now === null ? null : Math.round(now * 10) / 10,
      change28: now !== null && then !== null ? Math.round((then - now) * 10) / 10 : null,
      clicks28: last28.reduce((n, r) => n + (r.clicks ?? 0), 0),
      impressions28: last28.reduce((n, r) => n + (r.impressions ?? 0), 0),
      latestSource: h.length ? h[h.length - 1].source : null,
      points: h.length
    }
  })
}

/** Positive change = moved up (smaller position number). */
export function winnersLosers(siteId: number) {
  const all = listKeywords(siteId).filter((k) => k.change28 !== null)
  return {
    winners: all
      .filter((k) => k.change28! > 0)
      .sort((a, b) => b.change28! - a.change28!)
      .slice(0, 10),
    losers: all
      .filter((k) => k.change28! < 0)
      .sort((a, b) => a.change28! - b.change28!)
      .slice(0, 10)
  }
}

export function averagePositionChange(siteId: number): number | null {
  const all = listKeywords(siteId).filter((k) => k.change28 !== null)
  if (!all.length) return null
  return Math.round((all.reduce((n, k) => n + k.change28!, 0) / all.length) * 10) / 10
}

export function chartData(keywordId: number) {
  const k = getDb().select().from(schema.keywords).where(eq(schema.keywords.id, keywordId)).get()
  if (!k) throw new UserError('That keyword is no longer tracked.')
  const h = historyFor([keywordId]).get(keywordId) ?? []
  const byDate = new Map<
    string,
    { date: string; position: number | null; clicks: number; impressions: number; source: string }
  >()
  for (const r of h) {
    const prev = byDate.get(r.date)
    if (!prev || r.source === 'GSC' || r.source === 'DataForSEO')
      byDate.set(r.date, {
        date: r.date,
        position: r.position,
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        source: r.source
      })
  }
  // publish markers: related content going live (same keyword or same group)
  const content = getDb().select().from(schema.content).where(eq(schema.content.siteId, k.siteId)).all()
  const nk = normalize(k.keyword)
  const groupContent = new Set(
    k.groupName
      ? content
          .filter(
            (c) =>
              c.clusterId &&
              content.some(
                (p) =>
                  p.clusterId === c.clusterId &&
                  p.isPillar &&
                  (p.title === k.groupName || p.focusKeyword === k.groupName)
              )
          )
          .map((c) => c.id)
      : []
  )
  const markers = content
    .filter(
      (c) =>
        c.publishedAt &&
        (normalize(c.focusKeyword ?? '') === nk ||
          (c.secondaryKeywords ?? []).some((s) => normalize(s) === nk) ||
          groupContent.has(c.id))
    )
    .map((c) => ({
      date: new Date(c.publishedAt!).toISOString().slice(0, 10),
      title: c.title ?? '',
      contentId: c.id
    }))
  return { keyword: k, series: [...byDate.values()], markers }
}

function upsertHistory(
  keywordId: number,
  date: string,
  v: { position: number | null; clicks?: number | null; impressions?: number | null; ctr?: number | null },
  source: string
): void {
  const db = getDb()
  const existing = db
    .select()
    .from(schema.rankHistory)
    .where(
      and(
        eq(schema.rankHistory.keywordId, keywordId),
        eq(schema.rankHistory.date, date),
        eq(schema.rankHistory.source, source)
      )
    )
    .get()
  const values = {
    position: v.position,
    clicks: v.clicks ?? null,
    impressions: v.impressions ?? null,
    ctr: v.ctr ?? null,
    updatedAt: Date.now()
  }
  if (existing) db.update(schema.rankHistory).set(values).where(eq(schema.rankHistory.id, existing.id)).run()
  else
    db.insert(schema.rankHistory)
      .values({ keywordId, date, source, ...values })
      .run()
}

/** Snapshot positions, run a data pull, then alert on big moves. */
async function withAlerts(siteId: number, fn: () => Promise<number>): Promise<number> {
  const before = new Map(listKeywords(siteId).map((k) => [k.id, k.position]))
  const n = await fn()
  for (const k of listKeywords(siteId)) {
    const prev = before.get(k.id)
    const now = k.position
    if (prev === null || prev === undefined || now === null) continue
    if (prev > 10 && now <= 10 && now > 3)
      notifyUser(
        siteId,
        'rank',
        `"${k.keyword}" moved into the top 10`,
        `Now at position ${now} (was ${prev}).`,
        '/keywords'
      )
    if (prev > 3 && now <= 3)
      notifyUser(
        siteId,
        'rank',
        `"${k.keyword}" moved into the top 3`,
        `Now at position ${now} (was ${prev}).`,
        '/keywords'
      )
    if (now - prev > 5)
      notifyUser(
        siteId,
        'rank',
        `"${k.keyword}" dropped ${Math.round(now - prev)} places`,
        `Now at position ${now} (was ${prev}). Consider a refresh.`,
        '/keywords'
      )
  }
  return n
}

/** Pull daily average position, clicks, impressions and CTR per tracked query from Search Console. */
export async function pullGscRanks(siteId: number, days?: number): Promise<number> {
  const site = getSite(siteId)
  const prop = settingsOf(site).gscProperty
  if (!prop || !gscConnected()) return 0
  const kws = getDb().select().from(schema.keywords).where(eq(schema.keywords.siteId, siteId)).all()
  if (!kws.length) return 0
  const anyHistory = getDb()
    .select()
    .from(schema.rankHistory)
    .where(
      and(
        inArray(
          schema.rankHistory.keywordId,
          kws.map((k) => k.id)
        ),
        eq(schema.rankHistory.source, 'GSC')
      )
    )
    .limit(1)
    .get()
  // first connect: last 16 months
  const span = days ?? (anyHistory ? 10 : 486)
  return withAlerts(siteId, async () => {
    const rows = await searchAnalyticsAll(
      prop,
      { startDate: daysAgo(span), endDate: daysAgo(2), dimensions: ['date', 'query'] },
      250_000
    )
    const map = new Map(kws.map((k) => [normalize(k.keyword), k.id]))
    let n = 0
    getDb().transaction(() => {
      for (const r of rows) {
        const id = map.get(normalize(r.keys[1]))
        if (!id) continue
        upsertHistory(
          id,
          r.keys[0],
          {
            position: Math.round(r.position * 10) / 10,
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr
          },
          'GSC'
        )
        n++
      }
    })
    log.info(`Imported ${n} GSC rank rows for site ${siteId}`)
    return n
  })
}

/** Exact positions from DataForSEO (optional, paid), city-level for local businesses. */
export async function checkRanksDataForSeo(siteId: number): Promise<number> {
  if (!dataForSeoConfigured())
    throw new UserError('DataForSEO is not connected. Add it in Settings > Data Sources.')
  const site = getSite(siteId)
  const st = settingsOf(site)
  const kws = getDb().select().from(schema.keywords).where(eq(schema.keywords.siteId, siteId)).all()
  const today = new Date().toISOString().slice(0, 10)
  return withAlerts(siteId, async () => {
    let n = 0
    for (const k of kws) {
      const r = await rankCheck(
        k.keyword,
        site.url,
        k.location || st.rankLocation || site.country,
        site.language,
        (k.device as 'desktop' | 'mobile') || st.rankDevice || 'desktop'
      )
      upsertHistory(k.id, today, { position: r.position }, 'DataForSEO')
      n++
    }
    return n
  })
}

export function addManualRank(keywordId: number, date: string, position: number): void {
  upsertHistory(keywordId, date, { position }, 'Manual')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const t = text.replace(/^\uFEFF/, '')
  const delim =
    (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0)
      ? ';'
      : t.split('\n')[0].includes('\t') && !t.split('\n')[0].includes(',')
        ? '\t'
        : ','
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

function toIsoDate(s: string): string | null {
  const v = s.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  const m = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), m[3]]
    const [mo, d] = a > 12 ? [b, a] : [a, b]
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Import keywords (and positions, if present) from Wincher/SEMrush/Ahrefs-style CSVs. */
export function importCsv(siteId: number, text: string): { keywords: number; positions: number } {
  const rows = parseCsv(text)
  if (rows.length < 2)
    throw new UserError('That CSV looks empty. It needs a header row and at least one keyword.')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...names: RegExp[]) => header.findIndex((h) => names.some((n) => n.test(h)))
  const kc = col(/^keyword$/, /keyword/, /^query$/, /search term/, /^term$/)
  if (kc < 0)
    throw new UserError(
      'Couldn\'t find a "Keyword" column in the CSV. Make sure the first row has column names, including Keyword.'
    )
  const pc = col(/^position$/, /^current position$/, /^rank$/, /^pos/, /position/, /rank/)
  const dc = col(/^date$/, /^day$/, /date/)
  const uc = col(/^url$/, /landing/, /url/)
  const gc = col(/^group$/, /tag/, /group/)
  const clc = col(/^clicks$/)
  const ic = col(/^impressions$/)
  const today = new Date().toISOString().slice(0, 10)
  const seen = new Set<number>()
  let positions = 0
  getDb().transaction(() => {
    for (const r of rows.slice(1)) {
      const kw = r[kc]?.trim()
      if (!kw) continue
      const k = addKeyword(siteId, kw, {
        group: gc >= 0 ? r[gc]?.trim() || null : null,
        targetUrl: uc >= 0 ? r[uc]?.trim() || null : null,
        source: 'CSV'
      })
      seen.add(k.id)
      const pos = pc >= 0 ? Number(String(r[pc]).replace(',', '.')) : NaN
      if (Number.isFinite(pos) && pos > 0) {
        const date = (dc >= 0 && toIsoDate(r[dc] ?? '')) || today
        upsertHistory(
          k.id,
          date,
          {
            position: pos,
            clicks: clc >= 0 ? Number(r[clc]) || null : null,
            impressions: ic >= 0 ? Number(r[ic]) || null : null
          },
          'CSV'
        )
        positions++
      }
    }
  })
  return { keywords: seen.size, positions }
}

export function exportCsv(siteId: number): string {
  const kws = getDb().select().from(schema.keywords).where(eq(schema.keywords.siteId, siteId)).all()
  const hist = historyFor(kws.map((k) => k.id))
  const rows: unknown[][] = [
    ['keyword', 'group', 'target_url', 'date', 'position', 'clicks', 'impressions', 'ctr', 'source']
  ]
  for (const k of kws) {
    const h = hist.get(k.id) ?? []
    if (!h.length) rows.push([k.keyword, k.groupName, k.targetPageUrl, '', '', '', '', '', ''])
    for (const r of h)
      rows.push([
        k.keyword,
        k.groupName,
        k.targetPageUrl,
        r.date,
        r.position,
        r.clicks,
        r.impressions,
        r.ctr,
        r.source
      ])
  }
  return toCsv(rows)
}

/** Auto-track a published piece's focus and secondary keywords. */
export function trackContentKeywords(contentId: number): void {
  const db = getDb()
  const c = db.select().from(schema.content).where(eq(schema.content.id, contentId)).get()
  if (!c) return
  let group: string | null = null
  if (c.clusterId) {
    const pillar = db
      .select()
      .from(schema.content)
      .where(and(eq(schema.content.clusterId, c.clusterId), eq(schema.content.isPillar, true)))
      .get()
    group = pillar?.title ?? pillar?.focusKeyword ?? null
  }
  for (const kw of [c.focusKeyword, ...(c.secondaryKeywords ?? [])].filter(Boolean) as string[])
    addKeyword(c.siteId, kw, { group, targetUrl: c.liveUrl, source: 'Auto' })
}

export function recentHistory(siteId: number, limit = 200) {
  const ids = getDb()
    .select({ id: schema.keywords.id })
    .from(schema.keywords)
    .where(eq(schema.keywords.siteId, siteId))
    .all()
    .map((k) => k.id)
  if (!ids.length) return []
  return getDb()
    .select()
    .from(schema.rankHistory)
    .where(inArray(schema.rankHistory.keywordId, ids))
    .orderBy(desc(schema.rankHistory.date))
    .limit(limit)
    .all()
}
